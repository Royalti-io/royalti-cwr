/**
 * Builds a CWR 2.2 file from template rows.
 *
 * The rows say what the works are; the caller says who is sending (no clock is read here, so the dates and times come in too).
 * The header, the group header, the group and file trailers and every count and sequence number come from this module and the
 * engine's `renumber`, never from the sheet. Rows with problems are refused: `buildDoc` throws a `BuildError` that lists them.
 */

import { analyse } from './analyse';
import { cleanCell } from './csv';
import type { PartyModel, WorkModel } from './analyse';
import type { RowProblem } from './csv';
import { prefix, writeRecord } from './records';
import type { FieldValues } from './records';
import type { TemplateRow } from './template';
import { MODIFIER_ROLES, hasNonAscii, textProblem, writtenLength } from './values';
import { parse } from '../model/parse';
import { encodeText } from '../model/text';
import type { CwrDoc } from '../model/types';
import { isRealDate, isRealTime } from '../rules/util';
import { RIGHTS } from '../rules/work';
import { renumber } from '../write/edit';
import { serialize } from '../write/serialize';
import { checkRows } from './checkRows';

export interface BuildHeader {
  /** The kind of sender: PB, SO, WR or AA, or two digits when the sender code is an 11-digit number. */
  senderType: string;
  /** The sender's own code, up to nine digits. The caller gets it from their society or administrator; this module never makes one up. */
  senderId: string;
  /** The sender's name, up to 45 characters. */
  senderName: string;
  /** `YYYYMMDD` or `YYYY-MM-DD`. */
  creationDate: string;
  /** `HHMMSS` or `HH:MM:SS`. */
  creationTime: string;
  /** `YYYYMMDD` or `YYYY-MM-DD`. */
  transmissionDate: string;
  /**
   * Needed when the text has a letter outside plain ASCII. The file is then written as UTF-8, so the only name accepted is UTF-8
   * (any capitals, with or without the dash). Leave it out when the text is plain ASCII.
   */
  characterSet?: string;
  /** Name and version of the software that made the file, up to 30 characters each. Default: `ROYALTI CWR` and no version. */
  softwarePackage?: string;
  softwarePackageVersion?: string;
}

export interface HeaderProblem {
  /** The `BuildHeader` field the problem is about. */
  field: keyof BuildHeader;
  code: string;
  message: string;
}

export interface BuildResult {
  /** The built file, parsed as CWR 2.2. */
  doc: CwrDoc;
  /** The file's text, records ending in CR LF. */
  text: string;
}

/** Thrown by `buildDoc` when the rows or the header have problems. Nothing is built. */
export class BuildError extends Error {
  readonly code = 'BUILD_REFUSED';
  /** The problems in the rows, errors and warnings both; at least one is an error unless `headerProblems` is not empty. */
  readonly problems: RowProblem[];
  readonly headerProblems: HeaderProblem[];
  constructor(problems: RowProblem[], headerProblems: HeaderProblem[]) {
    const errors = problems.filter(p => p.severity === 'error').length;
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'problem' : 'problems'} in the rows`);
    if (headerProblems.length > 0) parts.push(`${headerProblems.length} ${headerProblems.length === 1 ? 'problem' : 'problems'} in the sender details`);
    super(`The file was not built: ${parts.join(' and ')}.`);
    this.name = 'BuildError';
    this.problems = problems;
    this.headerProblems = headerProblems;
  }
}

const digits = (s: string): boolean => /^\d+$/.test(s);

/**
 * A header text as the file will hold it: invisible characters dropped, non-breaking and other spaces made plain, accents composed.
 * A control character is left for `textProblem` to refuse, so that a line break is named rather than quietly turned into a space.
 */
const headerText = (s: string): string => (/[\u0000-\u001f\u007f-\u009f]/.test(s) ? s.trim() : cleanCell(s));

/** A date as YYYYMMDD from YYYYMMDD or YYYY-MM-DD only, or '' when it is neither or not a real date. */
function headerDate(raw: string): string {
  const t = raw.trim();
  const value = /^\d{8}$/.test(t) ? t : /^(\d{4})-(\d{2})-(\d{2})$/.test(t) ? t.replace(/-/g, '') : '';
  return value !== '' && isRealDate(value) ? value : '';
}

/** A time as HHMMSS from HHMMSS or HH:MM:SS only, or '' when it is neither or not a time of day. */
function headerTime(raw: string): string {
  const t = raw.trim();
  const value = /^\d{6}$/.test(t) ? t : /^\d{2}:\d{2}:\d{2}$/.test(t) ? t.replace(/:/g, '') : '';
  return value !== '' && isRealTime(value, true) ? value : '';
}
const isUtf8Name = (s: string): boolean => /^utf-?8$/i.test(s);

/** The header's own problems. An empty list means these checks found none. */
export function checkHeader(header: BuildHeader): HeaderProblem[] {
  const out: HeaderProblem[] = [];
  const add = (field: keyof BuildHeader, code: string, message: string): void => {
    out.push({ field, code, message });
  };
  const type = header.senderType.trim().toUpperCase();
  if (!(type === 'PB' || type === 'SO' || type === 'WR' || type === 'AA' || /^\d{2}$/.test(type))) {
    add('senderType', 'sender-type', `The sender type "${header.senderType}" is not one the file can hold. Use PB, SO, WR or AA, or two digits.`);
  }
  const id = header.senderId.trim();
  if (id === '') add('senderId', 'sender-id', 'The sender code is empty. Enter the code your society or administrator gave you. This tool does not make one up.');
  else if (!digits(id) || id.length > 9) add('senderId', 'sender-id', `The sender code "${header.senderId}" is not up to nine digits.`);
  else if (/^0+$/.test(id)) add('senderId', 'sender-id', `The sender code "${header.senderId}" is all zeros, which means no code was entered. Enter the code your society or administrator gave you. This tool does not make one up.`);
  const name = headerText(header.senderName);
  const software = headerText(header.softwarePackage ?? '');
  const version = headerText(header.softwarePackageVersion ?? '');
  if (name === '') add('senderName', 'sender-name', 'The sender name is empty.');
  else if (writtenLength(name) > 45) add('senderName', 'sender-name', `The sender name is ${writtenLength(name)} characters long in capitals and the file holds 45.`);
  const fields: Array<[keyof BuildHeader, string, string, number]> = [
    ['senderName', 'The sender name', name, 45],
    ['softwarePackage', 'The software package name', software, 30],
    ['softwarePackageVersion', 'The software package version', version, 30],
  ];
  for (const [field, label, value, width] of fields) {
    const bad = value === '' ? null : textProblem(value);
    if (bad) add(field, bad.code, `${label} "${value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')}": ${bad.message}`);
    if (field !== 'senderName' && writtenLength(value) > width) add(field, 'header-text-too-long', `${label} is ${writtenLength(value)} characters long in capitals and the file holds ${width}.`);
  }
  if (headerDate(header.creationDate) === '') add('creationDate', 'creation-date', `The creation date "${header.creationDate}" is not a date. Write it as YYYYMMDD or YYYY-MM-DD.`);
  if (headerDate(header.transmissionDate) === '') add('transmissionDate', 'transmission-date', `The transmission date "${header.transmissionDate}" is not a date. Write it as YYYYMMDD or YYYY-MM-DD.`);
  if (headerTime(header.creationTime) === '') add('creationTime', 'creation-time', `The creation time "${header.creationTime}" is not a time of day. Write it as HHMMSS or HH:MM:SS.`);
  const cs = (header.characterSet ?? '').trim();
  if (cs !== '' && !isUtf8Name(cs)) {
    add('characterSet', 'character-set', `The character set "${cs}" is not one this builder writes. It writes UTF-8 only, so name it UTF-8, or leave the name out when all the text is plain ASCII.`);
  }
  if (hasNonAscii(`${name}${software}${version}`) && cs === '') {
    add('characterSet', 'character-set-needed', 'The sender details have a letter outside plain ASCII, so the file must name its character set. Name it UTF-8.');
  }
  return out;
}

/**
 * Builds a CWR 2.2 file from template rows.
 *
 * Throws `BuildError` when `checkRows` reports an error, when the header has a problem, or when the text has a letter outside plain
 * ASCII and the header names no character set. On success the file has one group of new work registrations (NWR), one transaction per
 * WORK row in sheet order, and counts that `renumber` has set. A file with non-ASCII letters is written as UTF-8.
 */
export function buildDoc(rows: readonly TemplateRow[], header: BuildHeader): BuildResult {
  const found = analyse(rows);
  const problems = checkRows(rows);
  const headerProblems = checkHeader(header);
  if (found.nonAscii && (header.characterSet ?? '').trim() === '' && !headerProblems.some(h => h.code === 'character-set-needed')) {
    headerProblems.push({ field: 'characterSet', code: 'character-set-needed', message: 'The sheet has a letter outside plain ASCII, so the file must name its character set. Name it in the header.' });
  }
  if (problems.some(p => p.severity === 'error') || headerProblems.length > 0) throw new BuildError(problems, headerProblems);

  const lines: string[] = [];
  lines.push(
    writeRecord('HDR', {
      senderType: header.senderType.trim().toUpperCase(),
      senderId: header.senderId.trim(),
      senderName: headerText(header.senderName),
      ediStandardVersionNumber: '01.10',
      creationDate: headerDate(header.creationDate),
      creationTime: headerTime(header.creationTime),
      transmissionDate: headerDate(header.transmissionDate),
      characterSet: (header.characterSet ?? '').trim() === '' ? '' : 'UTF-8',
      version: '2.2',
      revision: 1,
      softwarePackage: headerText(header.softwarePackage ?? 'ROYALTI CWR'),
      softwarePackageVersion: headerText(header.softwarePackageVersion ?? ''),
    }),
  );
  lines.push(writeRecord('GRH', { transactionType: 'NWR', groupId: 1, versionNumberForThisTransactionType: '02.20', batchRequest: 0 }, 26));

  const numbers = new PartyNumbers();
  found.works.forEach((work, index) => lines.push(...workRecords(work, index, numbers)));

  // The counts are set by the engine below; the zeros here are replaced.
  lines.push(writeRecord('GRT', { groupId: 1, transactionCount: 0, recordCount: 0 }, 24));
  lines.push(writeRecord('TRL', { groupCount: 1, transactionCount: 0, recordCount: 0 }));

  const text = lines.join('\r\n') + '\r\n';
  const bytes = encodeText(text, hasNonAscii(text) ? 'utf8' : 'ascii');
  if (!bytes) throw new Error('The file text could not be encoded.');
  const draft = parse(bytes, { version: '2.2' });
  renumber(draft);
  const doc = parse(serialize(draft), { version: '2.2' });
  const final = doc.lines.map(l => l.text + l.eol).join('');
  return { doc, text: final };
}

// ------------------------------------------------------------------ one work

/** Interested Party # for each person across the file: the same IPI name number, or the same name, keeps the same number. */
class PartyNumbers {
  private readonly seen = new Map<string, string>();
  private readonly next = { W: 0, P: 0 };
  numberFor(p: PartyModel): string {
    const letter = p.kind === 'writer' ? 'W' : 'P';
    const who = p.ipi !== '' ? `I:${p.ipi}` : `N:${p.name.toUpperCase()}|${p.firstName.toUpperCase()}`;
    const key = `${letter}:${who}`;
    let n = this.seen.get(key);
    if (n === undefined) {
      this.next[letter]++;
      n = `${letter}${String(this.next[letter]).padStart(8, '0')}`;
      this.seen.set(key, n);
    }
    return n;
  }
}

function workRecords(work: WorkModel, index: number, numbers: PartyNumbers): string[] {
  const out: string[] = [];
  let rseq = 0;
  const tseq = index;
  const next = (): FieldValues => prefix(tseq, ++rseq);

  const roles = work.writers.map(w => w.role);
  const modified = roles.some(r => MODIFIER_ROLES.includes(r));
  out.push(
    writeRecord('NWR', {
      ...prefix(tseq, 0),
      workTitle: work.title,
      languageCode: work.language,
      submitterWorkNumber: work.number,
      iswc: work.iswc,
      musicalWorkDistributionCategory: work.category,
      duration: work.duration,
      recordedIndicator: work.recordings.length > 0 ? 'Y' : 'U',
      versionType: modified ? 'MOD' : 'ORI',
      ...(modified ? { musicArrangement: 'UNS', lyricAdaptation: 'UNS' } : {}),
    }),
  );

  const shares = (p: PartyModel, kind: 'own' | 'collect', ids: readonly [string, string, string]): FieldValues => {
    const v: FieldValues = {};
    RIGHTS.forEach((r, i) => {
      v[ids[i]!] = p[kind][r];
    });
    return v;
  };
  const societies = (p: PartyModel, ids: readonly [string, string, string]): FieldValues => {
    const v: FieldValues = {};
    RIGHTS.forEach((r, i) => {
      if (p.societies[r] !== '') v[ids[i]!] = p.societies[r];
    });
    return v;
  };
  const OWN = ['prOwnershipShare', 'mrOwnershipShare', 'srOwnershipShare'] as const;
  const SOC_PUB = ['prAffiliationSocietyNumber', 'mrSociety', 'srSociety'] as const;
  const SOC_WRITER = ['prAffiliationSocietyNumber', 'mrSociety', 'srSociety'] as const;
  const COL_PUB = ['prCollectionShare', 'mrCollectionShare', 'srCollectionShare'] as const;
  const COL_WRITER = ['prCollectionShare', 'mrCollectionShare', 'srCollectionShare'] as const;

  // Publishers: the ones you control first (each starts its own chain), then the others. Publisher Sequence # counts the chains.
  const seqOf = new Map<PartyModel, number>();
  const ordered = [...work.publishers.filter(p => p.controlled), ...work.publishers.filter(p => !p.controlled)];
  ordered.forEach((p, i) => seqOf.set(p, i + 1));
  const ipOf = new Map<PartyModel, string>();
  for (const p of [...work.publishers, ...work.writers]) ipOf.set(p, numbers.numberFor(p));

  for (const p of ordered) {
    const ip = ipOf.get(p)!;
    out.push(
      writeRecord(p.controlled ? 'SPU' : 'OPU', {
        ...next(),
        publisherSequenceNumber: seqOf.get(p)!,
        interestedPartyNumber: ip,
        publisherName: p.name,
        publisherType: 'E',
        publisherIpiNameNumber: p.ipi,
        ...societies(p, SOC_PUB),
        ...shares(p, 'own', OWN),
      }),
    );
    if (!p.controlled) continue;
    p.territories.forEach((tis, i) => {
      out.push(
        writeRecord('SPT', {
          ...next(),
          interestedPartyNumber: ip,
          ...shares(p, 'collect', COL_PUB),
          inclusionExclusionIndicator: 'I',
          tisNumericCode: tis,
          sequenceNumber: i + 1,
        }),
      );
    });
  }

  const writers = [...work.writers.filter(w => w.controlled), ...work.writers.filter(w => !w.controlled)];
  for (const w of writers) {
    const ip = ipOf.get(w)!;
    out.push(
      writeRecord(w.controlled ? 'SWR' : 'OWR', {
        ...next(),
        interestedPartyNumber: ip,
        writerLastName: w.name,
        writerFirstName: w.firstName,
        writerDesignationCode: w.role,
        writerIpiNameNumber: w.ipi,
        ...societies(w, SOC_WRITER),
        ...shares(w, 'own', OWN),
      }),
    );
    if (!w.controlled) continue;
    if (w.collect.pr > 0 || w.collect.mr > 0 || w.collect.sr > 0) {
      w.territories.forEach((tis, i) => {
        out.push(
          writeRecord('SWT', {
            ...next(),
            interestedPartyNumber: ip,
            ...shares(w, 'collect', COL_WRITER),
            inclusionExclusionIndicator: 'I',
            tisNumericCode: tis,
            sequenceNumber: i + 1,
          }),
        );
      });
    }
    for (const link of w.links) {
      out.push(
        writeRecord('PWR', {
          ...next(),
          publisherIpNumber: ipOf.get(link)!,
          publisherName: link.name,
          writerIpNumber: ip,
          publisherSequenceNumber: seqOf.get(link)!,
        }),
      );
    }
  }

  for (const a of work.alts) {
    out.push(writeRecord('ALT', { ...next(), alternateTitle: a.title, titleType: a.titleType, languageCode: a.language }));
  }
  for (const p of work.performers) {
    out.push(writeRecord('PER', { ...next(), performingArtistLastName: p.name, performingArtistFirstName: p.firstName, performingArtistIpiNameNumber: p.ipi }));
  }
  for (const r of work.recordings) {
    out.push(
      writeRecord('REC', {
        ...next(),
        firstReleaseDate: r.releaseDate,
        firstReleaseDuration: r.duration,
        firstAlbumTitle: r.album,
        firstAlbumLabel: r.album === '' ? '' : r.label,
        isrc: r.isrc,
        recordingTitle: r.title,
        recordLabel: r.label,
        isrcValidity: 'Y',
      }),
    );
  }
  return out;
}
