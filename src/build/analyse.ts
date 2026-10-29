/**
 * Reads template rows into works and finds the problems on the way. `checkRows` returns the problems; `buildDoc` uses the works.
 * Not exported from the package: both callers go through here so that a row the checks accept is a row the builder can write.
 *
 * The share rules follow the checker's own, in hundredths of a percent with the checker's tolerance of 0.06%, so a sheet that passes
 * here does not then fail the checker for a reason these checks could have named.
 */

import { cleanCell } from './csv';
import type { RowProblem } from './csv';
import { columnOf, COLUMN_KEYS, TEMPLATE_COLUMNS } from './template';
import type { ColumnKey, RowType, TemplateRow } from './template';
import {
  CREATOR_ROLES,
  MODIFIER_ROLES,
  hasNonAscii,
  parseCategory,
  parseDate,
  parseDuration,
  parseFlag,
  parseIpi,
  parseIsrc,
  parseIswc,
  parseLanguage,
  parsePublisherRole,
  parseRowType,
  parseShare,
  parseSociety,
  parseTerritories,
  parseTitleType,
  parseWriterRole,
  showShare,
  textProblem,
  writtenLength,
} from './values';
import type { Note, Parsed } from './values';
import { LOOKUPS } from '../spec/lookups/index';
import { FULL, RIGHTS, TOLERANCE, pct, territoryTotals } from '../rules/work';
import type { Right, Terr } from '../rules/work';

export interface Shares {
  pr: number;
  mr: number;
  sr: number;
}

export interface PartyModel {
  row: TemplateRow;
  kind: 'writer' | 'publisher';
  controlled: boolean;
  /** Upper-case Party key, or ''. */
  key: string;
  name: string;
  firstName: string;
  role: string;
  /** Eleven digits, or ''. */
  ipi: string;
  societies: { pr: string; mr: string; sr: string };
  own: Shares;
  collect: Shares;
  territories: string[];
  /** Publishers a controlled writer is published by, resolved from the Publisher column. */
  links: PartyModel[];
}

export interface AltTitleModel {
  row: TemplateRow;
  title: string;
  titleType: string;
  language: string;
}

export interface PerformerModel {
  row: TemplateRow;
  name: string;
  firstName: string;
  ipi: string;
}

export interface RecordingModel {
  row: TemplateRow;
  title: string;
  isrc: string;
  duration: string;
  releaseDate: string;
  album: string;
  label: string;
}

export interface WorkModel {
  row: TemplateRow;
  number: string;
  title: string;
  iswc: string;
  language: string;
  duration: string;
  category: string;
  writers: PartyModel[];
  publishers: PartyModel[];
  alts: AltTitleModel[];
  performers: PerformerModel[];
  recordings: RecordingModel[];
}

export interface Analysis {
  works: WorkModel[];
  problems: RowProblem[];
  /** True when some text has a character outside ASCII (the file will need a character set named in its header). */
  nonAscii: boolean;
}

// Field widths of the records the builder writes. They match the layouts in the engine's own field table.
export const WIDTH = { workNumber: 14, title: 60, name: 45, firstName: 30, album: 60, label: 60 } as const;

/**
 * Most publisher chains one work can hold (Publisher Sequence # has two digits). A party's territory records cannot reach the three-digit
 * limit: only codes in the territory list are accepted, and a repeated code is kept once.
 */
export const MAX_PUBLISHERS = 99;

const H = (key: ColumnKey): string => columnOf(key).header;
const RIGHT_LABEL: Readonly<Record<Right, string>> = { pr: 'PR', mr: 'MR', sr: 'SR' };
const OWNED: Readonly<Record<Right, ColumnKey>> = { pr: 'prOwned', mr: 'mrOwned', sr: 'srOwned' };
const COLLECTED: Readonly<Record<Right, ColumnKey>> = { pr: 'prCollected', mr: 'mrCollected', sr: 'srCollected' };
const SOCIETY: Readonly<Record<Right, ColumnKey>> = { pr: 'prSociety', mr: 'mrSociety', sr: 'srSociety' };
const RIGHT_WORD: Readonly<Record<Right, string>> = { pr: 'performing', mr: 'mechanical', sr: 'synchronization' };

let societyNames: Set<string> | undefined;
/** Names in the society table, for the rule that a publisher named like a society needs an IPI name number. DP (000) is not a society. */
function societyNameSet(): Set<string> {
  if (!societyNames) {
    societyNames = new Set();
    for (const row of LOOKUPS.societyCode.rows) if (row.code !== '000' && row.description.length > 0) societyNames.add(row.description.toUpperCase());
  }
  return societyNames;
}

export function analyse(input: readonly TemplateRow[]): Analysis {
  const problems: RowProblem[] = [];
  let nonAscii = false;
  const add = (row: TemplateRow, key: ColumnKey | null, severity: RowProblem['severity'], code: string, message: string): void => {
    problems.push({ row: row.rowNumber, column: key ? H(key) : '', severity, code, message });
  };
  const note = (row: TemplateRow, key: ColumnKey, n: Note, severity: RowProblem['severity'] = 'warning'): void => add(row, key, severity, n.code, n.message);
  /** Runs a cell parser, reporting a refusal as an error and a warning as a warning. */
  const take = <T>(row: TemplateRow, key: ColumnKey, parsed: Parsed<T>, fallback: T): T => {
    if (!parsed.ok) {
      add(row, key, 'error', parsed.code, parsed.message);
      return fallback;
    }
    if (parsed.warning) note(row, key, parsed.warning);
    return parsed.value;
  };
  /**
   * Text going into a fixed-width field: characters the file cannot hold are errors; a value over the width (counted in capitals,
   * as it is written) is cut, with a warning. A letter outside plain ASCII is a warning, except in a national-language title.
   */
  const text = (row: TemplateRow, key: ColumnKey, width: number, national = false): string => {
    const value = row[key];
    if (value === '') return '';
    const bad = textProblem(value);
    if (bad) {
      note(row, key, bad, 'error');
      return value;
    }
    if (hasNonAscii(value)) {
      nonAscii = true;
      if (!national) {
        add(row, key, 'warning', 'non-ascii-text', `"${value}" has a letter outside plain ASCII. Most societies reject such letters in titles and names; only an alternative title of type OL or AL may carry them. Check what your society accepts, or write the plain letters.`);
      }
    }
    const length = writtenLength(value);
    if (length > width) {
      add(row, key, 'warning', 'text-too-long', `"${value}" is ${length} characters long in capitals, and the file holds ${width} here. It will be cut to "${value.toUpperCase().slice(0, width)}".`);
    }
    return value;
  };

  // The cells are read as a person sees them: invisible characters dropped, runs of white space made one space.
  const rows: TemplateRow[] = input.map(r => {
    const copy = { ...r };
    for (const k of COLUMN_KEYS) copy[k] = cleanCell(r[k]);
    return copy;
  });

  const works: WorkModel[] = [];
  const byNumber = new Map<string, WorkModel>();
  const typed: Array<{ row: TemplateRow; type: RowType }> = [];

  // ---- pass 1: row types, work numbers, and the WORK rows
  for (const row of rows) {
    const type = parseRowType(row.rowType);
    if (type === null) {
      add(
        row,
        'rowType',
        'error',
        'unknown-row-type',
        row.rowType === ''
          ? 'The row type is empty. Use WORK, WRITER, PUBLISHER, ALT TITLE, PERFORMER or RECORDING.'
          : `"${row.rowType}" is not a row type. Use WORK, WRITER, PUBLISHER, ALT TITLE, PERFORMER or RECORDING.`,
      );
      continue;
    }
    if (row.workNumber === '') {
      add(row, 'workNumber', 'error', 'missing-work-number', 'The work number is empty. Every row needs the number of the work it belongs to.');
      continue;
    }
    if (writtenLength(row.workNumber) > WIDTH.workNumber) {
      add(row, 'workNumber', 'error', 'work-number-too-long', `The work number "${row.workNumber}" is ${writtenLength(row.workNumber)} characters long in capitals. The file holds ${WIDTH.workNumber}, so use a shorter number.`);
      continue;
    }
    const bad = textProblem(row.workNumber);
    if (bad) {
      note(row, 'workNumber', bad, 'error');
      continue;
    }
    if (hasNonAscii(row.workNumber)) {
      nonAscii = true;
      if (type === 'WORK') add(row, 'workNumber', 'warning', 'non-ascii-text', `The work number "${row.workNumber}" has a letter outside plain ASCII. Most societies reject such letters in identifiers; consider plain letters and digits.`);
    }
    typed.push({ row, type });
    if (type !== 'WORK') continue;

    const key = row.workNumber.toUpperCase();
    const first = byNumber.get(key);
    if (first) {
      add(row, 'workNumber', 'error', 'duplicate-work-number', `The work number "${row.workNumber}" is already used by the WORK row at row ${first.row.rowNumber}. Each work needs its own number.`);
      continue;
    }
    if (row.title === '') add(row, 'title', 'error', 'missing-title', 'The title is empty. Every work needs a title.');
    const work: WorkModel = {
      row,
      number: row.workNumber,
      title: text(row, 'title', WIDTH.title),
      iswc: take(row, 'iswc', parseIswc(row.iswc), ''),
      language: take(row, 'language', parseLanguage(row.language), ''),
      duration: take(row, 'duration', parseDuration(row.duration), ''),
      category: take(row, 'category', parseCategory(row.category), 'UNC'),
      writers: [],
      publishers: [],
      alts: [],
      performers: [],
      recordings: [],
    };
    byNumber.set(key, work);
    works.push(work);
  }

  // ---- pass 2: everything else, attached to its work
  for (const { row, type } of typed) {
    const work = byNumber.get(row.workNumber.toUpperCase());
    if (!work) {
      add(row, 'workNumber', 'error', 'no-work-row', `There is no WORK row for work number "${row.workNumber}". Add one, or fix the number on this row.`);
      continue;
    }
    // A value in a column this kind of row does not use is ignored. Say so, since the person may have meant it.
    for (const col of TEMPLATE_COLUMNS) {
      if (row[col.key] === '' || col.usedBy.includes(type)) continue;
      add(row, col.key, 'warning', 'ignored-value', `A ${type} row does not use "${col.header}". "${row[col.key]}" is left out of the file.`);
    }
    if (type === 'WORK') continue;

    if (type === 'ALT TITLE') {
      if (row.title === '') add(row, 'title', 'error', 'missing-title', 'The alternative title is empty.');
      const titleType = take(row, 'titleType', parseTitleType(row.titleType), 'AT');
      const language = take(row, 'language', parseLanguage(row.language), '');
      if ((titleType === 'OL' || titleType === 'AL') && language === '') {
        add(row, 'language', 'error', 'alt-title-needs-language', `A title of type ${titleType} needs a language. Fill the Language column.`);
      }
      work.alts.push({ row, title: text(row, 'title', WIDTH.title, titleType === 'OL' || titleType === 'AL'), titleType, language });
      continue;
    }

    if (type === 'PERFORMER') {
      if (row.name === '') add(row, 'name', 'error', 'missing-name', 'The name is empty. A performer row needs the artist\'s name.');
      work.performers.push({ row, name: text(row, 'name', WIDTH.name), firstName: text(row, 'firstName', WIDTH.firstName), ipi: take(row, 'ipi', parseIpi(row.ipi), '') });
      continue;
    }

    if (type === 'RECORDING') {
      const isrc = take(row, 'isrc', parseIsrc(row.isrc), '');
      if (row.isrc === '') add(row, 'isrc', 'error', 'missing-isrc', 'The ISRC is empty. A recording row needs the ISRC of the recording.');
      work.recordings.push({
        row,
        title: text(row, 'title', WIDTH.title),
        isrc,
        duration: take(row, 'duration', parseDuration(row.duration), ''),
        releaseDate: take(row, 'releaseDate', parseDate(row.releaseDate), ''),
        album: text(row, 'album', WIDTH.album),
        label: text(row, 'label', WIDTH.label),
      });
      continue;
    }

    // WRITER or PUBLISHER
    const isWriter = type === 'WRITER';
    const flag = parseFlag(row.controlled);
    if (flag === null) {
      add(row, 'controlled', 'error', 'bad-controlled-flag', row.controlled === '' ? 'Controlled is empty. Write Y if you represent this party, N if not.' : `"${row.controlled}" is not Y or N. Write Y if you represent this party, N if not.`);
    }
    const controlled = flag === true;
    if (row.name === '') add(row, 'name', 'error', 'missing-name', isWriter ? 'The name is empty. A writer row needs the last name, or the one name the writer goes by.' : 'The name is empty. A publisher row needs the company name.');
    const role = take(row, 'role', isWriter ? parseWriterRole(row.role) : parsePublisherRole(row.role), isWriter ? '' : 'E');
    const ipi = take(row, 'ipi', parseIpi(row.ipi), '');
    const societies = { pr: '', mr: '', sr: '' };
    const own: Shares = { pr: 0, mr: 0, sr: 0 };
    const collect: Shares = { pr: 0, mr: 0, sr: 0 };
    for (const right of RIGHTS) {
      societies[right] = take(row, SOCIETY[right], parseSociety(row[SOCIETY[right]]), '');
      own[right] = take(row, OWNED[right], parseShare(row[OWNED[right]]), 0);
      const c = row[COLLECTED[right]];
      collect[right] = c === '' ? own[right] : take(row, COLLECTED[right], parseShare(c), own[right]);
    }
    let territories: string[] = [];
    if (controlled) {
      const t = parseTerritories(row.territories);
      if (!t.ok) add(row, 'territories', 'error', t.code, t.message);
      else {
        territories = t.value.codes;
        for (const w of t.value.warnings) note(row, 'territories', w);
      }
    } else {
      for (const k of ['prCollected', 'mrCollected', 'srCollected', 'territories'] as const) {
        if (row[k] !== '') add(row, k, 'warning', 'ignored-value', `"${H(k)}" is only used for parties you control (Controlled = Y). "${row[k]}" is left out of the file.`);
      }
      if (isWriter && row.publisher !== '') {
        add(row, 'publisher', 'warning', 'ignored-value', `"Publisher" is only used for writers you control (Controlled = Y). "${row.publisher}" is left out of the file.`);
      }
    }
    const party: PartyModel = {
      row,
      kind: isWriter ? 'writer' : 'publisher',
      controlled,
      key: row.partyKey.toUpperCase(),
      name: text(row, 'name', WIDTH.name),
      firstName: isWriter ? text(row, 'firstName', WIDTH.firstName) : '',
      role,
      ipi,
      societies,
      own,
      collect: controlled ? collect : own,
      territories,
      links: [],
    };
    (isWriter ? work.writers : work.publishers).push(party);
  }

  // ---- per work
  for (const work of works) checkWork(work, add);

  problems.sort((a, b) => a.row - b.row || columnIndex(a.column) - columnIndex(b.column));
  return { works, problems, nonAscii };
}

function columnIndex(header: string): number {
  if (header === '') return -1;
  const at = TEMPLATE_COLUMNS.findIndex(c => c.header === header);
  return at < 0 ? 999 : at;
}

type Add = (row: TemplateRow, key: ColumnKey | null, severity: RowProblem['severity'], code: string, message: string) => void;

const sum = (items: ReadonlyArray<PartyModel>, field: 'own' | 'collect', right: Right): number => items.reduce((t, p) => t + p[field][right], 0);

function checkWork(work: WorkModel, add: Add): void {
  const { writers, publishers } = work;
  const at = work.row;

  // ---- who is on the work
  if (writers.length === 0) {
    add(at, null, 'error', 'no-writer', `Work ${work.number} has no WRITER row. A work needs at least one writer.`);
  } else if (!writers.some(w => CREATOR_ROLES.includes(w.role)) && writers.every(w => w.role !== '')) {
    add(at, null, 'error', 'no-creator', `Work ${work.number} has no writer with the role C, A or CA. A work needs at least one composer or author.`);
  }
  if (![...writers, ...publishers].some(p => p.controlled)) {
    add(at, null, 'warning', 'no-controlled-party', `Work ${work.number} has no writer or publisher marked Controlled = Y, so the file will carry no territories or collection for you on this work.`);
  }

  if (publishers.length > MAX_PUBLISHERS) {
    add(publishers[MAX_PUBLISHERS]!.row, null, 'error', 'too-many-publishers', `Work ${work.number} has ${publishers.length} PUBLISHER rows, and a work can have at most ${MAX_PUBLISHERS} publishers in the file. Remove the rows from this one onward, or split the work.`);
  }

  // ---- the same person listed twice
  for (const list of [writers, publishers]) {
    const seen = new Map<string, PartyModel>();
    for (const p of list) {
      const key = p.ipi !== '' ? `I:${p.ipi}` : `N:${p.name.toUpperCase()}|${p.firstName.toUpperCase()}`;
      const first = seen.get(key);
      if (!first) {
        seen.set(key, p);
        continue;
      }
      const same = p.ipi !== '' ? 'IPI name number' : 'name';
      add(p.row, p.ipi !== '' ? 'ipi' : 'name', 'warning', 'duplicate-party', `This ${p.kind} has the same ${same} as the ${p.kind} at row ${first.row.rowNumber} on work ${work.number}, so the file gives both one Interested Party number.${p.kind === 'writer' ? ' If one person is both composer and author, use a single row with the role CA.' : ''} If they are different people, give them different IPI name numbers.`);
    }
  }

  // ---- publisher keys and links
  const keyed = new Map<string, PartyModel>();
  for (const p of publishers) {
    if (p.key === '') continue;
    const first = keyed.get(p.key);
    if (first) add(p.row, 'partyKey', 'error', 'duplicate-party-key', `The party key "${p.row.partyKey}" is already used by the publisher at row ${first.row.rowNumber} on this work. Give each publisher its own key.`);
    else keyed.set(p.key, p);
  }
  for (const p of publishers) {
    if (p.controlled && p.ipi === '' && p.row.ipi === '') {
      add(p.row, 'ipi', 'error', 'missing-ipi', `The publisher ${p.name || '(no name)'} is one you control, and a controlled publisher needs its IPI name number. Fill in the IPI name number.`);
    } else if (p.ipi === '' && p.row.ipi === '' && societyNameSet().has(p.name.toUpperCase())) {
      add(p.row, 'ipi', 'error', 'publisher-needs-ipi', `"${p.name}" is the name of a society, and a publisher with a society's name needs its IPI name number. Fill in the IPI name number.`);
    }
  }
  /** Writers whose Publisher cell names someone but links to nobody: the link error already says what is wrong. */
  const unresolved = new Set<PartyModel>();
  for (const w of writers) {
    if (!w.controlled) continue;
    const tokens = w.row.publisher.split(/[;,]+/).map(t => t.trim()).filter(t => t !== '');
    if (tokens.length === 0 && w.row.publisher !== '') {
      add(w.row, 'publisher', 'error', 'publisher-empty', `The Publisher cell "${w.row.publisher}" holds separators but no publisher. Name the publisher's Party key or IPI name number, or empty the cell.`);
    }
    for (const token of tokens) {
      const byKey = publishers.filter(p => p.key !== '' && p.key === token.toUpperCase());
      let found = byKey;
      if (found.length === 0) {
        const parsed = parseIpi(token);
        const ipi = parsed.ok ? parsed.value : '';
        found = ipi === '' ? [] : publishers.filter(p => p.ipi === ipi);
      }
      if (found.length !== 1 || !found[0]!.controlled) unresolved.add(w);
      if (found.length === 0) {
        add(w.row, 'publisher', 'error', 'publisher-not-found', `"${token}" does not match the Party key or the IPI name number of any PUBLISHER row on work ${work.number}. Check the spelling, or add the publisher row.`);
      } else if (found.length > 1) {
        add(w.row, 'publisher', 'error', 'ambiguous-publisher-link', `"${token}" matches more than one PUBLISHER row on work ${work.number} (rows ${found.map(f => f.row.rowNumber).join(', ')}). Give them different Party keys and use the key.`);
      } else if (!found[0]!.controlled) {
        add(w.row, 'publisher', 'error', 'link-to-uncontrolled-publisher', `"${token}" is the publisher at row ${found[0]!.row.rowNumber}, which is not marked Controlled = Y. A writer you control can only be linked to a publisher you control.`);
      } else if (!w.links.includes(found[0]!)) w.links.push(found[0]!);
    }
  }

  // ---- shares
  for (const p of [...publishers, ...writers]) {
    if (p.kind === 'publisher') {
      if (p.own.pr > 5000) add(p.row, 'prOwned', 'error', 'share-out-of-range', `A publisher can own at most 50% of the performing right, and ${showShare(p.own.pr)}% is more. The writers' shares make up the rest.`);
      if (p.controlled && p.collect.pr > 5000) add(p.row, 'prCollected', 'error', 'share-out-of-range', `A publisher's performing share to collect is at most 50%, and ${showShare(p.collect.pr)}% is more.`);
    }
  }
  for (const right of RIGHTS) {
    const wt = sum(writers, 'own', right);
    const pt = sum(publishers, 'own', right);
    const total = wt + pt;
    if (total !== 0 && Math.abs(total - FULL) > TOLERANCE) {
      add(
        at,
        OWNED[right],
        'error',
        'share-total',
        `On work ${work.number}, the ${RIGHT_LABEL[right]} (${RIGHT_WORD[right]}) shares add up to ${pct(total).replace(/\.00%$/, '%')}: writers ${pct(wt).replace(/\.00%$/, '%')} and publishers ${pct(pt).replace(/\.00%$/, '%')}. They must add up to 100% (or all be empty). Check the ${H(OWNED[right])} column of this work's rows for a missing party or a typo.`,
      );
    }
  }
  const ptPr = sum(publishers, 'own', 'pr');
  if (ptPr > 5000 + TOLERANCE) {
    add(at, 'prOwned', 'error', 'publisher-pr-total', `On work ${work.number}, the publishers' performing shares add up to ${pct(ptPr).replace(/\.00%$/, '%')}. Publishers can hold at most 50% of the performing right between them.`);
  }
  const wtPr = sum(writers, 'own', 'pr');
  if (wtPr !== 0 && wtPr < 5000 - TOLERANCE) {
    add(at, 'prOwned', 'error', 'writer-pr-total', `On work ${work.number}, the writers' performing shares add up to ${pct(wtPr).replace(/\.00%$/, '%')}. They must add up to 0% or to at least 50%.`);
  }

  for (const p of publishers) {
    if (!p.controlled) continue;
    if (p.own.pr === 0 && p.own.mr === 0 && p.own.sr === 0) {
      add(p.row, 'prOwned', 'error', 'publisher-no-ownership', `The publisher ${p.name || '(no name)'} is one you control but owns none of the work. Give it a share in at least one of PR owned %, MR owned % or SR owned %.`);
    }
    if (Math.abs(p.collect.pr - p.own.pr) > TOLERANCE) {
      add(p.row, 'prCollected', 'error', 'collection-not-ownership', `The performing share collected for a publisher must equal the performing share it owns. This row owns ${showShare(p.own.pr)}% and collects ${showShare(p.collect.pr)}%. Empty the PR collected % cell to use the owned share.`);
    }
  }

  // A controlled writer who owns a share but collects nothing gets no collection record, which the checker warns about.
  for (const w of writers) {
    if (!w.controlled) continue;
    const owns = w.own.pr > 0 || w.own.mr > 0 || w.own.sr > 0;
    if (owns && w.collect.pr === 0 && w.collect.mr === 0 && w.collect.sr === 0) {
      add(w.row, 'prCollected', 'warning', 'writer-no-collection', `${w.name || 'This writer'} owns a share but collects none of it, so the file has no collection record for this writer and the checker will warn about it. Empty the collected cells to collect what is owned, or give a collected share.`);
    }
  }

  // The writers you control need a publisher link when the writers do not hold the whole of every right the work claims.
  if (publishers.some(p => p.controlled)) {
    let short = false;
    for (const right of RIGHTS) {
      const wt = sum(writers, 'own', right);
      const pt = sum(publishers, 'own', right);
      if (Math.abs(wt - FULL) > TOLERANCE && wt + pt !== 0) short = true;
    }
    if (short) {
      for (const w of writers) {
        if (w.controlled && w.links.length === 0 && !unresolved.has(w)) {
          add(w.row, 'publisher', 'error', 'writer-needs-publisher', `The writers on work ${work.number} do not own all of every right, so the file must say which publisher each controlled writer is published by. Name that publisher's Party key or IPI name number in the Publisher column.`);
        }
      }
    }
  }

  // A controlled publisher whose collected shares are all nil gets territory records of 0%, which the checker warns about.
  for (const p of publishers) {
    if (!p.controlled) continue;
    const owns = p.own.pr > 0 || p.own.mr > 0 || p.own.sr > 0;
    if (owns && p.collect.pr === 0 && p.collect.mr === 0 && p.collect.sr === 0) {
      add(p.row, 'mrCollected', 'warning', 'publisher-no-collection', `${p.name || 'This publisher'} owns a share but collects none of it, so its territory records show 0% and the checker will warn about it. Empty the collected cells to collect what is owned, or give a collected share.`);
    }
  }

  // A modification: a creator with no share needs an arranger or adaptor who has one.
  const modified = writers.some(w => MODIFIER_ROLES.includes(w.role));
  if (modified) {
    const hasShare = (w: PartyModel): boolean => w.own.pr > 0 || w.own.mr > 0 || w.own.sr > 0;
    for (const w of writers) {
      if (!w.controlled || !CREATOR_ROLES.includes(w.role) || hasShare(w)) continue;
      if (writers.some(o => o !== w && o.controlled && MODIFIER_ROLES.includes(o.role) && hasShare(o))) continue;
      add(w.row, 'role', 'error', 'creator-without-share', `This work has an arranger, adaptor, sub-arranger, sub-author or translator, so a controlled composer or author with no share needs one of them (also controlled) who has a share. ${w.name || 'This writer'} has none.`);
    }
  }

  // Collection totals per territory.
  const terrs: Terr[] = [];
  let owner = 0;
  for (const p of [...publishers, ...writers]) {
    if (!p.controlled) continue;
    owner++;
    for (const code of p.territories) {
      terrs.push({
        ref: 0, line: 0, type: p.kind === 'publisher' ? 'SPT' : 'SWT', pos: 0, len: 0, owner, ownerIsPub: p.kind === 'publisher', ip: '', ind: 'I', tis: code,
        pr: p.collect.pr, mr: p.collect.mr, sr: p.collect.sr, sharesChange: '', seqText: '', seq: null, prevType: '',
      });
    }
  }
  const worst = new Map<Right, { total: number; point: string }>();
  for (const point of territoryTotals(terrs).points) {
    for (const right of RIGHTS) {
      const total = point.total[right];
      if (total > FULL + TOLERANCE && total > (worst.get(right)?.total ?? 0)) worst.set(right, { total, point: point.code === '*' ? 'the whole world' : `territory ${point.code}` });
    }
  }
  for (const [right, w] of worst) {
    add(at, COLLECTED[right], 'error', 'collection-over-100', `On work ${work.number}, the ${RIGHT_LABEL[right]} shares collected in ${w.point} add up to ${pct(w.total).replace(/\.00%$/, '%')}. The shares collected in one territory must not add up to more than 100%.`);
  }
}
