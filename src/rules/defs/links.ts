import { findField, lineText } from '../../model/fields';
import { ERR, S21, S22 } from '../locate';
import { defineRule } from '../registry';
import type { Citation, ReportInput, RuleCtx, RuleDef } from '../types';
import { isBlankAt, isZerosAt } from '../util';
import type { Located, Work } from '../work';
import { LOOKUPS } from '../../spec/lookups/index';
import { fieldOfType, FULL, pct, reaches, RIGHTS, sumRight, TOLERANCE, UNREADABLE, workOf } from '../work';

/**
 * Links between records of a work: publisher chains and their Publisher Sequence #, which record may follow which, and
 * the Interested Party # and Publisher Sequence # that tie SPT, SWT, NPN, NWN and PWR records back to the SPU or SWR they
 * belong to. Each rule reads the work's analysis (work.ts) and reports on the record that is wrong.
 *
 * A chain opens at the first publisher record, after a record that is not a publisher, at a publisher of type E, and at an OPU
 * with no type (the spec defaults it to E). Every other record is linked by its Publisher Sequence #, as the spec says ("..."):
 * a PA with the number of an earlier chain is in that chain, and a PA with a number of its own opens one. A record whose number
 * names no earlier chain of its kind goes with the chain in front of it, and SPU-R-005 reports the number. See work.ts.
 *
 * The edits say "must be entered" for fields the layout marks M; FMT-M already reports those, so the rules here skip a
 * blank where FMT-M speaks and report it only where the field is conditional (2.2 SWT, PWR).
 */

const BOTH = ['2.1', '2.2'] as const;
const V21 = ['2.1'] as const;
const V22 = ['2.2'] as const;
const WORK = ['NWR', 'REV', 'ISW'] as const;

function cite(quote: string, quote22: string = quote): { source: Citation; alsoSource: Citation[] } {
  return { source: { slug: S21, quote }, alsoSource: [{ slug: S22, quote: quote22 }] };
}

/** Report input for one field of a located record. */
function onField(ctx: RuleCtx, rec: Located, fieldId: string, extra: Partial<ReportInput> = {}): ReportInput {
  const f = fieldOfType(ctx.doc, rec.type, fieldId);
  return { line: rec.line, start: f ? f.start : 0, end: f ? f.end : 3, fieldId, params: {}, ...extra };
}

function onType(rec: Located, extra: Partial<ReportInput> = {}): ReportInput {
  return { line: rec.line, start: 0, end: 3, params: {}, ...extra };
}

function fieldRel(ctx: RuleCtx, rec: Located, fieldId: string, role: string): NonNullable<ReportInput['related']>[number][] {
  const f = fieldOfType(ctx.doc, rec.type, fieldId);
  return f ? [{ line: rec.line, start: f.start, end: f.end, role }] : [];
}

// ------------------------------------------------------------------ publisher chains

const spuF001 = defineRule({
  id: 'SPU-F-001',
  title: 'Publisher Sequence # starts at 1 and rises by 1 per chain',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU F 001',
  message: 'Publisher Sequence # is {found}; the chain should have {expected} ({why}).',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    let prev: number | null | undefined;
    for (const chain of w.chains) {
      const p = w.pubs[chain.pubs[0]!]!;
      if (p.seq === null) {
        prev = null; // blank or not digits: FMT-M / FMT-N; the next chain has nothing to count from
        continue;
      }
      const expected = prev === undefined ? 1 : prev === null ? null : prev + 1;
      if (expected !== null && p.seq !== expected) {
        ctx.report(
          onField(ctx, p, 'publisherSequenceNumber', {
            params: { found: p.seq, expected, why: prev === undefined ? 'the first chain on a work is 1' : `the chain before it has ${prev}` },
          }),
        );
      }
      prev = p.seq;
    }
  },
});

const spuR002 = defineRule({
  id: 'SPU-R-002',
  title: 'A chain opens with Publisher Type E or PA',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU R 002',
  message: 'The first SPU of this chain has Publisher Type "{found}", and a chain can only open with E or PA.',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const chain of w.chains) {
      const p = w.pubs[chain.pubs[0]!]!;
      // A blank type is SPU-F-005's and a type outside the table is LKP-TBL's.
      if (chain.began !== 'SPU' || !LOOKUPS.publisherType.has(p.pubType) || p.pubType === 'E' || p.pubType === 'PA') continue;
      ctx.report(onField(ctx, p, 'publisherType', { params: { found: p.pubType } }));
    }
  },
});

const spuR005 = defineRule({
  id: 'SPU-R-005',
  title: 'Administrators and sub-publishers carry the chain’s sequence number',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU R 005',
  message: 'Publisher Sequence # is {found}; this publisher administers or sub-publishes for the one with sequence number {expected}.',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const chain of w.chains) {
      const first = w.pubs[chain.pubs[0]!]!;
      if (first.seq === null) continue;
      for (let k = 1; k < chain.pubs.length; k++) {
        const p = w.pubs[chain.pubs[k]!]!;
        if (p.seq === null || p.seq === first.seq) continue;
        ctx.report(
          onField(ctx, p, 'publisherSequenceNumber', {
            params: { found: p.seq, expected: first.seq },
            related: fieldRel(ctx, first, 'publisherSequenceNumber', 'the chain’s first publisher'),
          }),
        );
      }
    }
  },
});

const spuR006 = defineRule({
  id: 'SPU-R-006',
  title: 'An OPU chain holds OPU records only',
  severity: 'error',
  scope: 'transaction',
  versions: V21,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU R 006',
  message: 'An SPU record follows an OPU that opens this chain; a chain that opens with an OPU holds OPU records and nothing else.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    for (const chain of w.chains) {
      if (chain.began !== 'OPU') continue;
      for (const i of chain.pubs) {
        const p = w.pubs[i]!;
        if (p.type === 'SPU') ctx.report(onType(p));
      }
    }
  },
});

const spuR007 = defineRule({
  id: 'SPU-R-007',
  title: 'No SPT record in an OPU chain',
  severity: 'error',
  scope: 'transaction',
  versions: V21,
  records: WORK,
  specAction: 'RR',
  cisac: 'SPU R 007',
  message: 'An SPT record belongs to a chain that begins with an OPU; territory records are not allowed in such a chain.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'SPT' || !t.ownerIsPub || t.owner < 0) continue;
      if (w.chains[w.pubs[t.owner]!.chain]!.began === 'OPU') ctx.report(onType(t));
    }
  },
});

const nwrT016 = defineRule({
  id: 'NWR-T-016',
  title: 'No OPU in an SPU chain',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 016',
  message: 'This chain was opened by a controlled publisher (SPU) and then lists a non-controlled one (OPU); the two cannot share a chain.',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const chain of w.chains) {
      if (chain.began !== 'SPU') continue;
      for (const i of chain.pubs) {
        const p = w.pubs[i]!;
        if (p.type === 'OPU') ctx.report(onType(p));
      }
    }
  },
});

const nwrT017 = defineRule({
  id: 'NWR-T-017',
  title: 'One original publisher per chain',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 017',
  message: 'A second original publisher (Publisher Type E) has Publisher Sequence # {seq}, the same chain as the one at line {first}; a chain has one.',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    const seen = new Map<number, Located>();
    for (const p of w.pubs) {
      if (p.pubType !== 'E' || p.seq === null) continue;
      const earlier = seen.get(p.seq);
      if (earlier) {
        ctx.report(onField(ctx, p, 'publisherType', { params: { seq: p.seq, first: earlier.line + 1 }, related: fieldRel(ctx, earlier, 'publisherType', 'the first E in this chain') }));
      } else seen.set(p.seq, p);
    }
  },
});

const spuF032 = defineRule({
  id: 'SPU-F-032',
  title: 'An acquirer follows an original publisher',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU F 032',
  message: 'An AQ publisher must follow an SPU record of type E; the record before this one is {found}.',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (let i = 0; i < w.pubs.length; i++) {
      const p = w.pubs[i]!;
      if (p.type !== 'SPU' || p.pubType !== 'AQ') continue;
      const before = i > 0 ? w.pubs[i - 1]! : undefined;
      if (before && before.type === 'SPU' && before.pubType === 'E') continue;
      ctx.report(onField(ctx, p, 'publisherType', { params: { found: before ? `${before.type} of type "${before.pubType}"` : 'no publisher' } }));
    }
  },
});

const spuD001 = defineRule({
  id: 'SPU-D-001',
  title: 'A linked publisher stands after another chain’s records',
  severity: 'warning',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  message:
    'This publisher has Publisher Sequence # {seq}, the number of the original publisher or income participant at line {first}, so the specification links it to that chain, and its shares and territories are counted there. ' +
    'It stands after the records of another chain. The specification lists the administrators and sub-publishers of a chain right after their original publisher; it prints no edit for the position, so this is a warning.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const p of w.pubs) {
      if (!p.outOfPlace) continue;
      const first = w.pubs[w.chains[p.chain]!.pubs[0]!]!;
      ctx.report(
        onField(ctx, p, 'publisherSequenceNumber', {
          params: { seq: p.seqText, first: first.line + 1 },
          related: fieldRel(ctx, first, 'publisherSequenceNumber', 'the chain’s first publisher'),
        }),
      );
    }
  },
});

const spuF040 = defineRule({
  id: 'SPU-F-040',
  title: 'A collecting publisher has an IPI Name #',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  // The CWR error-message list prints this edit as "SPU F 039", sub-code 058 ("...").
  cisac: 'SPU F 039',
  message:
    'This SPU is followed by an SPT, so it is the collecting publisher and represents the file submitter, and its Publisher IPI Name # must be entered; it is {found}. ' +
    'The edit says "the collecting publisher"; the field description says an SPU "followed by an SPT" is the one.',
  source: { slug: S22, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    const f = fieldOfType(ctx.doc, 'SPU', 'publisherIpiNameNumber');
    if (!f) return;
    const withSpt = new Set<number>();
    for (const t of w.terrs) if (t.type === 'SPT' && t.ownerIsPub && t.owner >= 0) withSpt.add(t.owner);
    for (const i of withSpt) {
      const p = w.pubs[i]!;
      if (p.type !== 'SPU' || p.len < f.end) continue; // a cut record is STR-LEN's
      const text = lineText(ctx.doc, p.line);
      const blank = isBlankAt(text, f.start, f.end);
      if (!blank && !isZerosAt(text, f.start, f.end)) continue;
      ctx.report(onField(ctx, p, 'publisherIpiNameNumber', { params: { found: blank ? 'blank' : 'all zeros' } }));
    }
  },
});

// ------------------------------------------------------------------ unknown party indicators (record rules, FR)

function unknownRule(
  id: string,
  records: string,
  indicator: 'publisherUnknownIndicator' | 'writerUnknownIndicator',
  nameField: 'publisherName' | 'writerLastName',
  kind: 'flag' | 'name',
  quote: string,
  what: string,
): RuleDef {
  return defineRule({
    id,
    title: what,
    severity: 'warning',
    scope: 'record',
    versions: BOTH,
    records: [records],
    specAction: 'FR',
    cisac: id.replace(/-/g, ' '),
    message:
      kind === 'flag'
        ? `${indicator === 'publisherUnknownIndicator' ? 'Publisher' : 'Writer'} Unknown Indicator is "{value}"; on an ${records} record it must be Y or N when entered. Edit {edit} is an FR edit: a receiver drops the value and uses a default instead.`
        : `${indicator === 'publisherUnknownIndicator' ? 'Publisher' : 'Writer'} Unknown Indicator is Y but ${nameField === 'publisherName' ? 'Publisher Name' : 'Writer Last Name'} is entered; it must be blank. Edit {edit} ends in (FR): the indicator is defaulted to N.`,
    source: { slug: S21, quote },
    alsoSource: [{ slug: S22, quote }],
    run(ctx) {
      const layout = ctx.layout;
      if (!layout || ctx.inExc) return;
      const f = findField(layout, indicator);
      if (!f || f.end > ctx.text.length) return;
      const v = ctx.text.slice(f.start, f.end);
      if (kind === 'flag') {
        if (v === ' ' || v === 'Y' || v === 'N') return;
        ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, edit: id, params: { value: v.trim(), edit: id } });
        return;
      }
      if (v !== 'Y') return;
      const n = findField(layout, nameField);
      if (!n || n.end > ctx.text.length || isBlankAt(ctx.text, n.start, n.end)) return;
      ctx.report({ line: ctx.line, start: n.start, end: n.end, fieldId: n.id, edit: id, params: { edit: id }, related: [{ line: ctx.line, start: f.start, end: f.end, role: 'the indicator' }] });
    },
  });
}

const spuF008 = unknownRule(
  'SPU-F-008',
  'OPU',
  'publisherUnknownIndicator',
  'publisherName',
  'flag',
  '',
  'OPU unknown-publisher flag is Y or N',
);
const spuF009 = unknownRule(
  'SPU-F-009',
  'OPU',
  'publisherUnknownIndicator',
  'publisherName',
  'name',
  '',
  'OPU with Publisher Unknown Indicator Y has no name',
);
const swrF005 = unknownRule(
  'SWR-F-005',
  'OWR',
  'writerUnknownIndicator',
  'writerLastName',
  'flag',
  '',
  'OWR unknown-writer flag is Y or N',
);
const swrF006 = unknownRule(
  'SWR-F-006',
  'OWR',
  'writerUnknownIndicator',
  'writerLastName',
  'name',
  '',
  'OWR with Writer Unknown Indicator Y has no last name',
);

// ------------------------------------------------------------------ territory records and what they follow

const sptF001 = defineRule({
  id: 'SPT-F-001',
  title: 'SPT follows an SPU, NPN or SPT',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPT F 001',
  message: 'This SPT record is in the wrong place. {why}',
  ...cite(''),
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    const allowed = ctx.version === '2.2' ? ['SPU', 'NPN', 'SPT', 'OPT'] : ['SPU', 'NPN', 'SPT'];
    for (const t of w.terrs) {
      if (t.type !== 'SPT') continue;
      if (!allowed.includes(t.prevType)) {
        ctx.report(onType(t, { params: { why: `This SPT record sits after ${t.prevType}, which cannot precede an SPT. The record before it has to be an SPU, NPN or SPT${ctx.version === '2.2' ? ' (an OPT of the same SPU also counts)' : ''}.` } }));
      } else if (t.owner >= 0 && w.pubs[t.owner]!.type === 'OPU') {
        ctx.report(onType(t, { params: { why: 'An SPT record sits under an OPU; non-controlled publishers do not carry territory records.' } }));
      }
    }
  },
});

const sptF014 = defineRule({
  id: 'SPT-F-014',
  title: 'OPT only after publisher-chain records',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPT F 014',
  message: 'This OPT record sits after {found}, which cannot precede an OPT. The record before it has to be an SPU, NPN, SPT, OPU or OPT.',
  source: { slug: S22, quote: '' },
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'OPT') continue;
      if (!['SPU', 'NPN', 'SPT', 'OPU', 'OPT'].includes(t.prevType)) ctx.report(onType(t, { params: { found: t.prevType } }));
    }
  },
});

const sptF002 = defineRule({
  id: 'SPT-F-002',
  title: 'SPT Interested Party # is the SPU’s',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPT F 002',
  message: 'Interested Party # is "{found}"; the SPU before it has "{expected}".',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'SPT' || t.owner < 0) continue;
      const owner = w.pubs[t.owner]!;
      if (owner.type !== 'SPU' || t.ip === '' || owner.ip === '' || t.ip === owner.ip) continue; // blank: FMT-M, or the SPU's own finding
      ctx.report(onField(ctx, t, 'interestedPartyNumber', { params: { found: t.ip, expected: owner.ip }, related: fieldRel(ctx, owner, 'interestedPartyNumber', 'the SPU') }));
    }
  },
});

/** Sequence # of territory records under one party: 1 for the first, then the one before plus 1. */
function sequenceRule(id: string, pubSide: boolean, quote: string, quote22: string, cisac: string): RuleDef {
  const what = pubSide ? 'SPT' : 'SWT';
  return defineRule({
    id,
    title: `${what} Sequence # counts from 1 under each ${pubSide ? 'SPU' : 'SWR'}`,
    severity: 'error',
    scope: 'transaction',
    versions: BOTH,
    records: WORK,
    specAction: 'RR',
    cisac,
    message: 'Sequence # is {found}; it should be {expected} ({why}).',
    ...cite(quote, quote22),
    run(ctx) {
      const w = workOf(ctx);
      let owner = -2;
      let prev: number | null = 0;
      for (const t of w.terrs) {
        if (t.ownerIsPub !== pubSide || t.owner < 0) continue;
        if (t.owner !== owner) {
          owner = t.owner;
          prev = 0;
        }
        if (t.seq === null) {
          prev = null; // blank or not digits: FMT-M / FMT-N
          continue;
        }
        if (prev !== null && t.seq !== prev + 1) {
          ctx.report(onField(ctx, t, 'sequenceNumber', { params: { found: t.seq, expected: prev + 1, why: prev === 0 ? 'the first is 1' : `the one before it has ${prev}` } }));
        }
        prev = t.seq;
      }
    },
  });
}

const sptF013 = sequenceRule(
  'SPT-F-013',
  true,
  '',
  '',
  'SPT F 013',
);
const swtF010 = sequenceRule(
  'SWT-F-010',
  false,
  '',
  '',
  'SWT F 010',
);

const swtF001 = defineRule({
  id: 'SWT-F-001',
  title: 'SWT follows an SWR, NWN or SWT',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SWT F 001',
  message: 'This SWT record is in the wrong place. {why}',
  ...cite(''),
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'SWT') continue;
      if (!['SWR', 'NWN', 'SWT'].includes(t.prevType)) {
        ctx.report(onType(t, { params: { why: `This SWT record sits after ${t.prevType}, which cannot precede an SWT. The record before it has to be an SWR, NWN or SWT.` } }));
      } else if (t.owner >= 0 && w.writers[t.owner]!.type === 'OWR') {
        ctx.report(onType(t, { params: { why: 'An SWT record belongs to an OWR; non-controlled writers do not carry SWT records.' } }));
      }
    }
  },
});

const swtF011 = defineRule({
  id: 'SWT-F-011',
  title: 'OWT follows an OWR, NWN or OWT',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  cisac: 'SWT F 011',
  message: 'This OWT record is in the wrong place. {why}',
  source: { slug: S22, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'OWT') continue;
      if (!['OWR', 'NWN', 'OWT'].includes(t.prevType)) {
        ctx.report(onType(t, { params: { why: `This OWT record sits after ${t.prevType}, which cannot precede an OWT. The record before it has to be an OWR, NWN or OWT.` } }));
      } else if (t.owner >= 0 && w.writers[t.owner]!.type === 'SWR') {
        ctx.report(onType(t, { params: { why: 'This OWT record sits under an SWR; only non-controlled writers (OWR) carry OWT records.' } }));
      }
    }
  },
});

const swtF002 = defineRule({
  id: 'SWT-F-002',
  title: 'SWT Interested Party # is the SWR’s',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SWT F 002',
  message: 'Interested Party # is "{found}"; the SWR before it has "{expected}".',
  ...cite(
    '',
    '',
  ),
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'SWT' || t.owner < 0) continue;
      const owner = w.writers[t.owner]!;
      if (owner.type !== 'SWR' || owner.ip === '' || t.ip === owner.ip) continue; // no number on the SWR: SWR-F-001
      if (t.ip === '' && (ctx.version === '2.1' || !reaches(ctx.doc, t, 'interestedPartyNumber'))) continue; // mandatory in 2.1: FMT-M. In 2.2 the field is conditional and the edit says it must be entered.
      ctx.report(onField(ctx, t, 'interestedPartyNumber', { params: { found: t.ip, expected: owner.ip }, related: fieldRel(ctx, owner, 'interestedPartyNumber', 'the SWR') }));
    }
  },
});

const swtF013 = defineRule({
  id: 'SWT-F-013',
  title: 'OWT Interested Party # is the OWR’s',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  cisac: 'SWT F 013',
  message: 'Interested Party # is "{found}"; the OWR before it has "{expected}".',
  source: { slug: S22, quote: '' },
  run(ctx) {
    const w = workOf(ctx);
    for (const t of w.terrs) {
      if (t.type !== 'OWT' || t.owner < 0) continue;
      const owner = w.writers[t.owner]!;
      if (owner.type !== 'OWR' || t.ip === owner.ip) continue;
      ctx.report(onField(ctx, t, 'interestedPartyNumber', { params: { found: t.ip, expected: owner.ip }, related: fieldRel(ctx, owner, 'interestedPartyNumber', 'the OWR') }));
    }
  },
});

// ------------------------------------------------------------------ names in other scripts

const npnR001 = defineRule({
  id: 'NPN-R-001',
  title: 'NPN immediately follows its SPU',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'RR',
  cisac: 'NPN R 001',
  message: 'An NPN record must immediately follow the SPU (or OPU) that it names; this one follows {found}.',
  ...cite(''),
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const n of w.npns) if (n.prevType !== 'SPU' && n.prevType !== 'OPU') ctx.report(onType(n, { params: { found: n.prevType } }));
  },
});

const npnF001 = defineRule({
  id: 'NPN-F-001',
  title: 'NPN Publisher Sequence # is its SPU’s',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'RR',
  cisac: 'NPN F 001',
  message: 'Publisher Sequence # is {found}; the SPU it names has {expected}.',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const n of w.npns) {
      if (n.party < 0 || n.seq === null) continue; // no SPU in front: NPN-R-001. Blank: FMT-M
      const p = w.pubs[n.party]!;
      if (p.seq !== null && p.seq !== n.seq) ctx.report(onField(ctx, n, 'publisherSequenceNumber', { params: { found: n.seq, expected: p.seq }, related: fieldRel(ctx, p, 'publisherSequenceNumber', 'the SPU') }));
    }
  },
});

const npnF002 = defineRule({
  id: 'NPN-F-002',
  title: 'NPN Interested Party # is its SPU’s',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'RR',
  cisac: 'NPN F 002',
  message: 'Interested Party # is "{found}"; the SPU it names has "{expected}".',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const n of w.npns) {
      if (n.party < 0 || n.ip === '') continue;
      const p = w.pubs[n.party]!;
      if (p.ip !== '' && p.ip !== n.ip) ctx.report(onField(ctx, n, 'interestedPartyNumber', { params: { found: n.ip, expected: p.ip }, related: fieldRel(ctx, p, 'interestedPartyNumber', 'the SPU') }));
    }
  },
});

const nwnR001 = defineRule({
  id: 'NWN-R-001',
  title: 'NWN immediately follows its SWR',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'RR',
  cisac: 'NWN R 001',
  message: 'An NWN record must immediately follow the SWR (or OWR) that it names; this one follows {found}.',
  ...cite(''),
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const n of w.nwns) if (n.prevType !== 'SWR' && n.prevType !== 'OWR') ctx.report(onType(n, { params: { found: n.prevType } }));
  },
});

const nwnF001 = defineRule({
  id: 'NWN-F-001',
  title: 'NWN Interested Party # is its SWR’s',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'RR',
  cisac: 'NWN F 001',
  message: 'Interested Party # is "{found}"; the SWR it names has "{expected}".',
  ...cite(''),
  run(ctx) {
    const w = workOf(ctx);
    for (const n of w.nwns) {
      if (n.party < 0) continue;
      const wr = w.writers[n.party]!;
      if (wr.ip === n.ip || wr.ip === '') continue;
      ctx.report(onField(ctx, n, 'interestedPartyNumber', { params: { found: n.ip, expected: wr.ip }, related: fieldRel(ctx, wr, 'interestedPartyNumber', 'the SWR') }));
    }
  },
});

// ------------------------------------------------------------------ writers and PWR

const swrR002 = defineRule({
  id: 'SWR-R-002',
  title: 'A published writer has a PWR link',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SWR R 002',
  message:
    'This SWR has no PWR record, but the work is not unpublished: the writers’ ownership shares do not total 100% for each right the work claims (the writers hold {totals}). ' +
    'Only an unpublished work may have an SWR with no PWR.',
  ...cite(''),
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    // A work with no controlled publisher has nothing a PWR could point to: PWR-F-001 (2.1) wants an earlier SPU, and in 2.2 a PWR
    // names a publisher chain. Asking for one there would give the wrong fix; the missing share is NWR-T-011's finding.
    if (!w.pubs.some(p => p.type === 'SPU')) return;
    // A right counts as met when the writers hold 100% of it (plus or minus the spec's 0.06%), or when nobody claims it at all:
    // read literally the edit would ask for a PWR on a work with no publisher to point to. See docs/RULES.md.
    const parts: string[] = [];
    let short = false;
    for (const right of RIGHTS) {
      const wt = sumRight(w.writers, right);
      const pt = sumRight(w.pubs, right);
      if (wt === UNREADABLE || pt === UNREADABLE) return;
      parts.push(`${right.toUpperCase()} ${pct(wt)}`);
      if (Math.abs(wt - FULL) > TOLERANCE && wt + pt !== 0) short = true;
    }
    if (!short) return;
    for (const wr of w.writers) {
      if (wr.type === 'SWR' && wr.pwrs.length === 0) ctx.report(onType(wr, { params: { totals: parts.join(', ') } }));
    }
  },
});

function pwrWriter(w: Work, i: number): Work['writers'][number] | undefined {
  const idx = w.pwrs[i]!.writer;
  return idx >= 0 ? w.writers[idx] : undefined;
}

const pwrR001 = defineRule({
  id: 'PWR-R-001',
  title: 'No PWR after an OWR',
  severity: 'error',
  scope: 'transaction',
  versions: V21,
  records: WORK,
  specAction: 'RR',
  cisac: 'PWR R 001',
  message: 'A PWR record follows an OWR; CWR 2.1 does not allow that order (CWR 2.2 does).',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    for (let i = 0; i < w.pwrs.length; i++) if (pwrWriter(w, i)?.type === 'OWR') ctx.report(onType(w.pwrs[i]!));
  },
});

const pwrR002 = defineRule({
  id: 'PWR-R-002',
  title: 'PWR follows an SWR, SWT or PWR',
  severity: 'error',
  scope: 'transaction',
  versions: V21,
  records: WORK,
  specAction: 'RR',
  cisac: 'PWR R 002',
  message: 'This PWR record sits after {found}, which cannot precede a PWR. The record directly before it has to be an SWR, SWT or another PWR.',
  source: { slug: S21, quote: '' },
  run(ctx) {
    const w = workOf(ctx);
    // An NWN between the SWR and the PWR is allowed by the order the edit points to (SWR, NWN, SWT, PWR). A PWR after an OWR is PWR-R-001's.
    for (const p of w.pwrs) if (!['SWR', 'SWT', 'PWR', 'NWN', 'OWR'].includes(p.prevType)) ctx.report(onType(p, { params: { found: p.prevType } }));
  },
});

const pwrF001 = defineRule({
  id: 'PWR-F-001',
  title: 'PWR Publisher IP # is an earlier original publisher',
  severity: 'error',
  scope: 'transaction',
  versions: V21,
  records: WORK,
  specAction: 'TR',
  cisac: 'PWR F 001',
  message: 'The Publisher IP # does not point to an SPU the specification allows. {why}',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: ERR, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    for (const p of w.pwrs) {
      if (p.publisherIp === '' || !reaches(ctx.doc, p, 'publisherIpNumber')) continue; // mandatory in 2.1: FMT-M
      const before = w.pubs.filter(x => x.pos < p.pos);
      // An SPU whose type is blank or not in the Publisher Type table is its own finding (SPU-F-005, LKP-TBL): it may be the one meant.
      if (before.some(x => x.type === 'SPU' && x.ip === p.publisherIp && (x.pubType === 'E' || x.pubType === 'PA' || !LOOKUPS.publisherType.has(x.pubType)))) continue;
      const asOpu = before.some(x => x.type === 'OPU' && x.ip === p.publisherIp);
      const asOther = before.some(x => x.type === 'SPU' && x.ip === p.publisherIp);
      // An SPU with no Interested Party # (SPU-F-002) could be the one this PWR means; that excuses the PWR only when its number matches nothing else.
      if (!asOpu && !asOther && before.some(x => x.type === 'SPU' && x.ip === '')) continue;
      const why = asOpu
        ? `Publisher IP # "${p.publisherIp}" is a non-controlled publisher (OPU); a PWR must point to the SPU that opens a controlled chain.`
        : asOther
          ? `Publisher IP # "${p.publisherIp}" matches an SPU whose Publisher Type is not E or PA; a PWR must point to the SPU that opens a controlled chain.`
          : `Publisher IP # "${p.publisherIp}" appears on no SPU before this PWR.`;
      ctx.report(onField(ctx, p, 'publisherIpNumber', { params: { why } }));
    }
  },
});

const pwrF005 = defineRule({
  id: 'PWR-F-005',
  title: 'PWR Writer IP # is the preceding SWR’s',
  severity: 'error',
  scope: 'transaction',
  versions: V21,
  records: WORK,
  specAction: 'RR',
  cisac: 'PWR F 005',
  message: 'Writer IP # is "{found}"; the SWR before this PWR has "{expected}".',
  source: { slug: S21, quote: '' },
  run(ctx) {
    const w = workOf(ctx);
    for (let i = 0; i < w.pwrs.length; i++) {
      const p = w.pwrs[i]!;
      const wr = pwrWriter(w, i);
      if (!wr || wr.type !== 'SWR' || wr.ip === '' || p.writerIp === '' || p.writerIp === wr.ip) continue; // blank: FMT-M. OWR: PWR-R-001. No number on the SWR: SWR-F-001
      ctx.report(onField(ctx, p, 'writerIpNumber', { params: { found: p.writerIp, expected: wr.ip }, related: fieldRel(ctx, wr, 'interestedPartyNumber', 'the SWR') }));
    }
  },
});

/** The first publisher of each chain: the original publisher or income participant that a Publisher Sequence # points to. */
function starters(w: Work): { by: Map<number, Work['pubs'][number]>; unknown: boolean } {
  const by = new Map<number, Work['pubs'][number]>();
  let unknown = false;
  for (const c of w.chains) {
    const p = w.pubs[c.pubs[0]!]!;
    if (p.seq === null) unknown = true; // a chain whose number cannot be read could be the one a PWR points to
    else if (!by.has(p.seq)) by.set(p.seq, p);
  }
  return { by, unknown };
}

const pwrF007 = defineRule({
  id: 'PWR-F-007',
  title: 'PWR Publisher Sequence # names a publisher chain',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  cisac: 'PWR F 006',
  message: 'Publisher Sequence # is {found}; no original publisher record in this work has that sequence number.',
  source: { slug: S22, quote: '' },
  alsoSource: [{ slug: ERR, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    const { by, unknown } = starters(w);
    if (unknown) return;
    for (const p of w.pwrs) {
      if (p.seqText === '' || !reaches(ctx.doc, p, 'publisherSequenceNumber')) continue; // mandatory: FMT-M
      if (p.seq === null || by.has(p.seq)) continue; // not digits: FMT-N
      ctx.report(onField(ctx, p, 'publisherSequenceNumber', { params: { found: p.seq } }));
    }
  },
});

function pwrControlled(id: string, what: string, field: 'writerIpNumber' | 'publisherIpNumber' | 'publisherName', prop: 'writerIp' | 'publisherIp' | 'publisherName', quote: string): RuleDef {
  return defineRule({
    id,
    title: `A PWR after an SWR has a ${what}`,
    severity: 'error',
    scope: 'transaction',
    versions: V22,
    records: WORK,
    specAction: 'TR',
    cisac: id.replace(/-/g, ' '),
    message: `${what[0]!.toUpperCase()}${what.slice(1)} must be entered on a PWR that follows an SWR (a controlled chain).`,
    source: { slug: S22, quote },
    run(ctx) {
      const w = workOf(ctx);
      for (let i = 0; i < w.pwrs.length; i++) {
        const p = w.pwrs[i]!;
        if (pwrWriter(w, i)?.type === 'SWR' && p[prop] === '' && reaches(ctx.doc, p, field)) ctx.report(onField(ctx, p, field));
      }
    },
  });
}

const pwrF008 = pwrControlled('PWR-F-008', 'Writer IP #', 'writerIpNumber', 'writerIp', '');
const pwrF009 = pwrControlled('PWR-F-009', 'Publisher IP #', 'publisherIpNumber', 'publisherIp', '');
const pwrF010 = pwrControlled('PWR-F-010', 'Publisher Name', 'publisherName', 'publisherName', '');

const pwrF011 = defineRule({
  id: 'PWR-F-011',
  title: 'PWR Writer IP # is the preceding writer’s',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  cisac: 'PWR F 011',
  message: 'Writer IP # is "{found}"; the writer record before this PWR has "{expected}".',
  source: { slug: S22, quote: '' },
  run(ctx) {
    const w = workOf(ctx);
    for (let i = 0; i < w.pwrs.length; i++) {
      const p = w.pwrs[i]!;
      const wr = pwrWriter(w, i);
      if (!wr || wr.ip === '' || p.writerIp === wr.ip || !reaches(ctx.doc, p, 'writerIpNumber')) continue; // no number on the writer: its own finding
      if (p.writerIp === '' && wr.type === 'SWR') continue; // PWR-F-008
      ctx.report(onField(ctx, p, 'writerIpNumber', { params: { found: p.writerIp, expected: wr.ip }, related: fieldRel(ctx, wr, 'interestedPartyNumber', wr.type === 'SWR' ? 'the SWR' : 'the OWR') }));
    }
  },
});

const pwrF012 = defineRule({
  id: 'PWR-F-012',
  title: 'PWR Publisher IP # is the named chain’s publisher',
  severity: 'error',
  scope: 'transaction',
  versions: V22,
  records: WORK,
  specAction: 'TR',
  cisac: 'PWR F 012',
  message: 'Publisher IP # is "{found}"; the original publisher with Publisher Sequence # {seq} has "{expected}".',
  source: { slug: S22, quote: '' },
  run(ctx) {
    const w = workOf(ctx);
    const { by, unknown } = starters(w);
    if (unknown) return;
    for (let i = 0; i < w.pwrs.length; i++) {
      const p = w.pwrs[i]!;
      if (p.seq === null || !reaches(ctx.doc, p, 'publisherIpNumber')) continue;
      const pub = by.get(p.seq);
      if (!pub || pub.ip === '' || pub.ip === p.publisherIp) continue;
      const wr = pwrWriter(w, i);
      if (p.publisherIp === '' && (wr === undefined || wr.type === 'OWR')) continue; // "..."
      if (p.publisherIp === '') continue; // after an SWR: PWR-F-009
      ctx.report(onField(ctx, p, 'publisherIpNumber', { params: { found: p.publisherIp, seq: p.seq, expected: pub.ip }, related: fieldRel(ctx, pub, 'interestedPartyNumber', 'the original publisher') }));
    }
  },
});

export const LINK_RULES: readonly RuleDef[] = [
  spuF001, spuR002, spuR005, spuD001, spuR006, spuR007, nwrT016, nwrT017, spuF032, spuF040,
  spuF008, spuF009, swrF005, swrF006,
  sptF001, sptF014, sptF002, sptF013, swtF001, swtF011, swtF002, swtF013, swtF010,
  npnR001, npnF001, npnF002, nwnR001, nwnF001,
  swrR002, pwrR001, pwrR002, pwrF001, pwrF005, pwrF007, pwrF008, pwrF009, pwrF010, pwrF011, pwrF012,
];

