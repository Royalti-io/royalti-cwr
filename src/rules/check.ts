import { lineText } from '../model/fields';
import { drain, throwIfCancelled } from '../model/progress';
import type { Progress } from '../model/progress';
import type { CwrDoc, FieldDef, Rec, RecordLayoutDef, Txn } from '../model/types';
import { BUILTIN_REGISTRY } from './builtin';
import type {
  CheckOptions,
  CheckResult,
  Problem,
  ReportInput,
  RuleCtx,
  RuleDef,
  Severity,
} from './types';
import { clampHeadline, headlineOf } from './headline';
import { fill, groupDigits } from './util';

const DEFAULT_MAX_PER_RULE = 1000;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface FieldPlanEntry {
  field: FieldDef;
  rules: RuleDef[];
}

/**
 * Runs every rule of the registry that applies to the document's version and returns what it found.
 *
 * `checked` counts rule executions that actually ran: one per file/group/transaction/record a rule was
 * run on, and one per field per field rule. A field rule does not run on a field that the record is too
 * short to contain; STR-LEN reports that.
 *
 * The summary never uses the word "valid". A clean result means these checks found nothing.
 */
export function check(doc: CwrDoc, options: CheckOptions = {}): CheckResult {
  return drain(checkSteps(doc, options));
}

/** Records between two progress reports (and two cancel checks). */
const STEP = 1024;
/** Transactions between two reports: the transaction rules cost more per item than the record rules. */
const TXN_STEP = 128;

/**
 * `check` as a generator: yields a `Progress` about every thousand records and returns the result. A host that has
 * to stay responsive calls `next()` and gives the event loop a turn between calls; stopping early is just not
 * calling `next()` again (or `return()`). `options.onProgress` and `options.signal` work here as in `check`.
 */
export function* checkSteps(doc: CwrDoc, options: CheckOptions = {}): Generator<Progress, CheckResult, void> {
  throwIfCancelled(options.signal);
  const step = (stage: string, done: number, total: number, from: number, to: number): Progress => {
    throwIfCancelled(options.signal);
    const p: Progress = { task: 'check', stage, done, total, fraction: total > 0 ? from + (to - from) * Math.min(1, done / total) : to };
    options.onProgress?.(p);
    throwIfCancelled(options.signal);
    return p;
  };
  const registry = options.registry ?? BUILTIN_REGISTRY;
  const version = doc.version.version;
  const max = options.maxPerRule ?? DEFAULT_MAX_PER_RULE;
  const disabled = new Set(options.disable ?? []);
  const rules = registry.forVersion(version).filter(r => !disabled.has(r.id));

  const fileRules = rules.filter(r => r.scope === 'file');
  const groupRules = rules.filter(r => r.scope === 'group');
  const txnRules = rules.filter(r => r.scope === 'transaction');
  const recordRules = rules.filter(r => r.scope === 'record');
  const fieldRules = rules.filter(r => r.scope === 'field');

  const problems: Problem[] = [];
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const perRule = new Map<string, number>();
  const suppressed: Record<string, number> = {};
  let checked = 0;

  const records = doc.records;
  const n = records.length;

  // Where each record sits: owning transaction header, previous header, continuation and EXC flags.
  const txnHeaderOf = new Int32Array(n).fill(-1);
  const prevHeaderOf = new Int32Array(n).fill(-1);
  const groupOf = new Int32Array(n).fill(-1);
  const continuationOf = new Uint8Array(n);
  const excOf = new Uint8Array(n);
  doc.file.groups.forEach((group, gi) => {
    groupOf[group.grh] = gi;
    if (group.grt !== undefined) groupOf[group.grt] = gi;
    let prev: Txn | undefined;
    for (const txn of group.transactions) {
      const h = txn.header;
      const type = records[h]!.type;
      txnHeaderOf[h] = h;
      groupOf[h] = gi;
      prevHeaderOf[h] = prev ? prev.header : -1;
      const exc = type === 'EXC' ? 1 : 0;
      excOf[h] = exc;
      if (exc && prev && records[prev.header]!.type === 'ACK' && prev.inner && prev.inner.length > 0) {
        const innerType = records[prev.inner[0]!.header]!.type;
        if (innerType === 'NWR' || innerType === 'REV') continuationOf[h] = 1;
      }
      for (const r of txn.records) {
        txnHeaderOf[r] = h;
        groupOf[r] = gi;
        excOf[r] = exc;
      }
      if (txn.inner) {
        for (const inner of txn.inner) {
          continuationOf[inner.header] = 1;
          prevHeaderOf[inner.header] = h;
          if (records[inner.header]!.type === 'EXC') excOf[inner.header] = 1;
        }
      }
      prev = txn;
    }
  });

  const ctx: Mutable<RuleCtx> = {
    doc,
    version,
    rule: rules[0] as RuleDef,
    group: undefined,
    groupIndex: -1,
    txn: undefined,
    ref: -1,
    rec: undefined as unknown as Rec,
    line: -1,
    text: '',
    layout: null,
    field: undefined,
    txnHeader: -1,
    prevHeader: -1,
    prev2Header: -1,
    continuation: false,
    inExc: false,
    continuationAt: (ref: number): boolean => continuationOf[ref] === 1,
    report(input: ReportInput): void {
      const rule = ctx.rule;
      const severity = input.severity ?? rule.severity;
      counts[severity]++;
      const seen = perRule.get(rule.id) ?? 0;
      perRule.set(rule.id, seen + 1);
      if (seen >= max) {
        suppressed[rule.id] = (suppressed[rule.id] ?? 0) + 1;
        return;
      }
      const params = input.params ?? {};
      const message = fill(input.message ?? rule.message, params);
      const headline =
        input.headline !== undefined
          ? clampHeadline(fill(input.headline, params))
          : input.message === undefined && rule.headline !== undefined
            ? clampHeadline(fill(rule.headline, params))
            : headlineOf(message);
      const problem: Problem = {
        ruleId: rule.id,
        severity,
        scope: rule.scope,
        message,
        headline,
        line: input.line,
        span: input.start === undefined ? null : { start: input.start, end: input.end ?? input.start },
        params,
      };
      if (input.ghost) problem.ghost = true;
      if (input.fieldId !== undefined) problem.fieldId = input.fieldId;
      if (input.edit !== undefined) problem.edit = input.edit;
      if (input.related) problem.related = input.related;
      if (rule.secondary) problem.secondary = true;
      if ((rule.scope === 'record' || rule.scope === 'field') && ctx.ref >= 0) problem.record = ctx.ref;
      problems.push(problem);
    },
  };

  const run = (rule: RuleDef): void => {
    ctx.rule = rule;
    checked++;
    rule.run(ctx);
  };

  // File rules.
  yield step('file', 0, 1, 0, 0.01);
  for (const rule of fileRules) run(rule);

  // Group rules.
  const groups = doc.file.groups;
  for (let gi = 0; gi < groups.length; gi++) {
    if (gi > 0 && gi % TXN_STEP === 0) yield step('groups', gi, groups.length, 0.01, 0.02);
    ctx.group = groups[gi];
    ctx.groupIndex = gi;
    ctx.txn = undefined;
    for (const rule of groupRules) run(rule);
  }

  // Transaction rules.
  let txnsDone = 0;
  const txnTotal = groups.reduce((sum, g) => sum + g.transactions.length, 0);
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]!;
    ctx.group = group;
    ctx.groupIndex = gi;
    for (const txn of group.transactions) {
      if (txnsDone > 0 && txnsDone % TXN_STEP === 0) yield step('transactions', txnsDone, txnTotal, 0.02, 0.5);
      txnsDone++;
      ctx.txn = txn;
      ctx.ref = txn.header;
      ctx.rec = records[txn.header]!;
      ctx.line = ctx.rec.line;
      for (const rule of txnRules) {
        if (rule.records && !rule.records.includes(ctx.rec.type)) continue;
        run(rule);
      }
    }
  }
  ctx.txn = undefined;
  ctx.group = undefined;

  // Record and field rules, in file order.
  const recordRulesByType = new Map<string, RuleDef[]>();
  const planByType = new Map<string, FieldPlanEntry[] | null>();
  const layoutByType = new Map<string, RecordLayoutDef | null>();

  const rulesFor = (type: string): RuleDef[] => {
    let list = recordRulesByType.get(type);
    if (!list) {
      list = recordRules.filter(r => !r.records || r.records.includes(type));
      recordRulesByType.set(type, list);
    }
    return list;
  };
  const layoutFor = (type: string): RecordLayoutDef | null => {
    let layout = layoutByType.get(type);
    if (layout === undefined) {
      layout = doc.layouts.getLayout(version, type);
      layoutByType.set(type, layout);
    }
    return layout;
  };
  const planFor = (type: string): FieldPlanEntry[] | null => {
    let plan = planByType.get(type);
    if (plan !== undefined) return plan;
    const layout = layoutFor(type);
    if (!layout || fieldRules.length === 0) {
      plan = null;
    } else {
      const applicable = fieldRules.filter(r => !r.records || r.records.includes(type));
      const entries: FieldPlanEntry[] = [];
      for (const field of layout.fields) {
        const list = applicable.filter(r => {
          const f = r.fields;
          if (!f) return true;
          if (f.formats && !f.formats.includes(field.format)) return false;
          if (f.reqs && !f.reqs.includes(field.req)) return false;
          if ((f.lookup || f.lookupIds || f.excludeLookupIds) && field.lookup === undefined) return false;
          if (f.ids && !f.ids.includes(field.id)) return false;
          if (f.lookupIds && !f.lookupIds.includes(field.lookup!)) return false;
          if (f.excludeLookupIds && f.excludeLookupIds.includes(field.lookup!)) return false;
          return true;
        });
        if (list.length > 0) entries.push({ field, rules: list });
      }
      plan = entries;
    }
    planByType.set(type, plan);
    return plan;
  };

  for (let ref = 0; ref < n; ref++) {
    if (ref > 0 && ref % STEP === 0) yield step('records', ref, n, 0.5, 1);
    const rec = records[ref]!;
    const text = lineText(doc, rec.line);
    const gi = groupOf[ref]!;
    ctx.ref = ref;
    ctx.rec = rec;
    ctx.line = rec.line;
    ctx.text = text;
    ctx.layout = layoutFor(rec.type);
    ctx.group = gi >= 0 ? doc.file.groups[gi] : undefined;
    ctx.groupIndex = gi;
    ctx.txnHeader = txnHeaderOf[ref]!;
    ctx.prevHeader = prevHeaderOf[ref]!;
    ctx.prev2Header = ctx.prevHeader >= 0 ? prevHeaderOf[ctx.prevHeader]! : -1;
    ctx.continuation = continuationOf[ref] === 1;
    ctx.inExc = excOf[ref] === 1;
    ctx.field = undefined;

    for (const rule of rulesFor(rec.type)) run(rule);

    const plan = planFor(rec.type);
    if (plan !== null) {
      const len = text.length;
      for (const entry of plan) {
        const f = entry.field;
        if (f.end > len) continue; // the record is too short to hold this field: STR-LEN reports it
        ctx.field = f;
        for (const rule of entry.rules) {
          ctx.rule = rule;
          checked++;
          rule.run(ctx);
        }
      }
      ctx.field = undefined;
    }
  }

  problems.sort((a, b) => a.line - b.line || (a.span?.start ?? -1) - (b.span?.start ?? -1) || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));

  yield step('records', n, n, 0.5, 1);

  const nProblems = counts.error + counts.warning;
  const text =
    nProblems === 0
      ? `No problems found in ${groupDigits(checked)} checks`
      : `${groupDigits(nProblems)} ${nProblems === 1 ? 'problem' : 'problems'} in ${groupDigits(checked)} checks: ` +
        `${groupDigits(counts.error)} ${counts.error === 1 ? 'error' : 'errors'}, ${groupDigits(counts.warning)} ${counts.warning === 1 ? 'warning' : 'warnings'}`;

  return {
    problems,
    checked,
    summary: {
      errors: counts.error,
      warnings: counts.warning,
      infos: counts.info,
      problems: nProblems,
      checked,
      records: n,
      text,
    },
    version,
    suppressed,
  };
}
