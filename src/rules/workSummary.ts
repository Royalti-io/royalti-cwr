import { getField } from '../model/fields';
import type { CwrDoc, RecRef, Txn } from '../model/types';
import { buildWork, FULL, pct, RIGHTS, sumRight, TOLERANCE, UNREADABLE } from './work';
import type { Right } from './work';

export type { Right } from './work';

/** One publisher or writer record of a work with its ownership shares. */
export interface PartySummary {
  kind: 'publisher' | 'writer';
  /** The record type as written: `SPU`, `OPU`, `SWR`, `OWR`. */
  recordType: string;
  /** SPU and SWR are the sender's own (controlled) parties; OPU and OWR are other parties (CWR 2.2). */
  controlled: boolean;
  /** Publisher name, or the writer's last name. Trimmed; empty when blank. */
  name: string;
  /** Writers only: first name, trimmed. */
  firstName?: string;
  /** Publisher Type (`E`, `AM`, `PA`, `SE`...) for a publisher, Writer Designation (`CA`, `C`, `A`...) for a writer. Trimmed. */
  role: string;
  /** Interested party number, trimmed. */
  ip: string;
  ref: RecRef;
  /** 0-based physical line index of the record. */
  line: number;
  /**
   * Ownership shares in hundredths of a percent (`5000` is 50.00%). `null` when the share cannot be read as five digits
   * or five spaces, or the record is too short to hold it: the same cases the checks leave out of their totals.
   */
  shares: Record<Right, number | null>;
}

export interface RightTotal {
  /** Sum of the writers' ownership shares of this right, or null when one of them cannot be read. */
  writers: number | null;
  publishers: number | null;
  /** Writers plus publishers, in hundredths of a percent; null when either part is null. */
  total: number | null;
  /** `total` is 100.00% within the specification's tolerance of 0.06%, or 0%. `null` when `total` is. */
  balanced: boolean | null;
}

export interface WorkSummary {
  header: RecRef;
  /** 0-based physical line index of the NWR / REV / ISW / EXC header. */
  line: number;
  /** The header's record type. */
  recordType: string;
  title: string;
  /** Submitter Work #. */
  workNumber: string;
  /** Publishers and writers in file order. */
  parties: PartySummary[];
  totals: Record<Right, RightTotal>;
}

const orNull = (v: number): number | null => (v === UNREADABLE ? null : v);

/** Hundredths of a percent as text: `5000` is `50.00%`. */
export function formatShare(hundredths: number): string {
  return pct(hundredths);
}

/** Share totals and party shares of one work transaction (an NWR, REV, ISW or EXC with its detail records). */
export function workSummary(doc: CwrDoc, txn: Txn): WorkSummary {
  const w = buildWork(doc, doc.version.version, txn);
  const text = (ref: RecRef, id: string): string => (getField(doc, ref, id) ?? '').trim();

  const parties: PartySummary[] = [];
  for (const p of w.pubs) {
    parties.push({
      kind: 'publisher',
      recordType: p.type,
      controlled: p.type === 'SPU',
      name: text(p.ref, 'publisherName'),
      role: p.pubType,
      ip: p.ip,
      ref: p.ref,
      line: p.line,
      shares: { pr: orNull(p.pr), mr: orNull(p.mr), sr: orNull(p.sr) },
    });
  }
  for (const wr of w.writers) {
    parties.push({
      kind: 'writer',
      recordType: wr.type,
      controlled: wr.type === 'SWR',
      name: wr.lastName,
      firstName: text(wr.ref, 'writerFirstName'),
      role: wr.designation,
      ip: wr.ip,
      ref: wr.ref,
      line: wr.line,
      shares: { pr: orNull(wr.pr), mr: orNull(wr.mr), sr: orNull(wr.sr) },
    });
  }
  parties.sort((a, b) => a.ref - b.ref);

  const totals = {} as Record<Right, RightTotal>;
  for (const right of RIGHTS) {
    const writers = orNull(sumRight(w.writers, right));
    const publishers = orNull(sumRight(w.pubs, right));
    const total = writers === null || publishers === null ? null : writers + publishers;
    totals[right] = { writers, publishers, total, balanced: total === null ? null : total === 0 || Math.abs(total - FULL) <= TOLERANCE };
  }

  return {
    header: txn.header,
    line: doc.records[txn.header]!.line,
    recordType: doc.records[txn.header]!.type,
    title: text(txn.header, 'workTitle'),
    workNumber: text(txn.header, 'submitterWorkNumber'),
    parties,
    totals,
  };
}

const WORK_HEADERS = new Set(['NWR', 'REV', 'ISW', 'EXC']);

/** `workSummary` for every NWR, REV, ISW and EXC transaction at the top level of the file, in file order. */
export function workSummaries(doc: CwrDoc): WorkSummary[] {
  const out: WorkSummary[] = [];
  for (const group of doc.file.groups) {
    for (const txn of group.transactions) {
      if (WORK_HEADERS.has(doc.records[txn.header]!.type)) out.push(workSummary(doc, txn));
    }
  }
  return out;
}
