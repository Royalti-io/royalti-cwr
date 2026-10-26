import { fieldName, S21, S22, ERR, txnAnchor, valueOf } from '../locate';
import { defineRule } from '../registry';
import type { RuleCtx, RuleDef, ReportInput } from '../types';
import { LOOKUPS } from '../../spec/lookups/index';
import type { Located, Pub, Right, Writer } from '../work';
import { FULL, fieldOfType, pct, readShare, RIGHT_NAME, RIGHTS, sumRight, TOLERANCE, UNREADABLE, workOf } from '../work';
import { lineText } from '../../model/fields';

/**
 * Shares. Integers in hundredths of a percent throughout (`05000` is 5000, which is 50.00%); nothing here uses a float.
 *
 * Rounding policy: the spec states one tolerance, 0.06%,
 * on eight edits (4, 9, 11, 14, 27, the AGR share total and the SGAE-only 36 and 37, plus the upper side only on the 2.2 edit 44). Those edits
 * use it, to the letter, and no other rule has any. A share field holds whole hundredths by construction, so there is no
 * finer grid to round to; a decimal point written into the field is a finding of its own (the spec says it is implied
 * and must not be present).
 *
 * Totals skip a right when any share in the sum cannot be read (not five digits or five spaces): that field already has
 * its own finding, and a total built on it would be noise.
 *
 * All transaction rules here run on NWR, REV and ISW transactions. The spec lets every edit but the first be bypassed in
 * an EXC transaction.
 */

const BOTH = ['2.1', '2.2'] as const;
const WORK = ['NWR', 'REV', 'ISW'] as const;

const OWN_ID: Readonly<Record<Right, string>> = { pr: 'prOwnershipShare', mr: 'mrOwnershipShare', sr: 'srOwnershipShare' };
const COL_ID: Readonly<Record<Right, string>> = { pr: 'prCollectionShare', mr: 'mrCollectionShare', sr: 'srCollectionShare' };

type Related = NonNullable<ReportInput['related']>[number];

/** A link to one share field of one record, for the "..." highlight. */
export function shareRef(ctx: RuleCtx, rec: Located, right: Right, ids: Readonly<Record<Right, string>>, role: string): Related | null {
  const f = fieldOfType(ctx.doc, rec.type, ids[right]);
  return f ? { line: rec.line, start: f.start, end: f.end, role } : null;
}

/** Links to the share of `right` on each party record. A share of 0% is left out unless `zeros` is set: for a total that is off, the 0% record is often the one at fault. */
function refs(ctx: RuleCtx, items: ReadonlyArray<Pub | Writer>, right: Right, zeros = false): Related[] {
  const out: Related[] = [];
  for (const it of items) {
    const v = it[right];
    if (v === UNREADABLE || (v === 0 && !zeros)) continue;
    const r = shareRef(ctx, it, right, OWN_ID, `${RIGHT_NAME[right]} ownership share ${pct(v)} on ${it.type}`);
    if (r) out.push(r);
  }
  return out;
}

/** Reports on the work title of the transaction. The anchor is looked up only here, on the failure path. */
export function atTitle(ctx: RuleCtx, params: Record<string, string | number>, related: Related[]): void {
  const a = txnAnchor(ctx);
  ctx.report({ line: a.line, start: a.start, end: a.end, params, related });
}

const nwrT004 = defineRule({
  id: 'NWR-T-004',
  title: 'Publisher ownership totals stay within the limits',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 004',
  message:
    '{right} ownership shares across the SPU and OPU records total {total}; the specification allows at most {limit} ' +
    '(with a margin of 0.06% either way).',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const right of RIGHTS) {
      const total = sumRight(w.pubs, right);
      if (total === UNREADABLE) continue;
      const limit = right === 'pr' ? 5000 : FULL;
      if (total <= limit + TOLERANCE) continue;
      atTitle(ctx, { right: RIGHT_NAME[right], total: pct(total), limit: pct(limit) }, refs(ctx, w.pubs, right));
    }
  },
});

const nwrT009 = defineRule({
  id: 'NWR-T-009',
  title: 'Writer ownership totals stay within the limits',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 009',
  message: '{right} ownership shares across the SWR and OWR records total {total}; {rule}',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const right of RIGHTS) {
      const total = sumRight(w.writers, right);
      if (total === UNREADABLE) continue;
      let rule: string | null = null;
      if (total > FULL + TOLERANCE) rule = 'the specification allows at most 100.00% (with a margin of 0.06% either way).';
      else if (right === 'pr' && total !== 0 && total < 5000 - TOLERANCE) {
        rule = 'for performing rights the specification wants either 0% or at least 50.00% (with a margin of 0.06% either way).';
      }
      if (rule === null) continue;
      atTitle(ctx, { right: RIGHT_NAME[right], total: pct(total), rule }, refs(ctx, w.writers, right));
    }
  },
});

const nwrT011 = defineRule({
  id: 'NWR-T-011',
  title: 'Each right totals 100% or 0%',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 011',
  message:
    '{right} ownership shares of all writers and publishers total {total} (writers {writers}, publishers {publishers}). ' +
    'Each right has to come to 100% (give or take 0.06%) or to nothing at all. ' +
    'Check for a missing writer or publisher record, or a share on the wrong record; every record that holds this right, a 0% one too, is marked.',
  source: {
    slug: S21,
    quote: '',
  },
  alsoSource: [
    {
      slug: S22,
      quote: '',
    },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const right of RIGHTS) {
      const writers = sumRight(w.writers, right);
      const pubs = sumRight(w.pubs, right);
      if (writers === UNREADABLE || pubs === UNREADABLE) continue;
      const total = writers + pubs;
      if (total === 0 || Math.abs(total - FULL) <= TOLERANCE) continue;
      atTitle(ctx, { right: RIGHT_NAME[right], total: pct(total), writers: pct(writers), publishers: pct(pubs) }, [...refs(ctx, w.writers, right, true), ...refs(ctx, w.pubs, right, true)]);
    }
  },
});

const nwrT025 = defineRule({
  id: 'NWR-T-025',
  title: 'A controlled publisher chain owns something',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 025',
  message:
    'The publisher chain that starts here has no ownership: the PR, MR and SR ownership shares of its E and AQ publishers are all zero. ' +
    'The specification wants at least one of them above zero.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const chain of w.chains) {
      // A chain that starts with an income participant (PA) has ownership zero by SPU edit 3, so the edit is read for chains of an
      // original publisher (E). Chains of OPU records are not controlled: "but not OPUs".
      const first = w.pubs[chain.pubs[0]!]!;
      if (chain.began !== 'SPU' || first.pubType !== 'E') continue;
      const owners = chain.pubs.map(i => w.pubs[i]!).filter(p => p.type === 'SPU' && (p.pubType === 'E' || p.pubType === 'AQ'));
      let readable = true;
      let any = false;
      for (const right of RIGHTS) {
        const t = sumRight(owners, right);
        if (t === UNREADABLE) readable = false;
        else if (t > 0) any = true;
      }
      if (any || !readable) continue;
      ctx.report({ line: first.line, start: 0, end: 3, params: {} });
    }
  },
});

const nwrT026 = defineRule({
  id: 'NWR-T-026',
  title: 'An acquirer takes over the original publisher’s ownership',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 026',
  message:
    'This chain has an AQ publisher, so the ownership shares on the original publisher before it must be zero; this one has {shares}.',
  source: {
    slug: S21,
    quote: '',
  },
  alsoSource: [
    {
      slug: S22,
      quote: '',
    },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const chain of w.chains) {
      const members = chain.pubs.map(i => w.pubs[i]!);
      const aq = members.find(p => p.type === 'SPU' && p.pubType === 'AQ');
      if (!aq) continue;
      const original = members.find(p => p.type === 'SPU' && p.pubType === 'E');
      if (!original) continue;
      const parts: string[] = [];
      for (const right of RIGHTS) if (original[right] > 0) parts.push(`${RIGHT_NAME[right]} ${pct(original[right])}`);
      if (parts.length === 0) continue;
      for (const right of RIGHTS) {
        if (original[right] <= 0) continue;
        const f = fieldOfType(ctx.doc, 'SPU', OWN_ID[right]);
        const t = fieldOfType(ctx.doc, 'SPU', 'publisherType');
        if (!f) continue;
        ctx.report({
          line: original.line,
          start: f.start,
          end: f.end,
          fieldId: OWN_ID[right],
          params: { shares: parts.join(', ') },
          related: t ? [{ line: aq.line, start: t.start, end: t.end, role: 'the AQ publisher' }] : [],
        });
      }
    }
  },
});

// ------------------------------------------------------------- one record's own shares

const DECIMAL_NOTE =
  ' The decimal point on a share field is implied and must not be written: 92.50% is 09250.';

interface RangeSpec {
  id: string;
  cisac: string;
  fieldId: string;
  records: readonly string[];
  max: number;
  title: string;
  right: string;
  quote: string;
  quote22?: string;
  also?: ReadonlyArray<{ slug: string; quote: string }>;
}

const IMPLIED_21 = '';

/** One share field against the range its edit gives, and against the "no decimal point" note. */
function rangeRule(s: RangeSpec): RuleDef {
  const maxText = pct(s.max);
  return defineRule({
    id: s.id,
    title: s.title,
    severity: 'error',
    scope: 'field',
    versions: BOTH,
    records: s.records,
    fields: { ids: [s.fieldId] },
    specAction: 'TR',
    cisac: s.cisac.replace(/-/g, ' '),
    message: `{field} "{value}" is over ${maxText}; the specification allows ${s.right} between 0% and ${maxText}.`,
    source: { slug: S21, quote: s.quote },
    alsoSource: [{ slug: S22, quote: s.quote22 ?? s.quote }, { slug: S21, quote: IMPLIED_21 }, ...(s.also ?? [])],
    run(ctx) {
      const f = ctx.field!;
      const t = ctx.text;
      // One pass over the five characters: the number, and whether a decimal point or comma is in the way.
      let v = 0;
      let digits = 0;
      let point = false;
      let other = false;
      for (let i = f.start; i < f.end; i++) {
        const c = t.charCodeAt(i);
        if (c >= 48 && c <= 57) {
          v = v * 10 + (c - 48);
          digits++;
        } else if (c === 46 || c === 44) point = true;
        else if (c !== 32) other = true;
      }
      if (point) {
        ctx.report({
          line: ctx.line,
          start: f.start,
          end: f.end,
          fieldId: f.id,
          params: { field: fieldName(ctx.version, ctx.layout, f.id), value: valueOf(ctx).trim() },
          message: '{field} "{value}" has a decimal point.' + DECIMAL_NOTE,
        });
        return;
      }
      if (other || digits !== f.end - f.start || v <= s.max) return; // blank: FMT-Z; other characters: FMT-N
      ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: fieldName(ctx.version, ctx.layout, f.id), value: valueOf(ctx).trim() } });
    },
  });
}

const spuF013 = rangeRule({
  id: 'SPU-F-013',
  cisac: 'SPU-F-013',
  fieldId: 'prOwnershipShare',
  records: ['SPU', 'OPU'],
  max: 5000,
  title: 'Publisher PR ownership share is between 0% and 50%',
  right: 'a PR ownership share',
  quote: '',
});
const spuF016 = rangeRule({
  id: 'SPU-F-016',
  cisac: 'SPU-F-016',
  fieldId: 'mrOwnershipShare',
  records: ['SPU', 'OPU'],
  max: FULL,
  title: 'Publisher MR ownership share is between 0% and 100%',
  right: 'an MR ownership share',
  quote: '',
});
const spuF018 = rangeRule({
  id: 'SPU-F-018',
  cisac: 'SPU-F-018',
  fieldId: 'srOwnershipShare',
  records: ['SPU', 'OPU'],
  max: FULL,
  title: 'Publisher SR ownership share is between 0% and 100%',
  right: 'an SR ownership share',
  quote: '',
});
const swrF011 = rangeRule({
  id: 'SWR-F-011',
  cisac: 'SWR-F-011',
  fieldId: 'prOwnershipShare',
  records: ['SWR', 'OWR'],
  max: FULL,
  title: 'Writer PR ownership share is between 0% and 100%',
  right: 'a PR ownership share',
  quote: '',
});
const swrF013 = rangeRule({
  id: 'SWR-F-013',
  cisac: 'SWR-F-013',
  fieldId: 'mrOwnershipShare',
  records: ['SWR', 'OWR'],
  max: FULL,
  title: 'Writer MR ownership share is between 0% and 100%',
  right: 'an MR ownership share',
  quote: '',
});
const swrF015 = rangeRule({
  id: 'SWR-F-015',
  cisac: 'SWR-F-015',
  fieldId: 'srOwnershipShare',
  records: ['SWR', 'OWR'],
  max: FULL,
  title: 'Writer SR ownership share is between 0% and 100%',
  right: 'an SR ownership share',
  quote: '',
});

const sptF006 = rangeRule({
  id: 'SPT-F-006',
  cisac: 'SPT-F-006',
  fieldId: 'prCollectionShare',
  records: ['SPT', 'OPT'],
  max: 5000,
  title: 'Publisher PR collection share is between 0% and 50%',
  right: 'a PR collection share',
  quote: '',
});
const sptF007 = rangeRule({
  id: 'SPT-F-007',
  cisac: 'SPT-F-007',
  fieldId: 'mrCollectionShare',
  records: ['SPT', 'OPT'],
  max: FULL,
  title: 'Publisher MR collection share is between 0% and 100%',
  right: 'an MR collection share',
  quote: '',
});
const sptF008 = rangeRule({
  id: 'SPT-F-008',
  cisac: 'SPT-F-008',
  fieldId: 'srCollectionShare',
  records: ['SPT', 'OPT'],
  max: FULL,
  title: 'Publisher SR collection share is between 0% and 100%',
  right: 'an SR collection share',
  quote: '',
});
const swtF003 = rangeRule({
  id: 'SWT-F-003',
  cisac: 'SWT-F-003',
  fieldId: 'prCollectionShare',
  records: ['SWT', 'OWT'],
  max: FULL,
  title: 'Writer PR collection share is between 0% and 100%',
  right: 'a PR collection share',
  quote: '',
});
const swtF004 = rangeRule({
  id: 'SWT-F-004',
  cisac: 'SWT-F-004',
  fieldId: 'mrCollectionShare',
  records: ['SWT', 'OWT'],
  max: FULL,
  title: 'Writer MR collection share is between 0% and 100%',
  right: 'an MR collection share',
  quote: '',
});
const swtF005 = rangeRule({
  id: 'SWT-F-005',
  cisac: 'SWT-F-005',
  fieldId: 'srCollectionShare',
  records: ['SWT', 'OWT'],
  max: FULL,
  title: 'Writer SR collection share is between 0% and 100%',
  right: 'an SR collection share',
  quote: '',
});
const ipaF006 = rangeRule({
  id: 'IPA-F-006',
  cisac: 'IPA-F-006',
  fieldId: 'prShare',
  records: ['IPA'],
  max: FULL,
  title: 'Agreement PR share is between 0% and 100%',
  right: 'a PR share',
  quote: '',
});
const ipaF008 = rangeRule({
  id: 'IPA-F-008',
  cisac: 'IPA-F-008',
  fieldId: 'mrShare',
  records: ['IPA'],
  max: FULL,
  title: 'Agreement MR share is between 0% and 100%',
  right: 'an MR share',
  quote: '',
});
const ipaF010 = rangeRule({
  id: 'IPA-F-010',
  cisac: 'IPA-F-010',
  fieldId: 'srShare',
  records: ['IPA'],
  max: FULL,
  title: 'Agreement SR share is between 0% and 100%',
  right: 'an SR share',
  quote: '',
});

const spuF019 = defineRule({
  id: 'SPU-F-019',
  title: 'Only original publishers and acquirers own shares',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU F 019',
  message: '{right} ownership share {value} on a publisher of type {type}; ownership shares must be zero unless the Publisher Type is E or AQ.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    for (const p of w.pubs) {
      if (p.pubType === 'E' || p.pubType === 'AQ') continue;
      // A blank type is SPU-F-005's and FMT-M's, a type outside the Publisher Type table is LKP-TBL's. An OPU whose type is invalid or
      // missing is read as E (SPU edit 28). So only the types the table lists as non-owners (SE, AM, PA, ES) count here.
      if (!LOOKUPS.publisherType.has(p.pubType)) continue;
      for (const right of RIGHTS) {
        if (p[right] <= 0) continue;
        const f = fieldOfType(ctx.doc, p.type, OWN_ID[right]);
        const t = fieldOfType(ctx.doc, p.type, 'publisherType');
        if (!f) continue;
        ctx.report({
          line: p.line,
          start: f.start,
          end: f.end,
          fieldId: OWN_ID[right],
          params: { right: RIGHT_NAME[right], value: pct(p[right]), type: p.pubType },
          related: t ? [{ line: p.line, start: t.start, end: t.end, role: 'Publisher Type' }] : [],
        });
      }
    }
  },
});

const spuR008 = defineRule({
  id: 'SPU-R-008',
  title: 'An acquirer has an ownership share',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SPU R 008',
  message: 'This publisher is an acquirer (AQ), so at least one of its PR, MR and SR ownership shares must be above zero; all three are zero.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    for (const p of w.pubs) {
      if (p.pubType !== 'AQ') continue;
      if (p.pr === UNREADABLE || p.mr === UNREADABLE || p.sr === UNREADABLE) continue;
      if (p.pr > 0 || p.mr > 0 || p.sr > 0) continue;
      const t = fieldOfType(ctx.doc, p.type, 'publisherType');
      ctx.report({ line: p.line, start: t ? t.start : 0, end: t ? t.end : 3, fieldId: 'publisherType', params: {} });
    }
  },
});

const IPA_ID: Readonly<Record<Right, string>> = { pr: 'prShare', mr: 'mrShare', sr: 'srShare' };

const agrT005 = defineRule({
  id: 'AGR-T-005',
  title: 'Agreement shares total 100% or 0% for each right',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: ['AGR'],
  specAction: 'TR',
  cisac: 'AGR T 005',
  message:
    '{right} shares of the {count} IPA records total {total}. ' +
    'The specification wants the shares to total 100% (with a tolerance of .06%) for each type of right the agreement covers, and 0% for a right it does not cover.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const { records } = ctx.doc;
    const ipa: Array<{ line: number; text: string }> = [];
    for (const ref of ctx.txn!.records) {
      const rec = records[ref]!;
      if (rec.type === 'IPA') ipa.push({ line: rec.line, text: lineText(ctx.doc, rec.line) });
    }
    if (ipa.length === 0) return; // AGR-T-003 reports a missing IPA
    for (const right of RIGHTS) {
      const f = fieldOfType(ctx.doc, 'IPA', IPA_ID[right]);
      if (!f) continue;
      let total = 0;
      let readable = true;
      const refs: Related[] = [];
      for (const r of ipa) {
        const v = readShare(r.text, f);
        if (v === UNREADABLE) {
          readable = false;
          break;
        }
        total += v;
        if (v > 0) refs.push({ line: r.line, start: f.start, end: f.end, role: `${RIGHT_NAME[right]} share ${pct(v)} on IPA` });
      }
      if (!readable || total === 0 || Math.abs(total - FULL) <= TOLERANCE) continue;
      const a = txnAnchor(ctx);
      ctx.report({ line: a.line, start: a.start, end: a.end, params: { right: RIGHT_NAME[right], count: ipa.length, total: pct(total) }, related: refs });
    }
  },
});

export const SHARE_RULES: readonly RuleDef[] = [
  nwrT004, nwrT009, nwrT011, nwrT025, nwrT026,
  spuF013, spuF016, spuF018, spuF019, spuR008,
  swrF011, swrF013, swrF015,
  sptF006, sptF007, sptF008, swtF003, swtF004, swtF005,
  ipaF006, ipaF008, ipaF010, agrT005,
];

export { COL_ID, OWN_ID };
