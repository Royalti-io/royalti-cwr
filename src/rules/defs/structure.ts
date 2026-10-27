import { getField } from '../../model/fields';
import { TXN_HEADERS } from '../../model/group';
import { defineRule } from '../registry';
import { S21, S22, spanOf, typeSpan, txnAnchor, WORK_TYPES } from '../locate';
import type { RuleCtx, RuleDef } from '../types';

/**
 * File, group and transaction structure: control records, their order, group ids, counts, and the
 * records a transaction must or may hold. Each rule cites the edit it implements.
 */

const BOTH = ['2.1', '2.2'] as const;

function reportOnType(ctx: RuleCtx, ref: number, params: Record<string, string | number>, extra: { message?: string; related?: { line: number; start: number; end: number; role: string }[] } = {}): void {
  const rec = ctx.doc.records[ref]!;
  const span = typeSpan(ctx, ref);
  ctx.report({ line: rec.line, start: span.start, end: span.end, params, ...extra });
}

/** FIL F 001: the first three characters must name a record type that CWR defines. */
const strF001 = defineRule({
  id: 'STR-F-001',
  title: 'Record type valid for the version',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL F 001',
  message: '"{type}" is not a record type of CWR {version}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.rec.status !== 'unknown-type') return;
    const span = typeSpan(ctx);
    ctx.report({ line: ctx.line, start: span.start, end: span.end, params: { type: ctx.rec.type, version: ctx.version } });
  },
});

const hdr1 = defineRule({
  id: 'HDR-1',
  title: 'First record is HDR',
  severity: 'error',
  scope: 'file',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 002',
  message: 'The first record must be HDR; found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const first = ctx.doc.records[0];
    if (first === undefined) {
      ctx.report({ line: -1, params: { found: 'no record' }, message: 'The file has no records, so it has no HDR as its first record.' });
      return;
    }
    if (first.type === 'HDR') return;
    reportOnType(ctx, 0, { found: first.type });
  },
});

const hdr2 = defineRule({
  id: 'HDR-2',
  title: 'Second record is GRH',
  severity: 'error',
  scope: 'file',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 003',
  message: 'The second record must be GRH; found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const { records } = ctx.doc;
    if (records.length === 0) return;
    const second = records[1];
    if (second === undefined) {
      ctx.report({ line: -1, params: { found: 'no record' }, message: 'The file has one record and no second record, so it has no GRH as its second record.' });
      return;
    }
    if (second.type === 'GRH') return;
    reportOnType(ctx, 1, { found: second.type });
  },
});

const trl1 = defineRule({
  id: 'TRL-1',
  title: 'Last record is TRL',
  severity: 'error',
  scope: 'file',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 005',
  message: 'The last record must be TRL; found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const { records } = ctx.doc;
    if (records.length === 0) return;
    const last = records.length - 1;
    if (records[last]!.type === 'TRL') return;
    reportOnType(ctx, last, { found: records[last]!.type });
  },
});

const file8 = defineRule({
  id: 'FILE-8',
  title: 'One HDR and one TRL',
  severity: 'error',
  scope: 'file',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 008',
  message: 'A file may hold one {type} record; this is another.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    let hdr = 0;
    let trl = 0;
    const { records } = ctx.doc;
    for (let ref = 0; ref < records.length; ref++) {
      const type = records[ref]!.type;
      if (type === 'HDR' && ++hdr > 1) reportOnType(ctx, ref, { type });
      else if (type === 'TRL' && ++trl > 1) reportOnType(ctx, ref, { type });
    }
  },
});

const file4 = defineRule({
  id: 'FILE-4',
  title: 'Every GRH after the first follows a GRT',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 004',
  message: 'This GRH follows a record of type {found}; every GRH after the first must follow a GRT.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.groupIndex < 1) return;
    const grh = ctx.group!.grh;
    const before = ctx.doc.records[grh - 1];
    if (before === undefined || before.type === 'GRT') return;
    reportOnType(ctx, grh, { found: before.type });
  },
});

const file6 = defineRule({
  id: 'FILE-6',
  title: 'GRH followed by a transaction header',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 006',
  message: 'The record after a GRH must be a transaction header; found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const grh = ctx.group!.grh;
    const next = ctx.doc.records[grh + 1];
    if (next === undefined || TXN_HEADERS.has(next.type)) return;
    reportOnType(ctx, grh + 1, { found: next.type }, { related: [{ line: ctx.doc.records[grh]!.line, start: 0, end: 3, role: 'GRH' }] });
  },
});

const file7 = defineRule({
  id: 'FILE-7',
  title: 'GRT followed by GRH or TRL',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'ER',
  cisac: 'FIL E 007',
  message: 'The record after a GRT must be GRH or TRL; found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const grt = ctx.group!.grt;
    if (grt === undefined) return;
    const next = ctx.doc.records[grt + 1];
    if (next === undefined || next.type === 'GRH' || next.type === 'TRL') return;
    reportOnType(ctx, grt + 1, { found: next.type }, { related: [{ line: ctx.doc.records[grt]!.line, start: 0, end: 3, role: 'GRT' }] });
  },
});

const grhF002 = defineRule({
  id: 'GRH-F-002',
  title: 'Group IDs start at 1 and rise by 1',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'GR',
  cisac: 'GRH F 002',
  message: 'Group IDs start at 1 and rise by 1: this group should be {expected}; found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const grh = ctx.group!.grh;
    const value = getField(ctx.doc, grh, 'groupId');
    if (value === undefined || value.length < 5 || !/^\d+$/.test(value)) return; // blank or non-numeric: FMT-M / FMT-N
    const expected = ctx.groupIndex + 1;
    if (Number(value) === expected) return;
    const span = spanOf(ctx.doc, grh, 'groupId')!;
    ctx.report({ line: ctx.doc.records[grh]!.line, start: span.start, end: span.end, fieldId: 'groupId', params: { expected, found: Number(value) } });
  },
});

const grhF005 = defineRule({
  id: 'GRH-F-005',
  title: 'Each transaction type once per file',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'GR',
  cisac: 'GRH F 005',
  message: 'Transaction type {type} already heads the group at line {first}, and a file may not have two groups of one type.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const groups = ctx.doc.file.groups;
    const me = groups[ctx.groupIndex]!;
    if (me.type.trim() === '') return;
    for (let i = 0; i < ctx.groupIndex; i++) {
      if (groups[i]!.type === me.type) {
        const span = spanOf(ctx.doc, me.grh, 'transactionType')!;
        ctx.report({
          line: ctx.doc.records[me.grh]!.line,
          start: span.start,
          end: span.end,
          fieldId: 'transactionType',
          params: { type: me.type, first: ctx.doc.records[groups[i]!.grh]!.line + 1 },
          related: [{ line: ctx.doc.records[groups[i]!.grh]!.line, start: span.start, end: span.end, role: 'first group of this type' }],
        });
        return;
      }
    }
  },
});

const grtF001 = defineRule({
  id: 'GRT-F-001',
  title: 'GRT Group ID equals the GRH Group ID',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'GR',
  cisac: 'GRT F 001',
  message: 'GRT Group ID {found} should equal the Group ID {expected} on the GRH.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const { grh, grt } = ctx.group!;
    if (grt === undefined) return;
    const a = getField(ctx.doc, grh, 'groupId');
    const b = getField(ctx.doc, grt, 'groupId');
    if (a === undefined || b === undefined || a.length < 5 || b.length < 5 || a === b) return;
    const span = spanOf(ctx.doc, grt, 'groupId')!;
    ctx.report({
      line: ctx.doc.records[grt]!.line,
      start: span.start,
      end: span.end,
      fieldId: 'groupId',
      params: { expected: a, found: b },
      related: [{ line: ctx.doc.records[grh]!.line, ...spanOf(ctx.doc, grh, 'groupId')!, role: 'GRH Group ID' }],
    });
  },
});

function countRule(
  id: string,
  title: string,
  fieldId: 'transactionCount' | 'recordCount',
  quote: string,
  specAction: 'GR',
  expectedOf: (ctx: RuleCtx) => number,
  what: string,
): RuleDef {
  return defineRule({
    id,
    title,
    severity: 'error',
    scope: 'group',
    versions: BOTH,
    specAction,
    cisac: id.replace(/-F-/, ' F ').replace(/(\d+)$/, '$1'),
    message: `GRT ${what} is {found}; the group has {expected}.`,
    source: { slug: S21, quote },
    alsoSource: [{ slug: S22, quote }],
    run(ctx) {
      const { grt } = ctx.group!;
      if (grt === undefined) return;
      const value = getField(ctx.doc, grt, fieldId);
      if (value === undefined || value.length < 8 || !/^\d+$/.test(value)) return; // short or non-numeric: STR-LEN / FMT-N
      const expected = expectedOf(ctx);
      if (Number(value) === expected) return;
      const span = spanOf(ctx.doc, grt, fieldId)!;
      ctx.report({ line: ctx.doc.records[grt]!.line, start: span.start, end: span.end, fieldId, params: { expected, found: Number(value) } });
    },
  });
}

const grtF002 = countRule(
  'GRT-F-002',
  'GRT transaction count',
  'transactionCount',
  '',
  'GR',
  ctx => ctx.group!.transactions.length,
  'transaction count',
);
const grtF003 = countRule(
  'GRT-F-003',
  'GRT record count',
  'recordCount',
  '',
  'GR',
  ctx => ctx.group!.grt! - ctx.group!.grh + 1,
  'record count',
);

function trlRule(id: string, title: string, fieldId: 'groupCount' | 'transactionCount' | 'recordCount', quote: string, what: string, expectedOf: (ctx: RuleCtx) => number, width: number): RuleDef {
  return defineRule({
    id,
    title,
    severity: 'error',
    scope: 'file',
    versions: BOTH,
    specAction: 'ER',
    cisac: id.replace(/-F-/, ' F '),
    message: `TRL ${what} is {found}; the file has {expected}.`,
    source: { slug: S21, quote },
    alsoSource: [{ slug: S22, quote }],
    run(ctx) {
      const trl = ctx.doc.file.trl;
      if (trl === undefined) return;
      const value = getField(ctx.doc, trl, fieldId);
      if (value === undefined || value.length < width || !/^\d+$/.test(value)) return;
      const expected = expectedOf(ctx);
      if (Number(value) === expected) return;
      const span = spanOf(ctx.doc, trl, fieldId)!;
      ctx.report({ line: ctx.doc.records[trl]!.line, start: span.start, end: span.end, fieldId, params: { expected, found: Number(value) } });
    },
  });
}

const trlF001 = trlRule(
  'TRL-F-001',
  'TRL group count',
  'groupCount',
  '',
  'group count',
  ctx => ctx.doc.file.groups.length,
  5,
);
const trlF002 = trlRule(
  'TRL-F-002',
  'TRL transaction count',
  'transactionCount',
  '',
  'transaction count',
  ctx => ctx.doc.file.groups.reduce((n, g) => n + g.transactions.length, 0),
  8,
);
const trlF003 = trlRule(
  'TRL-F-003',
  'TRL record count',
  'recordCount',
  '',
  'record count',
  ctx => ctx.doc.file.trl! - (ctx.doc.file.hdr ?? 0) + 1,
  8,
);

const nwrT022 = defineRule({
  id: 'NWR-T-022',
  title: 'Transaction type equals the GRH type',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK_TYPES,
  specAction: 'GR',
  cisac: 'NWR T 022',
  message: 'This transaction is {type}; the group header says {group}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const group = ctx.group!;
    if (group.type === 'ACK') return; // ACK groups carry their own edit (ACK T 004); an EXC may continue an ACK
    const type = ctx.rec.type;
    if (type === group.type) return;
    reportOnType(ctx, ctx.txn!.header, { type, group: group.type }, {
      related: [{ line: ctx.doc.records[group.grh]!.line, ...spanOf(ctx.doc, group.grh, 'transactionType')!, role: 'GRH Transaction Type' }],
    });
  },
});

/** Detail records allowed in a work transaction, from the spec's Transaction Format table (4.5.2). */
const WORK_DETAIL_21: ReadonlySet<string> = new Set([
  'SPU', 'NPN', 'SPT', 'OPU', 'SWR', 'NWN', 'SWT', 'PWR', 'OWR', 'ALT', 'NAT', 'EWT', 'NET', 'VER', 'NVT', 'PER', 'NPR',
  'REC', 'ORN', 'INS', 'IND', 'COM', 'NCT', 'NOW', 'ARI',
]);
/** The 2.2 table adds OPT, OWT and XRF. */
const WORK_DETAIL_22: ReadonlySet<string> = new Set([...WORK_DETAIL_21, 'OPT', 'OWT', 'XRF']);

const nwrT008 = defineRule({
  id: 'NWR-T-008',
  title: 'Detail record allowed in this transaction',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['TER', 'IPA', 'NPA', 'SPU', 'OPU', 'NPN', 'SPT', 'OPT', 'SWR', 'OWR', 'NWN', 'SWT', 'OWT', 'PWR', 'ALT', 'NAT', 'EWT', 'VER', 'PER', 'NPR', 'REC', 'ORN', 'INS', 'IND', 'COM', 'MSG', 'NET', 'NCT', 'NVT', 'NOW', 'ARI', 'XRF'],
  specAction: 'RR',
  cisac: 'NWR T 008',
  message: '{type} is not in the Transaction Format table of {header} transactions.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.rec.status === 'unknown-type' || ctx.txnHeader < 0) return;
    const header = ctx.doc.records[ctx.txnHeader]!.type;
    if (header !== 'NWR' && header !== 'REV' && header !== 'ISW') return; // EXC may bypass the edits; ACK carries MSG
    const allowed = ctx.version === '2.2' ? WORK_DETAIL_22 : WORK_DETAIL_21;
    if (allowed.has(ctx.rec.type)) return;
    const span = typeSpan(ctx);
    ctx.report({ line: ctx.line, start: span.start, end: span.end, params: { type: ctx.rec.type, header } });
  },
});

const nwrT012 = defineRule({
  id: 'NWR-T-012',
  title: 'At least one writer record',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR T 012',
  message: 'This {type} transaction has no SWR or OWR record.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const txn = ctx.txn!;
    const { records } = ctx.doc;
    for (const ref of txn.records) {
      const t = records[ref]!.type;
      if (t === 'SWR' || t === 'OWR') return;
    }
    const a = txnAnchor(ctx);
    ctx.report({ line: a.line, start: a.start, end: a.end, params: { type: ctx.rec.type } });
  },
});

// Record order inside a work (NWR-T-018 in 2.1, NWR-T-043 in 2.2).
//
// The spec prints one flat sequence. Its own BNF (section 6.1) lets a publisher chain repeat
// (SPU, NPN, SPT, SPU, SPT ...), so the sequence is read as sections: the position of the first listed
// occurrence of each type, with NPN, NWN, PWR, OPT and NOW taking the section of the record they hang on.
// A record is reported when it sits in an earlier section than a record before it; the check keeps the
// longest in-order run and reports the records outside it.

const RANK_21: Readonly<Record<string, number>> = {
  NWR: 0, REV: 0, ISW: 0, EXC: 0,
  SPU: 1, NPN: 1, SPT: 1,
  OPU: 2,
  SWR: 3, NWN: 3, SWT: 3, PWR: 3,
  OWR: 4,
  ALT: 5, NAT: 6, EWT: 7, NET: 8, VER: 9, NVT: 10, PER: 11, NPR: 12, REC: 13, ORN: 14, INS: 15, IND: 16, COM: 17, NCT: 18, NOW: 8, ARI: 19,
};
const RANK_22: Readonly<Record<string, number>> = { ...RANK_21, OPT: 1, OWT: 4, XRF: 20 };

/** Rank of each record of a work transaction, or -1 for a type the order does not place. */
function ranksOf(types: readonly string[], table: Readonly<Record<string, number>>): number[] {
  const ranks: number[] = [];
  let lastPublisher = 1; // section of the latest SPU/OPU
  let lastWriter = 3; // section of the latest SWR/OWR
  let lastNowAnchor = 8; // section of the latest title record NOW hangs on
  for (const t of types) {
    let r = table[t] ?? -1;
    if (r >= 0) {
      if (t === 'SPU') lastPublisher = 1;
      else if (t === 'OPU') lastPublisher = 2;
      else if (t === 'SWR') lastWriter = 3;
      else if (t === 'OWR') lastWriter = 4;
      else if (t === 'NPN' || t === 'OPT') r = lastPublisher;
      else if (t === 'NWN' || t === 'PWR') r = lastWriter;
      if (t === 'EWT' || t === 'NET') lastNowAnchor = 8;
      else if (t === 'VER' || t === 'NVT') lastNowAnchor = 10;
      else if (t === 'COM' || t === 'NCT') lastNowAnchor = 18;
      else if (t === 'NOW') r = lastNowAnchor;
    }
    ranks.push(r);
  }
  return ranks;
}

/** Indexes (into `ranks`, ignoring -1) that are not part of a longest non-decreasing subsequence. */
function outOfOrder(ranks: readonly number[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < ranks.length; i++) if (ranks[i]! >= 0) idx.push(i);
  const tails: number[] = []; // index into idx of the smallest tail of a run of each length
  const prev = new Int32Array(idx.length).fill(-1);
  for (let k = 0; k < idx.length; k++) {
    const r = ranks[idx[k]!]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ranks[idx[tails[mid]!]!]! <= r) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[k] = tails[lo - 1]!;
    tails[lo] = k;
  }
  const keep = new Set<number>();
  let k = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (k >= 0) {
    keep.add(idx[k]!);
    k = prev[k]!;
  }
  return idx.filter(i => !keep.has(i));
}

function orderRule(id: string, version: '2.1' | '2.2', table: Readonly<Record<string, number>>, source: { slug: string; quote: string }, alsoSource: { slug: string; quote: string }[]): RuleDef {
  return defineRule({
    id,
    title: 'Record order inside a work',
    severity: 'error',
    scope: 'transaction',
    versions: [version],
    records: ['NWR', 'REV', 'ISW'],
    specAction: 'TR',
    cisac: 'NWR T 049',
    message: '{type} is out of the order the specification gives for the records of a work.',
    source,
    alsoSource,
    run(ctx) {
      const txn = ctx.txn!;
      const { records } = ctx.doc;
      const types = [ctx.rec.type, ...txn.records.map(r => records[r]!.type)];
      const refs = [txn.header, ...txn.records];
      const bad = outOfOrder(ranksOf(types, table));
      for (const i of bad) {
        if (i === 0) continue;
        const ref = refs[i]!;
        reportOnType(ctx, ref, { type: records[ref]!.type });
      }
    },
  });
}

const nwrT018 = orderRule(
  'NWR-T-018',
  '2.1',
  RANK_21,
  { slug: S21, quote: '' },
  [
    { slug: S21, quote: '' },
    { slug: 'cisac/cwr-error-messages', quote: '' },
  ],
);
const nwrT043 = orderRule(
  'NWR-T-043',
  '2.2',
  RANK_22,
  { slug: S22, quote: '' },
  [{ slug: S22, quote: '' }],
);

/** "..." */
function onlyOneRule(type: 'EWT' | 'VER', quote: string): RuleDef {
  return defineRule({
    id: `${type}-R-001`,
    title: `One ${type} per work`,
    severity: 'error',
    scope: 'transaction',
    versions: BOTH,
    records: ['NWR', 'REV', 'ISW'],
    specAction: 'TR',
    cisac: `${type} R 001`,
    message: `Only one ${type} record is allowed per transaction; this is another.`,
    source: { slug: S21, quote },
    alsoSource: [{ slug: S22, quote }],
    run(ctx) {
      const { records } = ctx.doc;
      let seen = 0;
      for (const ref of ctx.txn!.records) {
        if (records[ref]!.type === type && ++seen > 1) reportOnType(ctx, ref, {});
      }
    },
  });
}

const ewtR001 = onlyOneRule('EWT', '');
const verR001 = onlyOneRule('VER', '');

const indR001 = defineRule({
  id: 'IND-R-001',
  title: 'IND follows an INS or IND',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['IND'],
  specAction: 'RR',
  cisac: 'IND R 001',
  message: 'This IND record sits after {found}, which cannot precede an IND. The record before it has to be an INS or another IND.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.txnHeader < 0 || ctx.doc.records[ctx.txnHeader]!.type === 'ACK') return; // an ACK puts MSG records in front of the record they describe
    const prev = ctx.doc.records[ctx.ref - 1];
    if (prev && (prev.type === 'INS' || prev.type === 'IND')) return;
    const span = typeSpan(ctx);
    ctx.report({ line: ctx.line, start: span.start, end: span.end, params: { found: prev ? prev.type : 'nothing' } });
  },
});

const comR001 = defineRule({
  id: 'COM-R-001',
  title: 'COM only on a composite work',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['COM'],
  specAction: 'RR',
  cisac: 'COM R 001',
  message: 'A COM record can only be entered for a work whose Composite Type is entered; the work header has none.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.txnHeader < 0) return;
    const header = ctx.doc.records[ctx.txnHeader]!;
    if (header.type !== 'NWR' && header.type !== 'REV' && header.type !== 'ISW') return; // EXC may bypass the edits; an ACK carries its own
    const composite = getField(ctx.doc, ctx.txnHeader, 'compositeType');
    if (composite === undefined || composite.length < 3 || composite.trim() !== '') return; // entered, or the header is too short to say
    const span = typeSpan(ctx);
    ctx.report({ line: ctx.line, start: span.start, end: span.end, params: {} });
  },
});

const ackT002 = defineRule({
  id: 'ACK-T-002',
  title: 'ACK followed by NWR, REV or AGR',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: ['ACK'],
  specAction: 'TR',
  cisac: 'ACK T 002',
  message: 'An ACK must be followed by an NWR, REV or AGR transaction; {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const txn = ctx.txn!;
    // The spec lets an ACK answer a problem with the HDR or TRL record; that ACK has no work behind it.
    const original = getField(ctx.doc, txn.header, 'originalTransactionType')?.trim();
    if (original === 'HDR' || original === 'TRL') return;
    const inner = txn.inner?.[0];
    const type = inner ? ctx.doc.records[inner.header]!.type : undefined;
    if (type === 'NWR' || type === 'REV' || type === 'AGR') return;
    reportOnType(ctx, txn.header, { found: type === undefined ? 'nothing follows it in the group' : `${type} follows it` });
  },
});

const ackT003 = defineRule({
  id: 'ACK-T-003',
  title: 'EXC follows an NWR or REV inside an ACK',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: ['EXC'],
  specAction: 'TR',
  cisac: 'ACK T 003',
  message: 'This EXC transaction does not come right after an ACK transaction that carries an NWR or REV.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const txns = ctx.group!.transactions;
    const i = txns.indexOf(ctx.txn!);
    const before = i > 0 ? txns[i - 1]! : undefined;
    const records = ctx.doc.records;
    if (before && records[before.header]!.type === 'ACK' && before.inner && before.inner.length > 0) {
      const t = records[before.inner[0]!.header]!.type;
      if (t === 'NWR' || t === 'REV') return;
    }
    reportOnType(ctx, ctx.txn!.header, {});
  },
});

const agrT002 = defineRule({
  id: 'AGR-T-002',
  title: 'AGR has a TER record',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: ['AGR'],
  specAction: 'TR',
  cisac: 'AGR T 002',
  message: 'This AGR transaction has no TER record.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const { records } = ctx.doc;
    for (const ref of ctx.txn!.records) if (records[ref]!.type === 'TER') return;
    reportOnType(ctx, ctx.txn!.header, {});
  },
});

const agrT003 = defineRule({
  id: 'AGR-T-003',
  title: 'AGR has an assignor and an acquirer IPA record',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: ['AGR'],
  specAction: 'TR',
  cisac: 'AGR T 003',
  message: 'This AGR transaction needs two or more IPA records, one with role code AS (assignor) and one with AC (acquirer); it has {ipa} IPA {plural}, {assignors} AS and {acquirers} AC.',
  source: {
    slug: S21,
    quote: '',
  },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const { records } = ctx.doc;
    let ipa = 0;
    let as = 0;
    let ac = 0;
    for (const ref of ctx.txn!.records) {
      if (records[ref]!.type !== 'IPA') continue;
      ipa++;
      const role = getField(ctx.doc, ref, 'agreementRoleCode')?.trim();
      if (role === 'AS') as++;
      else if (role === 'AC') ac++;
    }
    if (ipa >= 2 && as >= 1 && ac >= 1) return;
    reportOnType(ctx, ctx.txn!.header, { ipa, plural: ipa === 1 ? 'record' : 'records', assignors: as, acquirers: ac });
  },
});

export const STRUCTURE_RULES: readonly RuleDef[] = [
  strF001, hdr1, hdr2, trl1, file4, file6, file7, file8,
  grhF002, grhF005, grtF001, grtF002, grtF003, trlF001, trlF002, trlF003,
  nwrT022, nwrT008, nwrT012, nwrT018, nwrT043, ewtR001, verR001, indR001, comR001, ackT002, ackT003, agrT002, agrT003,
];

