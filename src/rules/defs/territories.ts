import { findField } from '../../model/fields';
import { LOOKUPS } from '../../spec/lookups/index';
import { L30, S21, S22, ERR, valueOf } from '../locate';
import { defineRule } from '../registry';
import type { RuleCtx, RuleDef, ReportInput } from '../types';
import type { Right, Terr } from '../work';
import { FULL, isSavedGroup, pct, readShare, RIGHT_NAME, RIGHTS, sumRight, territoryTotals, TOLERANCE, UNREADABLE, workOf, workTerritories, WORLD } from '../work';
import { atTitle, COL_ID, OWN_ID, shareRef } from './shares';

/**
 * Territories: the SPT, SWT, OPT and OWT records, and the per-territory share sums.
 *
 * Per-territory sums (NWR-T-014 / NWR-T-044, NWR-T-027) work on territory points, not countries: World (2136) is one point
 * that covers everything, a country named by a record is another, and an I or E record decides a territory by the rule
 * set out in `territoryTotals` (work.ts). A group of territories other than World cannot be expanded: its members are in
 * no saved source. A work that uses one gets TIS-GRP notes (info) and no per-territory sums; the engine never guesses
 * membership and never passes such a work silently.
 */

const BOTH = ['2.1', '2.2'] as const;
const WORK = ['NWR', 'REV', 'ISW'] as const;

type Related = NonNullable<ReportInput['related']>[number];

function shareRefs(ctx: RuleCtx, recs: readonly Terr[], right: Right): Related[] {
  const out: Related[] = [];
  for (const r of recs) {
    const v = r[right];
    if (v === UNREADABLE || v === 0) continue;
    const ref = shareRef(ctx, r, right, COL_ID, `${RIGHT_NAME[right]} collection share ${pct(v)} on ${r.type} for TIS ${r.tis}`);
    if (ref) out.push(ref);
  }
  return out;
}

/** The ISO alpha-2 code the saved CWR 3.0 TIS table gives a country (`GB` for 0826); the table has no country names. */
function tisAlpha(code: string): string | null {
  const row = LOOKUPS.tis.rows.find(r => r.code === code);
  const m = row?.detail ? /TIS-A ([A-Z]{2});/.exec(row.detail) : null;
  return m ? m[1]! : null;
}

function pointName(code: string): string {
  if (code === '*') return 'World (2136) and every territory no record names';
  const alpha = tisAlpha(code);
  return alpha ? `TIS ${code} (${alpha})` : `TIS ${code}`;
}

function collectionRule(id: string, version: '2.1' | '2.2', cisac: string, source: { slug: string; quote: string }, also: ReadonlyArray<{ slug: string; quote: string }>, what: string): RuleDef {
  return defineRule({
    id,
    title: 'Collection shares per territory do not exceed 100%',
    severity: 'error',
    scope: 'transaction',
    versions: [version],
    records: WORK,
    specAction: 'TR',
    cisac,
    message: `{right} collection shares ${what} total {total} in {territory}; the specification allows at most 100%.`,
    source,
    alsoSource: also,
    run(ctx) {
      const w = workOf(ctx);
      const { points } = workTerritories(w);
      for (const right of RIGHTS) {
        let worst: (typeof points)[number] | undefined;
        for (const p of points) {
          const t = p.total[right];
          if (t === UNREADABLE || t <= FULL + TOLERANCE) continue;
          if (!worst || t > worst.total[right]) worst = p;
        }
        if (!worst) continue;
        atTitle(ctx, { right: RIGHT_NAME[right], total: pct(worst.total[right]), territory: pointName(worst.code) }, shareRefs(ctx, worst.by[right], right));
      }
    },
  });
}

const nwrT014 = collectionRule(
  'NWR-T-014',
  '2.1',
  'NWR T 014',
  { slug: S21, quote: '' },
  [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
    { slug: ERR, quote: '' },
  ],
  'of the SPT and SWT records',
);

const nwrT044 = collectionRule(
  'NWR-T-044',
  '2.2',
  'NWR T 044',
  {
    slug: S22,
    quote: '',
  },
  [{ slug: S22, quote: '' }],
  'of the SPT, SWT, OPT and OWT records',
);

const nwrT027 = defineRule({
  id: 'NWR-T-027',
  title: 'PR collection in a territory equals the chain’s PR ownership',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 027',
  message:
    'PR collection shares of the SPT records in this chain total {total} in {territory}, but the PR ownership shares of the chain’s original publisher (and acquirer, if any) are {ownership}. ' +
    'The specification wants them equal (with a margin of 0.06% either way) unless Shares change is Y or the work has a PA party (an SPU, OPU, SWR or OWR with role PA).',
  source: {
    slug: S21,
    quote:
      '',
  },
  alsoSource: [
    {
      slug: S22,
      quote:
        '',
    },
    { slug: S21, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    // "...": a PA publisher (Publisher Type) or a PA writer
    // (Writer Designation Code) anywhere in the work lifts the edit.
    if (w.pubs.some(p => p.pubType === 'PA') || w.writers.some(x => x.designation === 'PA')) return;
    for (let ci = 0; ci < w.chains.length; ci++) {
      const chain = w.chains[ci]!;
      if (chain.began !== 'SPU') continue;
      const members = new Set(chain.pubs);
      // A publisher whose type is blank or not in the Publisher Type table cannot be told apart from an owner: that is its own finding.
      if (chain.pubs.some(i => !LOOKUPS.publisherType.has(w.pubs[i]!.pubType))) continue;
      const owners = chain.pubs.map(i => w.pubs[i]!).filter(p => p.type === 'SPU' && (p.pubType === 'E' || p.pubType === 'AQ'));
      const own = sumRight(owners, 'pr');
      if (own === UNREADABLE) continue;
      // Only the chain's own SPT records: OPT is non-controlled collection, "...".
      const recs = w.terrs.filter(t => t.type === 'SPT' && t.ownerIsPub && members.has(t.owner));
      if (recs.length === 0 || recs.some(t => t.sharesChange === 'Y')) continue;
      const { points, unexpanded } = territoryTotals(recs);
      if (unexpanded.length > 0) continue;
      for (const p of points) {
        const total = p.total.pr;
        if (total === UNREADABLE || Math.abs(total - own) <= TOLERANCE) continue;
        const first = w.pubs[chain.pubs[0]!]!;
        const related: Related[] = shareRefs(ctx, p.by.pr, 'pr');
        for (const o of owners) {
          const r = shareRef(ctx, o, 'pr', OWN_ID, `PR ownership share ${pct(o.pr)} on ${o.type} (${o.pubType})`);
          if (r) related.push(r);
        }
        ctx.report({ line: first.line, start: 0, end: 3, params: { total: pct(total), territory: pointName(p.code), ownership: pct(own) }, related });
        break; // one finding per chain
      }
    }
  },
});

// ------------------------------------------------------------- a controlled party with no territory record

const READING =
  ' The condition ("that has collection shares") is circular as written, since collection shares are what an SPT or SWT holds, ' +
  'so the engine reads it as a party that has an ownership share above zero. That reading is the engine’s, not the specification’s, and this is a warning.';

const nwrT007 = defineRule({
  id: 'NWR-T-007',
  title: 'A controlled publisher chain with ownership has an SPT',
  severity: 'warning',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  cisac: 'NWR T 007',
  message:
    'This publisher chain has ownership shares ({ownership}) on its original publisher or acquirer but no SPT record. ' +
    'Edit 7 (TR) is the check that a controlled publisher with collection shares has a territory record.' +
    READING,
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    const withSpt = new Set<number>();
    for (const t of w.terrs) if (t.type === 'SPT' && t.ownerIsPub && t.owner >= 0) withSpt.add(w.pubs[t.owner]!.chain);
    for (let ci = 0; ci < w.chains.length; ci++) {
      const chain = w.chains[ci]!;
      if (chain.began !== 'SPU' || withSpt.has(ci)) continue;
      const owners = chain.pubs.map(i => w.pubs[i]!).filter(p => p.type === 'SPU' && (p.pubType === 'E' || p.pubType === 'AQ'));
      const parts: string[] = [];
      for (const right of RIGHTS) {
        let t = 0;
        for (const o of owners) if (o[right] > 0) t += o[right];
        if (t > 0) parts.push(`${RIGHT_NAME[right]} ${pct(t)}`);
      }
      if (parts.length === 0) continue;
      const first = w.pubs[chain.pubs[0]!]!;
      ctx.report({ line: first.line, start: 0, end: 3, params: { ownership: parts.join(', ') } });
    }
  },
});

const nwrT020 = defineRule({
  id: 'NWR-T-020',
  title: 'A controlled writer with ownership has an SWT',
  severity: 'warning',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  cisac: 'NWR T 020',
  message:
    'This SWR has ownership shares ({ownership}) but no SWT record. ' +
    'Edit 20 (TR) is the check that a controlled writer with collection shares has a territory record.' +
    READING,
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    const w = workOf(ctx);
    const withSwt = new Set<number>();
    for (const t of w.terrs) if (t.type === 'SWT' && !t.ownerIsPub && t.owner >= 0) withSwt.add(t.owner);
    for (let i = 0; i < w.writers.length; i++) {
      const wr = w.writers[i]!;
      if (wr.type !== 'SWR' || withSwt.has(i)) continue;
      const parts: string[] = [];
      for (const right of RIGHTS) if (wr[right] > 0) parts.push(`${RIGHT_NAME[right]} ${pct(wr[right])}`);
      if (parts.length === 0) continue;
      ctx.report({ line: wr.line, start: 0, end: 3, params: { ownership: parts.join(', ') } });
    }
  },
});

// ------------------------------------------------------------- one territory record

/** The three collection shares of the current record, or null when any of them cannot be read. */
function shares(ctx: RuleCtx): [number, number, number] | null {
  const layout = ctx.layout;
  if (!layout) return null;
  const out: number[] = [];
  for (const right of RIGHTS) {
    const f = findField(layout, COL_ID[right]);
    const v = readShare(ctx.text, f);
    if (v === UNREADABLE) return null;
    out.push(v);
  }
  return [out[0]!, out[1]!, out[2]!];
}

function indicator(ctx: RuleCtx): string | null {
  const f = ctx.layout ? findField(ctx.layout, 'inclusionExclusionIndicator') : undefined;
  if (!f || f.end > ctx.text.length) return null;
  return ctx.text.slice(f.start, f.end);
}

function indicatorReport(ctx: RuleCtx, extra: Partial<ReportInput> = {}): void {
  const f = findField(ctx.layout!, 'inclusionExclusionIndicator')!;
  ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: {}, ...extra });
}

const sptR001 = defineRule({
  id: 'SPT-R-001',
  title: 'An included publisher territory has a share above zero',
  severity: 'warning',
  scope: 'record',
  versions: BOTH,
  records: ['SPT', 'OPT'],
  specAction: 'TR',
  cisac: 'SPT R 001',
  message:
    'Included territory with all collection shares at zero. The specification allows this on an SPT that only marks where a publisher sits among the agreements; otherwise give a share. ' +
    'Edit 1 (TR) asks for a PR, MR or SR share above zero, while the record description allows all-zero shares on an included territory. ' +
    'The two statements disagree, so this is a warning.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    if (indicator(ctx) !== 'I') return;
    const s = shares(ctx);
    if (s && s[0] === 0 && s[1] === 0 && s[2] === 0) indicatorReport(ctx);
  },
});

const swtR001 = defineRule({
  id: 'SWT-R-001',
  title: 'An included writer territory has a share above zero',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SWT', 'OWT'],
  specAction: 'TR',
  cisac: 'SWT R 001',
  message: 'The territory is included (I) but the PR, MR and SR collection shares are all zero; at least one must be above zero.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: ERR, quote: '' },
  ],
  run(ctx) {
    if (indicator(ctx) !== 'I') return;
    const s = shares(ctx);
    if (s && s[0] === 0 && s[1] === 0 && s[2] === 0) indicatorReport(ctx);
  },
});

const swtR003 = defineRule({
  id: 'SWT-R-003',
  title: 'An excluded writer territory has zero shares',
  severity: 'warning',
  scope: 'record',
  versions: BOTH,
  records: ['SWT', 'OWT'],
  specAction: 'FR',
  cisac: 'SWT R 003',
  message: 'The territory is excluded (E) but a collection share is above zero ({shares}); all collection shares must be zero.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (indicator(ctx) !== 'E') return;
    const s = shares(ctx);
    if (!s || (s[0] === 0 && s[1] === 0 && s[2] === 0)) return;
    indicatorReport(ctx, { params: { shares: RIGHTS.map((r, i) => `${RIGHT_NAME[r]} ${pct(s[i]!)}`).join(', ') } });
  },
});

const sptD001 = defineRule({
  id: 'SPT-D-001',
  title: 'An excluded publisher territory should have zero shares',
  severity: 'warning',
  scope: 'record',
  versions: BOTH,
  records: ['SPT', 'OPT'],
  message:
    'The territory is excluded (E) but a collection share is above zero ({shares}). The record description says an SPT that excludes a territory should not have shares above zero; this is from the description, not from a numbered edit.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (indicator(ctx) !== 'E') return;
    const s = shares(ctx);
    if (!s || (s[0] === 0 && s[1] === 0 && s[2] === 0)) return;
    indicatorReport(ctx, { params: { shares: RIGHTS.map((r, i) => `${RIGHT_NAME[r]} ${pct(s[i]!)}`).join(', ') } });
  },
});

const tisGrp = defineRule({
  id: 'TIS-GRP',
  title: 'A territory group other than World is not expanded',
  severity: 'info',
  scope: 'field',
  versions: BOTH,
  fields: { lookupIds: ['tis'] },
  message:
    'TIS {value} is a group of territories in the CWR 3.0 TIS table. This tool has no list of the members of any group except World ({world}), ' +
    'so it does not expand this one, and it does not check collection shares per territory for this work.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: L30, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    const code = valueOf(ctx).trim();
    if (code === '' || !isSavedGroup(code)) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { value: code, world: WORLD } });
  },
});

export const TERRITORY_RULES: readonly RuleDef[] = [nwrT014, nwrT044, nwrT027, nwrT007, nwrT020, sptR001, swtR001, swtR003, sptD001, tisGrp];
