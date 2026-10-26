import { getField, lineText } from '../../model/fields';
import { LOOKUPS } from '../../spec/lookups/index';
import { ERR, S21, S22 } from '../locate';
import { defineRule } from '../registry';
import type { Citation, RuleCtx, RuleDef } from '../types';
import { isBlankAt, isZerosAt } from '../util';
import { fieldOfType, UNREADABLE, workOf } from '../work';
import type { Writer } from '../work';

/**
 * What a work must hold, from the writer designations and the work header: a writer who is a creator, an arranger when the work is a
 * modification, an INS record for a SER work. Plus two identifier-like checks that need no database: a publisher named like a society
 * must carry an IPI number, and a Submitter Work # can be used once per file.
 *
 * All of these run on NWR, REV and ISW transactions. Designation codes come from the Writer Designation table; this module only
 * groups them the way the edits do.
 */

const BOTH = ['2.1', '2.2'] as const;
const WORK = ['NWR', 'REV', 'ISW'] as const;

/** The Writer Designation codes that mark a modification (arranger, adapter, sub-arranger, sub-author, translator), by code. */
const MODIFIER = new Set(['AR', 'AD', 'SR', 'SA', 'TR']);
const CREATOR = new Set(['C', 'CA', 'A']);

function header(ctx: RuleCtx, id: string): string {
  return (getField(ctx.doc, ctx.txn!.header, id) ?? '').trim();
}

function hasShare(w: Writer): boolean {
  return w.pr > 0 || w.mr > 0 || w.sr > 0;
}

function anchor(ctx: RuleCtx, w: Writer): { line: number; start: number; end: number } {
  const f = fieldOfType(ctx.doc, w.type, 'writerDesignationCode');
  return { line: w.line, start: f ? f.start : 0, end: f ? f.end : 3 };
}

function titleAt(ctx: RuleCtx, params: Record<string, string | number> = {}): void {
  const nwr = ctx.txn!.header;
  const f = fieldOfType(ctx.doc, ctx.rec.type, 'workTitle');
  ctx.report({ line: ctx.doc.records[nwr]!.line, start: f ? f.start : 0, end: f ? f.end : 3, params });
}

function serRule(id: string, version: '2.1' | '2.2', source: Citation, needs: string, also: Citation[]): RuleDef {
  return defineRule({
    id,
    title: version === '2.1' ? 'A SER work has an INS record' : 'A SER work has an INS or IND record',
    severity: 'error',
    scope: 'transaction',
    versions: [version],
    records: WORK,
    specAction: 'TR',
    cisac: id === 'NWR-T-003' ? 'NWR T 003' : 'NWR T 053',
    message: `The work is in the SER distribution category, so the transaction must include ${needs}; it has none.`,
    source,
    alsoSource: also,
    run(ctx) {
      if (header(ctx, 'musicalWorkDistributionCategory') !== 'SER') return;
      const w = workOf(ctx);
      const ok = version === '2.1' ? w.types.includes('INS') : w.types.includes('INS') || w.types.includes('IND');
      if (!ok) titleAt(ctx);
    },
  });
}

const nwrT003 = serRule(
  'NWR-T-003',
  '2.1',
  { slug: S21, quote: '' },
  'an INS (Instrumentation Summary) record',
  [{ slug: ERR, quote: '' }],
);
const nwrT053 = serRule(
  'NWR-T-053',
  '2.2',
  { slug: S22, quote: '' },
  'an INS record or an IND record',
  [],
);

const nwrT010 = defineRule({
  id: 'NWR-T-010',
  title: 'A modification has an arranger, adapter, sub-arranger, sub-author or translator',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 010',
  message: 'None of the writers carries one of the modification codes (AR, AD, SR, SA, TR), and a MOD version needs at least one.',
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
  ],
  run(ctx) {
    if (header(ctx, 'versionType') !== 'MOD') return;
    const w = workOf(ctx);
    if (w.writers.length === 0 || w.writers.some(x => MODIFIER.has(x.designation))) return; // no writer at all: NWR-T-012
    titleAt(ctx);
  },
});

const nwrT015 = defineRule({
  id: 'NWR-T-015',
  title: 'A work has a creator writer',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 015',
  message: 'No writer has the Writer Designation Code C, CA or A; the work needs at least one.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const w = workOf(ctx);
    if (w.writers.length === 0 || w.writers.some(x => CREATOR.has(x.designation))) return; // no writer at all: NWR-T-012
    titleAt(ctx);
  },
});

const nwrT023 = defineRule({
  id: 'NWR-T-023',
  title: 'An original work has no arranger, adapter, sub-arranger, sub-author or translator',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 023',
  message: 'This writer has Writer Designation Code {code}; on an ORI version none of AR, AD, SR, SA or TR is allowed.',
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
  ],
  run(ctx) {
    if (header(ctx, 'versionType') !== 'ORI') return;
    for (const x of workOf(ctx).writers) {
      if (!MODIFIER.has(x.designation)) continue;
      const a = anchor(ctx, x);
      ctx.report({ line: a.line, start: a.start, end: a.end, fieldId: 'writerDesignationCode', params: { code: x.designation } });
    }
  },
});

const nwrT045 = defineRule({
  id: 'NWR-T-045',
  title: 'A music-only work has no text writers',
  severity: 'error',
  scope: 'transaction',
  versions: ['2.2'],
  records: WORK,
  specAction: 'TR',
  cisac: 'NWR T 045',
  message:
    'The Text Music Relationship is MUS (music only), but this writer has the Writer Designation Code {code}. The specification says there should be no CA, A, SA or TR among the creators of such a work (only C or AR).',
  source: {
    slug: S22,
    quote:
      '',
  },
  run(ctx) {
    if (header(ctx, 'textMusicRelationship') !== 'MUS') return;
    for (const x of workOf(ctx).writers) {
      if (!['CA', 'A', 'SA', 'TR'].includes(x.designation)) continue;
      const a = anchor(ctx, x);
      ctx.report({ line: a.line, start: a.start, end: a.end, fieldId: 'writerDesignationCode', params: { code: x.designation } });
    }
  },
});

const swrF020 = defineRule({
  id: 'SWR-F-020',
  title: 'In a modification a creator with no share is matched by an arranger who has one',
  severity: 'error',
  scope: 'transaction',
  versions: BOTH,
  records: WORK,
  specAction: 'TR',
  cisac: 'SWR F 020',
  message:
    'The Version Type is MOD and this writer ({code}) has no ownership share. The specification wants another SWR with a share above zero and the Writer Designation Code AR, TR, SA, SR or AD; there is none.',
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
  ],
  run(ctx) {
    if (header(ctx, 'versionType') !== 'MOD') return;
    const w = workOf(ctx);
    for (const x of w.writers) {
      if (x.type !== 'SWR' || !CREATOR.has(x.designation)) continue;
      if (x.pr === UNREADABLE || x.mr === UNREADABLE || x.sr === UNREADABLE || hasShare(x)) continue;
      if (w.writers.some(y => y !== x && y.type === 'SWR' && MODIFIER.has(y.designation) && hasShare(y))) continue;
      const a = anchor(ctx, x);
      ctx.report({ line: a.line, start: a.start, end: a.end, fieldId: 'writerDesignationCode', params: { code: x.designation } });
    }
  },
});

// ------------------------------------------------------------------ a publisher named like a society

let societyNames: Set<string> | undefined;
function societyNameSet(): Set<string> {
  if (!societyNames) {
    societyNames = new Set();
    // DP is the table's entry for public domain, not a society that registers works.
    for (const row of LOOKUPS.societyCode.rows) if (row.code !== '000' && row.description.length > 0) societyNames.add(row.description.toUpperCase());
  }
  return societyNames;
}

const spuF029 = defineRule({
  id: 'SPU-F-029',
  title: 'A publisher named like a society has an IPI Name #',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SPU', 'OPU'],
  specAction: 'TR',
  cisac: 'SPU F 029',
  message:
    'The Publisher Name "{name}" is also a society on the Society Code list, yet no Publisher IPI Name # is given. The specification rejects that (TR); ' +
    'it rejects a number the IPI database does not hold as well, which is not checked here.',
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
  ],
  run(ctx) {
    if (ctx.inExc) return;
    const name = fieldOfType(ctx.doc, ctx.rec.type, 'publisherName');
    const ipi = fieldOfType(ctx.doc, ctx.rec.type, 'publisherIpiNameNumber');
    const t = ctx.text;
    if (!name || !ipi || ipi.end > t.length) return;
    if (!isBlankAt(t, ipi.start, ipi.end) && !isZerosAt(t, ipi.start, ipi.end)) return; // an IPI Name # is entered
    const value = t.slice(name.start, name.end).trim().toUpperCase();
    if (!societyNameSet().has(value)) return;
    ctx.report({ line: ctx.line, start: ipi.start, end: ipi.end, fieldId: 'publisherIpiNameNumber', params: { name: value }, related: [{ line: ctx.line, start: name.start, end: name.end, role: 'the name' }] });
  },
});

// ------------------------------------------------------------------ Submitter Work # once per file

const nwrF003 = defineRule({
  id: 'NWR-F-003',
  title: 'A Submitter Work # is used once in the file',
  severity: 'error',
  scope: 'file',
  versions: BOTH,
  specAction: 'TR',
  cisac: 'NWR F 003',
  message: 'Submitter Work # "{value}" is also used at line {first}; one submitter may not reuse a work number.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const { doc } = ctx;
    const seen = new Map<string, { line: number; start: number; end: number }>();
    for (const group of doc.file.groups) {
      for (const txn of group.transactions) {
        const rec = doc.records[txn.header]!;
        if (rec.type !== 'NWR' && rec.type !== 'REV') continue;
        const f = fieldOfType(doc, rec.type, 'submitterWorkNumber');
        const t = lineText(doc, rec.line);
        if (!f || f.end > t.length || isBlankAt(t, f.start, f.end)) continue; // blank: FMT-M
        const value = t.slice(f.start, f.end).trim();
        const first = seen.get(value);
        if (first) {
          ctx.report({ line: rec.line, start: f.start, end: f.end, fieldId: f.id, params: { value, first: first.line + 1 }, related: [{ ...first, role: 'the first use' }] });
        } else seen.set(value, { line: rec.line, start: f.start, end: f.end });
      }
    }
  },
});

export const WRITER_RULES: readonly RuleDef[] = [nwrT003, nwrT053, nwrT010, nwrT015, nwrT023, nwrT045, swrF020, spuF029, nwrF003];
