import { defineRule } from '../registry';
import { DETAIL_TYPES, HEADER_TYPES, S21, S22 } from '../locate';
import type { RuleDef } from '../types';

/**
 * Record prefix edits (spec section 2.1.5/2.1.6 in 2.1; the same list in 2.2): transaction sequence
 * numbers and record sequence numbers. Position decides which transaction a record belongs to; these
 * rules check the numbers against that position. They skip a record whose prefix is not numeric
 * (FMT-N reports that).
 */

/**
 * The two sequence numbers sit at the same place in every record that has a prefix (characters 4 to 11 and 12 to 19), so the spans do not come
 * from a layout: a record type with no layout in this version (an OPT in a 2.1 file) still has a prefix to point at.
 */
const TSEQ = { start: 3, end: 11 };
const RSEQ = { start: 11, end: 19 };

const BOTH = ['2.1', '2.2'] as const;

const pfx2 = defineRule({
  id: 'PFX-2',
  title: 'Transaction Sequence # starts at 0 in each group',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: HEADER_TYPES,
  specAction: 'ER',
  cisac: 'FIL F 002',
  message: 'The first transaction in a group must have Transaction Sequence # 0; this one has {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.groupIndex < 0 || ctx.prevHeader !== -1 || ctx.continuation || ctx.rec.tseq === undefined) return;
    if (ctx.rec.tseq === 0) return;
    const span = TSEQ;
    ctx.report({ line: ctx.line, start: span.start, end: span.end, fieldId: 'transactionSequence', params: { expected: 0, found: ctx.rec.tseq } });
  },
});

const pfx3 = defineRule({
  id: 'PFX-3',
  title: 'Transaction Sequence # rises by 1 per transaction',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: HEADER_TYPES,
  specAction: 'TR',
  cisac: 'FIL F 003',
  message: 'Transaction Sequence # should be {expected} (the previous transaction is {previous}); found {found}.',
  source: {
    slug: S21,
    quote: '',
  },
  alsoSource: [
    {
      slug: S22,
      quote: '',
    },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    if (ctx.groupIndex < 0 || ctx.prevHeader < 0 || ctx.rec.tseq === undefined) return;
    const prev = ctx.doc.records[ctx.prevHeader]!;
    if (prev.tseq === undefined) return;
    const expected = ctx.continuation ? prev.tseq : prev.tseq + 1;
    if (ctx.rec.tseq === expected) return;
    // One odd number in the middle: the record after it is consistent with the one before, so only the odd one is reported.
    if (!ctx.continuation && ctx.prev2Header >= 0) {
      const prev2 = ctx.doc.records[ctx.prev2Header]!;
      if (prev2.tseq !== undefined && ctx.rec.tseq === prev2.tseq + 2) return;
    }
    const span = TSEQ;
    ctx.report({
      line: ctx.line,
      start: span.start,
      end: span.end,
      fieldId: 'transactionSequence',
      params: { expected, previous: prev.tseq, found: ctx.rec.tseq },
      related: [{ line: prev.line, start: span.start, end: span.end, role: 'previous transaction' }],
    });
  },
});

const pfx4 = defineRule({
  id: 'PFX-4',
  title: 'Detail records keep the Transaction Sequence # of the record before',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: DETAIL_TYPES,
  specAction: 'TR',
  cisac: 'FIL F 004',
  message: 'Transaction Sequence # should equal the previous record’s ({expected}); found {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.txnHeader < 0 || ctx.rec.tseq === undefined) return;
    const prev = ctx.doc.records[ctx.ref - 1];
    if (!prev || prev.tseq === undefined || prev.tseq === ctx.rec.tseq) return;
    // One odd number in the middle: the record after it agrees with the one before, so only the odd one is reported.
    const prev2 = ctx.doc.records[ctx.ref - 2];
    if (prev2 && prev2.tseq === ctx.rec.tseq && ctx.txnHeader <= ctx.ref - 2) return;
    const span = TSEQ;
    ctx.report({
      line: ctx.line,
      start: span.start,
      end: span.end,
      fieldId: 'transactionSequence',
      params: { expected: prev.tseq, found: ctx.rec.tseq },
      related: [{ line: prev.line, start: span.start, end: span.end, role: 'previous record' }],
    });
  },
});

const pfx5 = defineRule({
  id: 'PFX-5',
  title: 'Transaction header has Record Sequence # 0',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: HEADER_TYPES,
  specAction: 'ER',
  cisac: 'FIL F 005',
  message: 'A transaction header must have Record Sequence # {expected}; this one has {found}.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    if (ctx.rec.rseq === undefined) return;
    let expected = 0;
    if (ctx.continuation) {
      // Spec note [1]: a header that continues an ACK's transaction carries on counting.
      const prev = ctx.doc.records[ctx.ref - 1];
      if (!prev || prev.rseq === undefined) return;
      expected = prev.rseq + 1;
    }
    if (ctx.rec.rseq === expected) return;
    const span = RSEQ;
    ctx.report({ line: ctx.line, start: span.start, end: span.end, fieldId: 'recordSequence', params: { expected, found: ctx.rec.rseq } });
  },
});

const pfx6 = defineRule({
  id: 'PFX-6',
  title: 'Record Sequence # rises by 1 per detail record',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: DETAIL_TYPES,
  specAction: 'ER',
  cisac: 'FIL F 006',
  message: 'Record Sequence # should be {expected} (the previous record is {previous}); found {found}.',
  source: {
    slug: S21,
    quote: '',
  },
  alsoSource: [
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    if (ctx.txnHeader < 0 || ctx.rec.rseq === undefined) return;
    const prev = ctx.doc.records[ctx.ref - 1];
    if (!prev || prev.rseq === undefined) return;
    // A header's own number is PFX-5's: the first detail after a header is 1 whatever the header says
    // (a header that continues an ACK counts on, so its number stands).
    const afterPlainHeader = ctx.ref - 1 === ctx.txnHeader && !ctx.continuationAt(ctx.ref - 1);
    const expected = (afterPlainHeader ? 0 : prev.rseq) + 1;
    if (ctx.rec.rseq === expected) return;
    // One odd number in the middle: the record after it is consistent with the one before, so only the odd one is reported.
    const prev2 = ctx.doc.records[ctx.ref - 2];
    if (prev2 && prev2.rseq !== undefined && ctx.rec.rseq === prev2.rseq + 2 && ctx.txnHeader <= ctx.ref - 2) return;
    const span = RSEQ;
    ctx.report({
      line: ctx.line,
      start: span.start,
      end: span.end,
      fieldId: 'recordSequence',
      params: { expected, previous: prev.rseq, found: ctx.rec.rseq },
      related: [{ line: prev.line, start: span.start, end: span.end, role: 'previous record' }],
    });
  },
});

export const PREFIX_RULES: readonly RuleDef[] = [pfx2, pfx3, pfx4, pfx5, pfx6];
