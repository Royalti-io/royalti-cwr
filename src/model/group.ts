import { getField } from './fields';
import { FIELD_REFS } from './fieldRefs';
import type { CwrDoc, FileStructure, Group, Line, Rec, RecRef, Txn, WorkView } from './types';

/** Transaction headers. */
export const TXN_HEADERS: ReadonlySet<string> = new Set(['NWR', 'REV', 'ISW', 'EXC', 'AGR', 'ACK']);
/** Transaction headers that carry a work (the "NWR family"). */
export const WORK_HEADERS: ReadonlySet<string> = new Set(['NWR', 'REV', 'ISW', 'EXC']);
/** Records with no transaction/record sequence prefix. */
export const CONTROL_TYPES: ReadonlySet<string> = new Set(['HDR', 'GRH', 'GRT', 'TRL']);

/**
 * Groups records by POSITION into file, group and transaction. Sequence numbers are never used to
 * decide membership: a wrong number is a rule's finding, not a reason to move a record.
 *
 * Every record lands in exactly one place at the top level: `hdr`, `trl`, a group's `grh`/`grt`, a
 * transaction's `header` or `records`, or `orphans`. Nothing is dropped.
 */
export function buildStructure(lines: Line[], records: Rec[]): { file: FileStructure; orphans: RecRef[] } {
  const file: FileStructure = { groups: [] };
  const orphans: RecRef[] = [];
  let group: Group | null = null;
  let txn: Txn | null = null;
  let inner: Txn | null = null;

  for (let ref = 0; ref < records.length; ref++) {
    const rec = records[ref]!;
    const type = rec.type;

    if (type === 'HDR') {
      if (file.hdr === undefined) file.hdr = ref;
      else orphans.push(ref);
    } else if (type === 'GRH') {
      group = { grh: ref, type: lines[rec.line]!.text.slice(3, 6), transactions: [] };
      file.groups.push(group);
      txn = null;
      inner = null;
    } else if (type === 'GRT') {
      if (group && group.grt === undefined) {
        group.grt = ref;
        group = null;
        txn = null;
        inner = null;
      } else {
        orphans.push(ref);
      }
    } else if (type === 'TRL') {
      if (file.trl === undefined) {
        file.trl = ref;
        group = null;
        txn = null;
        inner = null;
      } else {
        orphans.push(ref);
      }
    } else if (TXN_HEADERS.has(type)) {
      if (!group) {
        orphans.push(ref);
      } else if (txn && txn.inner === undefined && records[txn.header]!.type === 'ACK' && type !== 'ACK') {
        // The NWR/REV/ISW/EXC/AGR an ACK carries continues the ACK's transaction.
        inner = { header: ref, records: [] };
        txn.inner = [inner];
        txn.records.push(ref);
      } else {
        txn = { header: ref, records: [] };
        inner = null;
        group.transactions.push(txn);
      }
    } else if (txn) {
      txn.records.push(ref);
      if (inner) inner.records.push(ref);
    } else {
      orphans.push(ref);
    }
  }
  return { file, orphans };
}

const TITLE_TYPES: ReadonlySet<string> = new Set(['ALT', 'NAT', 'EWT', 'VER', 'NET', 'NCT', 'NVT', 'NOW']);
const PUBLISHER_TYPES: ReadonlySet<string> = new Set(['SPU', 'OPU']);

/**
 * Indexes of a work transaction: publisher chains, writers, titles, the rest. Indexes only; no values
 * are copied. Built on first use and cached on the transaction. Returns undefined for AGR and ACK.
 */
export function getWorkView(doc: CwrDoc, txn: Txn): WorkView | undefined {
  if (txn.work) return txn.work;
  if (!WORK_HEADERS.has(doc.records[txn.header]!.type)) return undefined;

  const view: WorkView = { chains: [], writers: [], titles: [], others: [] };
  let chain: WorkView['chains'][number] | null = null;
  let publisher: RecRef | null = null;
  let writer: WorkView['writers'][number] | null = null;
  let inPublisherRun = false;

  for (const ref of txn.records) {
    const type = doc.records[ref]!.type;
    if (PUBLISHER_TYPES.has(type)) {
      const pubType = (getField(doc, ref, FIELD_REFS.publisherType.id) ?? '').trim();
      if (!chain || !inPublisherRun || pubType === 'E' || pubType === 'PA') {
        const seqText = (getField(doc, ref, FIELD_REFS.publisherSequenceNumber.id) ?? '').trim();
        chain = { seq: /^\d+$/.test(seqText) ? Number(seqText) : null, publishers: [], territories: new Map() };
        view.chains.push(chain);
      }
      chain.publishers.push(ref);
      publisher = ref;
      writer = null;
      inPublisherRun = true;
    } else if (type === 'NPN' && chain && inPublisherRun) {
      chain.publishers.push(ref);
    } else if ((type === 'SPT' || type === 'OPT') && chain && publisher !== null && inPublisherRun) {
      const list = chain.territories.get(publisher);
      if (list) list.push(ref);
      else chain.territories.set(publisher, [ref]);
    } else if (type === 'SWR' || type === 'OWR') {
      writer = { rec: ref, territories: [], pwr: [] };
      view.writers.push(writer);
      inPublisherRun = false;
    } else if ((type === 'SWT' || type === 'OWT') && writer) {
      writer.territories.push(ref);
    } else if (type === 'PWR' && writer) {
      writer.pwr.push(ref);
    } else if (type === 'NWN' && writer) {
      // Writer name in another script: stays with its writer's run, shown as "other".
      view.others.push(ref);
    } else if (TITLE_TYPES.has(type)) {
      view.titles.push(ref);
      inPublisherRun = false;
    } else {
      view.others.push(ref);
    }
  }
  txn.work = view;
  return view;
}
