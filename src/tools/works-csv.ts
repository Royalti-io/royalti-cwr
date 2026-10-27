import { getField } from '../model/fields';
import { WORK_HEADERS } from '../model/group';
import { drain } from '../model/progress';
import type { Progress, RunOptions } from '../model/progress';
import { encodeUtf8 } from '../model/text';
import type { CwrDoc, RecRef, Txn } from '../model/types';
import { workSummary } from '../rules/workSummary';
import type { PartySummary, WorkSummary } from '../rules/workSummary';
import { RECORD_STEP, stepper, WORK_STEP } from './steps';

/**
 * Works information as a CSV file: one row per work, for a spreadsheet.
 *
 * A row is made for every NWR, REV, ISW and EXC transaction, and for every ACK transaction that carries a work (the
 * work inside the ACK supplies the writers, publishers and shares; the ACK supplies the status and the numbers). The
 * columns are listed in `WORKS_CSV_HEADERS`. Share totals are writers plus publishers, in percent with two decimals,
 * and are empty when a share cannot be read.
 *
 * The output is UTF-8 with a byte order mark so that Excel reads accented names correctly, with CR LF between rows
 * and quotes only where a cell needs them. A cell that would start a formula in a spreadsheet (it begins with `=`,
 * `+`, `-` or `@`, or with a tab or carriage return) gets a single quote in front of it, so opening the file cannot
 * run anything. The guard applies to every cell, numbers included.
 */

export const WORKS_CSV_HEADERS: readonly string[] = [
  'Line',
  'Record type',
  'Title',
  'Submitter work #',
  'ISWC',
  'Writers',
  'Publishers',
  'PR total %',
  'MR total %',
  'SR total %',
  'ACK status',
  'Messages',
  'Society work #s',
  'Recipient work #',
  'Cross-references',
];

const BOM = Uint8Array.of(0xef, 0xbb, 0xbf);

/** The part of the progress bar taken by reading the works; the rest is writing the rows. */
const READ_SHARE = 0.6;

/** Stops a spreadsheet from reading a cell as a formula. */
export function guardCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  const safe = guardCsvCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const text = (doc: CwrDoc, ref: RecRef, id: string): string => (getField(doc, ref, id) ?? '').trim();

const percent = (hundredths: number | null): string => (hundredths === null ? '' : `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`);

const personName = (p: PartySummary): string => (p.firstName ? `${p.name}, ${p.firstName}` : p.name);

/** Replaces any unpaired surrogate so the text can always be encoded. */
function encodable(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i]! + s[i + 1]!;
        i++;
      } else out += '\ufffd';
    } else if (c >= 0xdc00 && c <= 0xdfff) out += '\ufffd';
    else out += s[i]!;
  }
  return out;
}

interface Row {
  summary: WorkSummary | null;
  txn: Txn;
  /** The transaction whose records hold the work: the ACK's inner transaction for an ACK, else the transaction itself. */
  work: Txn | null;
  ackRef: RecRef | null;
}

export function worksCsv(doc: CwrDoc): Uint8Array {
  return drain(worksCsvSteps(doc));
}

/**
 * `worksCsv` as a generator, shaped like `checkSteps`: it yields a `Progress` (`task: 'works-csv'`) about every 256
 * transactions while it reads the works (stage `works`) and every 2,048 rows while it writes them (stage `rows`), and returns
 * the same bytes `worksCsv` returns. The document is only read. A host that has to stay responsive gives the event loop a
 * turn between `next()` calls; stopping is not calling `next()` again (or `return()`), and leaves nothing behind.
 */
export function* worksCsvSteps(doc: CwrDoc, options: RunOptions = {}): Generator<Progress, Uint8Array, void> {
  const step = stepper('works-csv', options);
  const total = doc.file.groups.reduce((sum, g) => sum + g.transactions.length, 0);
  yield step('works', 0, total, 0, READ_SHARE);
  let seen = 0;
  const rows: Row[] = [];
  for (const group of doc.file.groups) {
    for (const txn of group.transactions) {
      seen++;
      if (seen % WORK_STEP === 0) yield step('works', seen, total, 0, READ_SHARE);
      const type = doc.records[txn.header]!.type;
      if (WORK_HEADERS.has(type)) {
        rows.push({ summary: workSummary(doc, txn), txn, work: txn, ackRef: null });
      } else if (type === 'ACK') {
        const inner = txn.inner?.[0];
        const innerIsWork = inner !== undefined && WORK_HEADERS.has(doc.records[inner.header]!.type);
        rows.push({ summary: innerIsWork ? workSummary(doc, inner) : null, txn, work: innerIsWork ? inner : null, ackRef: txn.header });
      }
    }
  }

  yield step('rows', 0, rows.length, READ_SHARE, 1);
  const lines: string[] = [WORKS_CSV_HEADERS.map(csvCell).join(',')];
  let written = 0;
  for (const row of rows) {
    if (written > 0 && written % RECORD_STEP === 0) yield step('rows', written, rows.length, READ_SHARE, 1);
    written++;
    const { summary, txn } = row;
    const header = txn.header;
    const rec = doc.records[header]!;
    const ack = row.ackRef;

    const messages: string[] = [];
    const societyNumbers: string[] = [];
    const crossReferences: string[] = [];
    for (const ref of txn.records) {
      const type = doc.records[ref]!.type;
      if (type === 'MSG') {
        const m = text(doc, ref, 'messageText');
        if (m !== '') messages.push(m);
      } else if (type === 'ARI') {
        const society = text(doc, ref, 'societyNumber');
        const number = text(doc, ref, 'workNumber');
        if (number !== '') societyNumbers.push(society === '' ? number : `${society}:${number}`);
      } else if (type === 'XRF') {
        const org = text(doc, ref, 'organisationCode');
        const id = text(doc, ref, 'identifier');
        if (id !== '') crossReferences.push(org === '' ? id : `${org}:${id}`);
      }
    }

    const workHeader = row.work?.header;
    const title = (ack !== null ? text(doc, ack, 'creationTitle') : '') || summary?.title || '';
    const workNumber = (ack !== null ? text(doc, ack, 'submitterCreationNumber') : '') || summary?.workNumber || '';
    const iswc = workHeader !== undefined ? text(doc, workHeader, 'iswc') : '';
    const parties = summary?.parties ?? [];
    const writers = parties.filter(p => p.kind === 'writer').map(personName);
    const publishers = parties.filter(p => p.kind === 'publisher').map(p => p.name);
    const total = (right: 'pr' | 'mr' | 'sr'): string => (summary ? percent(summary.totals[right].total) : '');

    const cells = [
      String(rec.line + 1),
      rec.type,
      title,
      workNumber,
      iswc,
      writers.join('; '),
      publishers.join('; '),
      total('pr'),
      total('mr'),
      total('sr'),
      ack !== null ? text(doc, ack, 'transactionStatus') : '',
      messages.join('; '),
      societyNumbers.join('; '),
      ack !== null ? text(doc, ack, 'recipientCreationNumber') : '',
      crossReferences.join('; '),
    ];
    lines.push(cells.map(c => csvCell(encodable(c))).join(','));
  }

  yield step('rows', rows.length, rows.length, READ_SHARE, 1);
  const body = encodeUtf8(lines.join('\r\n') + '\r\n')!;
  const out = new Uint8Array(BOM.length + body.length);
  out.set(BOM, 0);
  out.set(body, BOM.length);
  return out;
}
