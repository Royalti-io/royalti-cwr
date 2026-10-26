import { findField, lineText } from '../model/fields';
import type { CwrDoc, CwrVersion, FieldDef, LayoutProvider, RecRef, RecordLayoutDef, Txn } from '../model/types';
import { LOOKUPS } from '../spec/lookups/index';
import type { RuleCtx } from './types';

/**
 * The shape of one work (an NWR, REV or ISW transaction) as the share, link and territory rules need it:
 * publisher chains, writers, their territory records, PWR links, and the shares as integers in hundredths of a
 * percent (`05000` is 5000, which is 50.00%). Built once per transaction and reused by every rule that asks.
 *
 * Nothing here decides what is wrong. It reads, by position, and marks a share that cannot be read as -1 so the
 * rules can say "not checked" instead of guessing: a share field that holds anything but five digits or five
 * spaces is FMT-N's finding (or the share-range rule's), and a total built on it would be noise.
 */

export const UNREADABLE = -1;

/** True when the record's text reaches the end of the field: a blank there is a blank, not a cut. */
export function reaches(doc: CwrDoc, rec: Located, fieldId: string): boolean {
  const f = fieldOfType(doc, rec.type, fieldId);
  return f !== undefined && f.end <= rec.len;
}

/** Rights in the order the spec's records list them. */
export const RIGHTS = ['pr', 'mr', 'sr'] as const;
export type Right = (typeof RIGHTS)[number];
export const RIGHT_NAME: Readonly<Record<Right, string>> = { pr: 'PR', mr: 'MR', sr: 'SR' };

/** The spec's tolerance for share totals, in hundredths: "...". */
export const TOLERANCE = 6;
/** 100.00% in hundredths. */
export const FULL = 10000;

export interface Located {
  ref: RecRef;
  /** Physical line index. */
  line: number;
  /** Record type as written (`SPU`, `OPU`, `SWT`...). */
  type: string;
  /** Position in the transaction: 0 is the header, 1 the first detail record. */
  pos: number;
  /** Length of the record's text in characters: a field past it was cut off (STR-LEN reports that), not left blank. */
  len: number;
}

export interface Pub extends Located {
  /** Publisher Sequence #, trimmed ('' when blank or too short to hold it). */
  seqText: string;
  seq: number | null;
  ip: string;
  /** Publisher Type, trimmed. */
  pubType: string;
  /** Ownership shares in hundredths; UNREADABLE when not five digits or five spaces. */
  pr: number;
  mr: number;
  sr: number;
  /** Index into `Work.chains`. */
  chain: number;
  /** Type of the record just before this one in the transaction. */
  prevType: string;
  /**
   * True when the chain this record belongs to (by its Publisher Sequence #) is not the chain whose records stand right before it:
   * the record was linked to an earlier original publisher by number and stands after another chain's records.
   */
  outOfPlace: boolean;
}

export interface Writer extends Located {
  ip: string;
  designation: string;
  unknown: string;
  lastName: string;
  pr: number;
  mr: number;
  sr: number;
  pwrs: number[];
}

export interface Terr extends Located {
  /** Index into `Work.pubs` (publisher territory records) or `Work.writers`; -1 when no party record owns it. */
  owner: number;
  ownerIsPub: boolean;
  ip: string;
  ind: string;
  tis: string;
  pr: number;
  mr: number;
  sr: number;
  sharesChange: string;
  seqText: string;
  seq: number | null;
  prevType: string;
}

export interface Pwr extends Located {
  /** Index into `Work.writers`, or -1 when no writer record is in front of it. */
  writer: number;
  publisherIp: string;
  writerIp: string;
  publisherName: string;
  seqText: string;
  seq: number | null;
  prevType: string;
}

export interface Named extends Located {
  seqText: string;
  seq: number | null;
  ip: string;
  prevType: string;
  /** Index into `Work.pubs` / `Work.writers` of the party record in front of it, or -1. */
  party: number;
}

export interface Chain {
  /** Indexes into `Work.pubs`, in file order. The first is the record that opened the chain. */
  pubs: number[];
  /** The record type that opened the chain: SPU for a controlled chain, OPU for a non-controlled one. */
  began: 'SPU' | 'OPU';
}

export interface Work {
  header: RecRef;
  /** Record types in transaction order, the header first. */
  types: string[];
  refs: RecRef[];
  pubs: Pub[];
  writers: Writer[];
  terrs: Terr[];
  pwrs: Pwr[];
  npns: Named[];
  nwns: Named[];
  chains: Chain[];
  /** `territoryTotals(terrs)`, computed on first use. */
  totals?: TerritoryResult;
}

type Layouts = Map<string, RecordLayoutDef | null>;
const layoutCaches = new WeakMap<LayoutProvider, Record<CwrVersion, Layouts>>();

export function layoutOfType(doc: CwrDoc, version: CwrVersion, type: string): RecordLayoutDef | null {
  let per = layoutCaches.get(doc.layouts);
  if (!per) {
    per = { '2.1': new Map(), '2.2': new Map() };
    layoutCaches.set(doc.layouts, per);
  }
  const map = per[version];
  let layout = map.get(type);
  if (layout === undefined) {
    layout = doc.layouts.getLayout(version, type);
    map.set(type, layout);
  }
  return layout;
}

/** The spec field `id` of record type `type` for this document's version, or undefined. */
export function fieldOfType(doc: CwrDoc, type: string, id: string): FieldDef | undefined {
  const layout = layoutOfType(doc, doc.version.version, type);
  return layout ? findField(layout, id) : undefined;
}

/** Characters of a field, trimmed; '' when the record does not reach the end of the field. */
function text(t: string, f: FieldDef | undefined): string {
  return f && f.end <= t.length ? t.slice(f.start, f.end).trim() : '';
}

/** Five digits (the number) or five spaces (0); a field the record is too short to hold, or anything else, is UNREADABLE. */
export function readShare(t: string, f: FieldDef | undefined): number {
  if (!f) return 0; // this record has no such field
  if (t.length < f.end) return UNREADABLE; // the record stops before the field ends: STR-LEN's finding, and a total on it would be a guess
  let v = 0;
  let digits = 0;
  let spaces = 0;
  for (let i = f.start; i < f.end; i++) {
    const c = t.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      if (spaces > 0) return UNREADABLE;
      v = v * 10 + (c - 48);
      digits++;
    } else if (c === 32) spaces++;
    else return UNREADABLE;
  }
  if (digits === 0) return 0;
  return spaces > 0 ? UNREADABLE : v;
}

/** A sequence number read from the field's own characters: digits only, so ' 7' and '7 ' are not numbers (FMT-N reports them). */
function seqOf(t: string, f: FieldDef | undefined): number | null {
  if (!f || f.end > t.length) return null;
  const raw = t.slice(f.start, f.end);
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

type FD = FieldDef | undefined;

/** The fields buildWork reads, resolved once per layout provider, version and record type (a lookup per field per record is the cost otherwise). */
interface Resolved {
  pubType: FD; pubSeq: FD; ip: FD; ownPr: FD; ownMr: FD; ownSr: FD;
  designation: FD; unknown: FD; lastName: FD;
  colPr: FD; colMr: FD; colSr: FD; ind: FD; tis: FD; sharesChange: FD; seq: FD;
  pwrPubIp: FD; pwrWriterIp: FD; pwrName: FD;
}

const resolvedCache = new WeakMap<LayoutProvider, Record<CwrVersion, Map<string, Resolved>>>();

function resolved(doc: CwrDoc, version: CwrVersion, type: string): Resolved {
  let per = resolvedCache.get(doc.layouts);
  if (!per) {
    per = { '2.1': new Map(), '2.2': new Map() };
    resolvedCache.set(doc.layouts, per);
  }
  let r = per[version].get(type);
  if (r) return r;
  const layout = layoutOfType(doc, version, type);
  const g = (id: string): FD => (layout ? findField(layout, id) : undefined);
  r = {
    pubType: g('publisherType'), pubSeq: g('publisherSequenceNumber'), ip: g('interestedPartyNumber'),
    ownPr: g('prOwnershipShare'), ownMr: g('mrOwnershipShare'), ownSr: g('srOwnershipShare'),
    designation: g('writerDesignationCode'), unknown: g('writerUnknownIndicator'), lastName: g('writerLastName'),
    colPr: g('prCollectionShare'), colMr: g('mrCollectionShare'), colSr: g('srCollectionShare'),
    ind: g('inclusionExclusionIndicator'), tis: g('tisNumericCode'), sharesChange: g('sharesChange'), seq: g('sequenceNumber'),
    pwrPubIp: g('publisherIpNumber'), pwrWriterIp: g('writerIpNumber'), pwrName: g('publisherName'),
  };
  per[version].set(type, r);
  return r;
}

const cache = new WeakMap<object, { txn: Txn; work: Work }>();

/** The analysed work for the transaction the context is on. Cached for the rest of the `check` call. */
export function workOf(ctx: RuleCtx): Work {
  const hit = cache.get(ctx);
  if (hit && hit.txn === ctx.txn) return hit.work;
  const work = buildWork(ctx.doc, ctx.version, ctx.txn!);
  cache.set(ctx, { txn: ctx.txn!, work });
  return work;
}

/** The latest chain of this kind (SPU or OPU) whose first publisher carries Publisher Sequence # `seq`, or -1. */
function chainWithNumber(w: Work, seq: number, kind: 'SPU' | 'OPU'): number {
  for (let c = w.chains.length - 1; c >= 0; c--) {
    const chain = w.chains[c]!;
    if (chain.began === kind && w.pubs[chain.pubs[0]!]!.seq === seq) return c;
  }
  return -1;
}

export function buildWork(doc: CwrDoc, version: CwrVersion, txn: Txn): Work {
  const w: Work = {
    header: txn.header,
    types: [doc.records[txn.header]!.type],
    refs: [txn.header],
    pubs: [],
    writers: [],
    terrs: [],
    pwrs: [],
    npns: [],
    nwns: [],
    chains: [],
  };

  let curPub = -1;
  let curWriter = -1;
  /** What the latest party record was: a publisher, a writer, or neither (a title record in between). */
  let last: 'pub' | 'writer' | 'none' = 'none';

  for (let k = 0; k < txn.records.length; k++) {
    const ref = txn.records[k]!;
    const rec = doc.records[ref]!;
    const type = rec.type;
    const pos = k + 1;
    const prevType = w.types[w.types.length - 1]!;
    w.types.push(type);
    w.refs.push(ref);
    const t = lineText(doc, rec.line);
    const base: Located = { ref, line: rec.line, type, pos, len: t.length };
    const R = resolved(doc, version, type);

    if (type === 'SPU' || type === 'OPU') {
      const pubType = text(t, R.pubType);
      const seqText = text(t, R.pubSeq);
      const seq = seqOf(t, R.pubSeq);
      const cur = w.chains.length > 0 ? w.chains[w.chains.length - 1]! : undefined;
      // A chain opens at the first publisher record, after any record that is not a publisher, at an original publisher (E) and at an
      // OPU with no type (the spec defaults it to E, SPU edit 28). Every other record is linked to a chain by its Publisher Sequence #:
      // The specification links every SPU that carries the same Publisher Sequence # as the chain's first SPU. That includes an income
      // participant (PA), which can open a chain or sit inside one: a PA that carries the number of an earlier chain is in it, and one that
      // carries a new number (or none) opens a chain of its own.
      // A linked record with no chain to take its number goes with the chain before it, by position (SPU-R-005 reports the number).
      let chain: number;
      let outOfPlace = false;
      if (cur === undefined || last !== 'pub' || pubType === 'E' || (type === 'OPU' && pubType === '')) {
        w.chains.push({ pubs: [], began: type });
        chain = w.chains.length - 1;
      } else {
        const linked = seq === null ? -1 : chainWithNumber(w, seq, type);
        if (linked >= 0) {
          chain = linked;
          outOfPlace = linked !== w.chains.length - 1;
        } else if (pubType === 'PA') {
          w.chains.push({ pubs: [], began: type });
          chain = w.chains.length - 1;
        } else chain = w.chains.length - 1;
      }
      w.chains[chain]!.pubs.push(w.pubs.length);
      w.pubs.push({
        ...base,
        seqText,
        seq,
        ip: text(t, R.ip),
        pubType,
        pr: readShare(t, R.ownPr),
        mr: readShare(t, R.ownMr),
        sr: readShare(t, R.ownSr),
        chain,
        prevType,
        outOfPlace,
      });
      curPub = w.pubs.length - 1;
      last = 'pub';
    } else if (type === 'SWR' || type === 'OWR') {
      w.writers.push({
        ...base,
        ip: text(t, R.ip),
        designation: text(t, R.designation),
        unknown: text(t, R.unknown),
        lastName: text(t, R.lastName),
        pr: readShare(t, R.ownPr),
        mr: readShare(t, R.ownMr),
        sr: readShare(t, R.ownSr),
        pwrs: [],
      });
      curWriter = w.writers.length - 1;
      last = 'writer';
    } else if (type === 'SPT' || type === 'OPT' || type === 'SWT' || type === 'OWT') {
      const pubSide = type === 'SPT' || type === 'OPT';
      const owned = pubSide ? last === 'pub' : last === 'writer';
      const seqText = text(t, R.seq);
      w.terrs.push({
        ...base,
        owner: owned ? (pubSide ? curPub : curWriter) : -1,
        ownerIsPub: pubSide,
        ip: text(t, R.ip),
        ind: text(t, R.ind),
        tis: text(t, R.tis),
        pr: readShare(t, R.colPr),
        mr: readShare(t, R.colMr),
        sr: readShare(t, R.colSr),
        sharesChange: text(t, R.sharesChange),
        seqText,
        seq: seqOf(t, R.seq),
        prevType,
      });
    } else if (type === 'PWR') {
      const seqText = text(t, R.pubSeq);
      const idx = w.pwrs.length;
      const writer = last === 'writer' ? curWriter : -1;
      w.pwrs.push({
        ...base,
        writer,
        publisherIp: text(t, R.pwrPubIp),
        writerIp: text(t, R.pwrWriterIp),
        publisherName: text(t, R.pwrName),
        seqText,
        seq: seqOf(t, R.pubSeq),
        prevType,
      });
      if (writer >= 0) w.writers[writer]!.pwrs.push(idx);
    } else if (type === 'NPN') {
      const seqText = text(t, R.pubSeq);
      w.npns.push({ ...base, seqText, seq: seqOf(t, R.pubSeq), ip: text(t, R.ip), prevType, party: last === 'pub' ? curPub : -1 });
    } else if (type === 'NWN') {
      w.nwns.push({ ...base, seqText: '', seq: null, ip: text(t, R.ip), prevType, party: last === 'writer' ? curWriter : -1 });
    } else if (type === 'ALT' || type === 'NAT' || type === 'EWT' || type === 'NET' || type === 'VER' || type === 'NVT' || type === 'NOW') {
      last = 'none';
    }
  }
  return w;
}

/** Sum of one right over some party records; UNREADABLE when any of them is. */
export function sumRight(items: ReadonlyArray<{ pr: number; mr: number; sr: number }>, right: Right): number {
  let total = 0;
  for (const it of items) {
    const v = it[right];
    if (v === UNREADABLE) return UNREADABLE;
    total += v;
  }
  return total;
}

/** 9250 as "92.50%". */
export function pct(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, '0');
  return `${whole}.${frac}%`;
}

// ---------------------------------------------------------------- territories

/** The TIS code of the whole world, in the CWR 3.0 TIS table and in the spec's own example. */
export const WORLD = '2136';

let groupSet: Set<string> | undefined;
let knownSet: Set<string> | undefined;

function tisSets(): { groups: Set<string>; known: Set<string> } {
  if (!groupSet || !knownSet) {
    groupSet = new Set();
    knownSet = new Set();
    for (const row of LOOKUPS.tis.rows) {
      knownSet.add(row.code);
      if (row.detail?.startsWith('type GROUP')) groupSet.add(row.code);
    }
  }
  return { groups: groupSet, known: knownSet };
}

/**
 * A TIS code this engine cannot expand into countries: any group in the saved CWR 3.0 table other than World, and a
 * code the table does not list at all that is numbered 1000 or above (every country in the table is numbered below
 * 1000 and every group above 2000, so such a code is more likely a group than a country). Membership of groups is
 * in no saved source, so the engine never guesses it.
 */
export function isUnexpandable(code: string): boolean {
  if (code === WORLD) return false;
  const { groups, known } = tisSets();
  if (groups.has(code)) return true;
  if (!known.has(code) && /^\d{4}$/.test(code) && Number(code) >= 1000) return true;
  return false;
}

/** A group in the saved CWR 3.0 TIS table other than World. */
export function isSavedGroup(code: string): boolean {
  return code !== WORLD && tisSets().groups.has(code);
}

/** The per-territory totals of all the work's territory records, computed once per work. */
export function workTerritories(w: Work): TerritoryResult {
  if (!w.totals) w.totals = territoryTotals(w.terrs);
  return w.totals;
}

/** A TIS code is one the engine can use in per-territory sums: four digits, not a group it cannot expand. */
export function isUsableTis(code: string): boolean {
  return /^\d{4}$/.test(code) && !isUnexpandable(code);
}

export interface Point {
  /** A TIS code named by some territory record, or `*` for every territory no record names. */
  code: string;
  /** Per right, the records whose share counts at this point. */
  by: Record<Right, Terr[]>;
  total: Record<Right, number>;
}

export interface TerritoryResult {
  points: Point[];
  /** Territory records with a group the engine cannot expand: the work's per-territory sums are not computed. */
  unexpanded: Terr[];
}

/**
 * What one party's territory records say about one point. The records that name the point itself (a country code) decide it
 * over the records that name World; among the records at that level an I record decides over an E record. Nothing here reads the
 * order of the records: the spec states include and exclude only by example ("...", which this reading covers in any order) and says nothing that makes the order of SPT records matter.
 *
 * Returns the I records that decide the point, or `[]` when the deciding records are all E (the party takes nothing there), or
 * undefined when the party has no record that names the point or World.
 */
function decidingRecords(list: readonly Terr[], code: string): Terr[] | undefined {
  const at = (match: (r: Terr) => boolean): Terr[] | undefined => {
    let any = false;
    const inc: Terr[] = [];
    for (const r of list) {
      if (!match(r)) continue;
      any = true;
      if (r.ind === 'I') inc.push(r);
    }
    return any ? inc : undefined;
  };
  return (code === '*' ? undefined : at(r => r.tis === code)) ?? at(r => r.tis === WORLD);
}

/**
 * Per-territory share totals over the given territory records.
 *
 * Reading of include/exclude (see `decidingRecords`): for one party (one SPU or one SWR), a country point is decided by the
 * party's records that name that country, else by its World records; an I record gives the party that record's shares there, an E
 * record gives it nothing, and where the same level holds several I records for one party (a duplicate the spec does not rule
 * out for general use) the party counts its largest share of each right, so the answer never depends on which comes first. Totals are
 * the sum over parties. Territories are points, not countries: a point is a code some record names, plus `*` for "...", so World is never expanded into countries.
 *
 * A party record whose indicator is not I or E, or whose TIS code is not four digits, takes no part (the field rules
 * report it). A work with a group other than World has no points: see `isUnexpandable`.
 */
export function territoryTotals(terrs: readonly Terr[]): TerritoryResult {
  if (terrs.length === 0) return { points: [], unexpanded: [] };
  const usable: Terr[] = [];
  const unexpanded: Terr[] = [];
  for (const r of terrs) {
    if (r.owner < 0 || (r.ind !== 'I' && r.ind !== 'E') || !/^\d{4}$/.test(r.tis)) continue;
    if (isUnexpandable(r.tis)) unexpanded.push(r);
    else usable.push(r);
  }
  if (unexpanded.length > 0) return { points: [], unexpanded };

  // Records per party, and the points: every country some record names, plus `*` (World and every territory no record names).
  const byParty = new Map<number, Terr[]>();
  const codes = new Set<string>(['*']);
  for (const r of usable) {
    const key = (r.ownerIsPub ? 1 : -1) * (r.owner + 1);
    const list = byParty.get(key);
    if (list) list.push(r);
    else byParty.set(key, [r]);
    if (r.tis !== WORLD) codes.add(r.tis);
  }

  const points: Point[] = [];
  for (const code of codes) {
    const by: Record<Right, Terr[]> = { pr: [], mr: [], sr: [] };
    const total: Record<Right, number> = { pr: 0, mr: 0, sr: 0 };
    const unreadable: Record<Right, boolean> = { pr: false, mr: false, sr: false };
    let covered = false;
    for (const list of byParty.values()) {
      const inc = decidingRecords(list, code);
      if (inc === undefined || inc.length === 0) continue; // nothing said about the point, or the party is excluded from it
      covered = true;
      for (const right of RIGHTS) {
        let best = 0;
        let holder: Terr | undefined;
        for (const d of inc) {
          const v = d[right];
          if (v === UNREADABLE) unreadable[right] = true;
          else if (v > best) {
            best = v;
            holder = d;
          }
        }
        if (holder) {
          total[right] += best;
          by[right].push(holder);
        }
      }
    }
    if (!covered) continue;
    for (const right of RIGHTS) if (unreadable[right]) total[right] = UNREADABLE;
    points.push({ code, by, total });
  }
  return { points, unexpanded };
}
