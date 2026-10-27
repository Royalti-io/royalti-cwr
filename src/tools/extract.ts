import { withArticle } from '../model/article';
import { findField, lineText } from '../model/fields';
import { parseSteps } from '../model/parse';
import { CancelledError, drain } from '../model/progress';
import type { Progress, RunOptions } from '../model/progress';
import { specLayouts } from '../model/specLayout';
import { encodeText } from '../model/text';
import { DEFAULT_MAX_BYTES } from '../model/types';
import type { CwrDoc, FieldDef, Group, RecRef, Txn } from '../model/types';
import { BUILTIN_RULES } from '../rules/builtin';
import { checkSteps } from '../rules/check';
import { createRegistry } from '../rules/registry';
import { RECORD_STEP, stepper } from './steps';
import type { Stepper } from './steps';
import type { ToolError } from './types';

/**
 * Extract works: builds a new file from chosen transactions of an existing one.
 *
 * The output has the file header, then for each group that still has a chosen transaction its group header, the
 * chosen transactions and a group trailer, then the file trailer. Groups left with nothing are dropped. Transaction
 * and record sequence numbers are written again from zero, and the group and file counts are worked out again. Blank
 * lines and records outside any transaction are not copied (the result counts the latter). Every copied record keeps
 * its text after the 19-character prefix exactly; a record with no valid prefix is copied whole and not renumbered.
 * Line endings are made uniform (the first ending the source uses, CR LF when it has none); a missing final line
 * ending stays missing.
 *
 * Because this builds a file nobody has read yet, three guardrails run before the result is returned. If any fails the
 * result is an error and no file is handed back:
 *
 *  1. Reparse. The output is parsed again. It must have a header, a trailer, no stray records, the groups and
 *     transactions chosen and exactly the record types expected, in order.
 *  2. Structure. The structure checks (file framing, group and file counts, sequence numbers, record order, record
 *     types allowed in a transaction) are run on the reparsed output. The framing and numbering checks must find
 *     nothing, because this tool writes them. The checks that look inside a transaction must report, for the chosen
 *     transactions, the same findings the source has, at the same record and span. A finding the source did not have
 *     blocks the file, and so does a finding of the source that went missing. A chosen record that is numbered for
 *     another transaction than the one it sits in blocks the file too: writing the numbers again would hide it.
 *  3. Bodies. Each copied record must match its source from character 20 on, byte for byte (the text is decoded
 *     without loss, so equal text is equal bytes), and a record with no valid prefix must match whole. The header may
 *     differ from the source only in its creation and transmission dates and time, and the group and file trailers
 *     only in their ids and counts. The output is opened on its own, the way a receiver does, with its encoding detected
 *     from its own bytes.
 *
 * Before the guardrails run, a file that mixes text encodings is refused: when the new file, opened on its own, reads a
 * copied record as other text (a Latin-1 file with one stray byte whose chosen work holds valid UTF-8: the new file,
 * without the stray byte, is UTF-8), the chosen works would be read differently once the others are gone.
 *
 * `verifyExtraction` runs the same three guardrails on any bytes, so a host can re-check a downloaded result.
 *
 * The bytes the guardrails check are the bytes returned. `eol: 'crlf'` writes every line ending as CR LF while the file is
 * built, so a host that wants CR LF asks for it here and downloads `bytes` as they are; converting afterwards would hand out
 * bytes nothing had checked.
 *
 * `extractWorksSteps` is the same tool as a generator (see there): it reports progress in four stages, `build`, `reparse`,
 * `structure` and `bodies`, and a host can stop it between steps.
 */

export interface ExtractOptions {
  /** Copy the file header unchanged. Default false: creation date, creation time and transmission date are set to `now`. */
  keepHeader?: boolean;
  /** The time written into a new header, read as UTC. Default: the current time. Pass it for a repeatable result. */
  now?: Date;
  /**
   * Line endings of the new file. `keep` (default): the first ending the source uses, for every line (CR LF when the source has
   * none). `crlf`: CR LF for every line. Either way a missing final line ending stays missing. The guardrails check the bytes
   * written with this ending, and those are the bytes returned.
   */
  eol?: 'keep' | 'crlf';
}

/** What `extractWorksSteps` takes: the options of `extractWorks`, and the progress callback and cancel signal of `checkSteps`. */
export type ExtractStepsOptions = ExtractOptions & RunOptions;

/** Transaction header refs (`Txn.header`, as `WorkSummary.header` gives them). The output keeps the source's order. */
export type ExtractSelection = ReadonlyArray<RecRef> | ReadonlySet<RecRef>;

export interface GuardrailOutcome {
  ok: boolean;
  /** What went wrong, in plain words, at most 20. */
  problems: string[];
  /** How many more problems there were beyond `problems`. */
  more: number;
}

export interface ExtractChecks {
  ok: boolean;
  reparse: GuardrailOutcome;
  structure: GuardrailOutcome;
  bodies: GuardrailOutcome;
}

export interface ExtractStats {
  groups: number;
  transactions: number;
  /** Physical records in the output, header and trailers included. */
  records: number;
  /** Groups of the source left out because none of their transactions was chosen. */
  droppedGroups: number;
  /** Records of the source that sit outside any transaction (before the first group, between groups, after the trailer, a second file header). None is copied. */
  outsideRecords: number;
  /** The first few of them (at most 10): 0-based lines of the source, in file order. */
  outsideLines: number[];
}

export type ExtractErrorCode =
  | 'empty-selection'
  | 'not-a-transaction'
  | 'no-header'
  | 'short-header'
  | 'encoding-differs'
  | 'ack-continuation'
  | 'unnumberable-record'
  | 'count-overflow'
  | 'not-encodable'
  | 'guardrail';

/** Who is likely at fault for a refusal: the file the person gave, or this tool and the request. */
export type ExtractCause = 'file' | 'tool';

export interface ExtractError extends ToolError {
  code: ExtractErrorCode;
  /** The likely cause: `file` when the source is at fault. Absent reads as `tool`; a `guardrail` failure always carries it. */
  cause?: ExtractCause;
  /** Records the error is about (`not-a-transaction`, `ack-continuation`). */
  refs?: RecRef[];
  /** 0-based lines the error is about (`unnumberable-record`, `short-header`, `encoding-differs`). */
  lines?: number[];
}

export interface ExtractSuccess {
  ok: true;
  bytes: Uint8Array;
  /** The output parsed again. */
  doc: CwrDoc;
  stats: ExtractStats;
  /** The transactions written, as header refs of the source, in output order. */
  selected: RecRef[];
  /** Transactions added to the selection because they cannot be separated from a chosen one (an ACK and the EXC that continues it). */
  addedToSelection: RecRef[];
  /** False when `keepHeader` was set. */
  headerChanged: boolean;
  checks: ExtractChecks;
}

export interface ExtractFailure {
  ok: false;
  error: ExtractError;
  /** Present when a guardrail blocked the file. */
  checks?: ExtractChecks;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;

// ---- rule lists ------------------------------------------------------------------------------------------------------

/** Written by this tool, so they must find nothing in the output. */
const FRAMING_RULES: readonly string[] = ['HDR-1', 'HDR-2', 'TRL-1', 'FILE-4', 'FILE-6', 'FILE-7', 'FILE-8', 'GRH-F-002', 'GRT-F-001', 'GRT-F-002', 'GRT-F-003', 'TRL-F-001', 'TRL-F-002', 'TRL-F-003', 'PFX-2', 'PFX-3', 'PFX-4', 'PFX-5', 'PFX-6'];
/** Look inside a transaction: the output must report what the source reports for the chosen transactions. */
const CONTENT_RULES: readonly string[] = ['STR-F-001', 'NWR-T-008', 'NWR-T-012', 'NWR-T-018', 'NWR-T-022', 'NWR-T-043', 'IND-R-001', 'COM-R-001', 'ACK-T-002', 'ACK-T-003', 'AGR-T-002', 'AGR-T-003'];
/** Relate groups to each other: the output may be cleaner than the source but not worse. */
const NOT_WORSE_RULES: readonly string[] = ['GRH-F-005'];

export const EXTRACT_STRUCTURE_RULES: { framing: readonly string[]; content: readonly string[]; notWorse: readonly string[] } = {
  framing: FRAMING_RULES,
  content: CONTENT_RULES,
  notWorse: NOT_WORSE_RULES,
};

let structureRegistry: ReturnType<typeof createRegistry> | undefined;
function structureRules(): ReturnType<typeof createRegistry> {
  if (!structureRegistry) {
    const ids = new Set([...FRAMING_RULES, ...CONTENT_RULES, ...NOT_WORSE_RULES]);
    const rules = BUILTIN_RULES.filter(r => ids.has(r.id));
    if (rules.length !== ids.size) throw new Error('A structure rule used by extractWorks is missing from the built-in rules.');
    structureRegistry = createRegistry(rules);
  }
  return structureRegistry;
}

// ---- the plan ---------------------------------------------------------------------------------------------------------

const PREFIX_END = 19;
const CONTROL = new Set(['HDR', 'GRH', 'GRT', 'TRL']);

interface PlanTxn {
  txn: Txn;
  /** An EXC that carries on the numbering of the ACK transaction before it. */
  continuation: boolean;
}
interface PlanGroup {
  source: Group;
  txns: PlanTxn[];
}

/** The ACK transaction's work, when it carries an NWR or REV. */
function ackCarriesWork(doc: CwrDoc, txn: Txn): boolean {
  if (doc.records[txn.header]!.type !== 'ACK' || !txn.inner || txn.inner.length === 0) return false;
  const t = doc.records[txn.inner[0]!.header]!.type;
  return t === 'NWR' || t === 'REV';
}

function isContinuation(doc: CwrDoc, group: Group, index: number): boolean {
  return index > 0 && doc.records[group.transactions[index]!.header]!.type === 'EXC' && ackCarriesWork(doc, group.transactions[index - 1]!);
}

type PlanResult = { ok: true; groups: PlanGroup[]; added: RecRef[] } | { ok: false; error: ExtractError };

function plan(doc: CwrDoc, selection: ExtractSelection): PlanResult {
  const wanted = new Set<RecRef>(selection);
  if (wanted.size === 0) return { ok: false, error: { code: 'empty-selection', message: 'No transaction is selected, so there is nothing to extract.' } };
  const headers = new Set<RecRef>();
  for (const group of doc.file.groups) for (const txn of group.transactions) headers.add(txn.header);
  const unknown = [...wanted].filter(r => !headers.has(r));
  if (unknown.length > 0) {
    return { ok: false, error: { code: 'not-a-transaction', message: `${unknown.length} selected record${unknown.length === 1 ? ' is' : 's are'} not the header of a transaction in this file.`, refs: unknown } };
  }
  const groups: PlanGroup[] = [];
  const added: RecRef[] = [];
  for (const group of doc.file.groups) {
    const picked = new Array<boolean>(group.transactions.length).fill(false);
    group.transactions.forEach((txn, i) => {
      if (wanted.has(txn.header)) picked[i] = true;
    });
    // An ACK and the EXC that continues it are one unit: keep them together.
    for (let i = 1; i < group.transactions.length; i++) {
      if (!isContinuation(doc, group, i)) continue;
      if (picked[i] !== picked[i - 1]) {
        added.push(group.transactions[picked[i] ? i - 1 : i]!.header);
        picked[i] = picked[i - 1] = true;
      }
    }
    const txns: PlanTxn[] = [];
    group.transactions.forEach((txn, i) => {
      if (picked[i]) txns.push({ txn, continuation: isContinuation(doc, group, i) });
    });
    if (txns.length > 0) groups.push({ source: group, txns });
  }
  return { ok: true, groups, added };
}

// ---- text helpers --------------------------------------------------------------------------------------------------------

function fieldOf(doc: CwrDoc, type: string, id: string): FieldDef {
  const layout = doc.layouts.getLayout(doc.version.version, type) ?? specLayouts.getLayout(doc.version.version, type);
  const field = layout ? findField(layout, id) : undefined;
  if (!field) throw new Error(`No ${type} field ${id} in the layouts.`);
  return field;
}

/** Writes characters over a field's span, padding a short line with blanks up to the field first. */
function writeSpan(text: string, field: FieldDef, value: string): string {
  const head = text.length < field.start ? text.padEnd(field.start, ' ') : text.slice(0, field.start);
  return head + value + text.slice(field.end);
}

function writeNumber(text: string, field: FieldDef, n: number): string {
  const digits = String(n);
  const width = field.end - field.start;
  if (digits.length > width) throw new RangeError(`${n} does not fit in ${width} digits.`);
  return writeSpan(text, field, digits.padStart(width, '0'));
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function withPrefix(text: string, tseq: number, rseq: number): string {
  return text.slice(0, 3) + String(tseq).padStart(8, '0') + String(rseq).padStart(8, '0') + text.slice(PREFIX_END);
}

interface Built {
  /** Output lines (text without line endings) and, for each, the source record it copies. */
  texts: string[];
  sources: Array<RecRef | null>;
}

/**
 * Where each stage ends on the 0 to 1 scale a progress report carries. Measured on a 12 MB file: building takes about a third of
 * the time when every work is chosen and about a seventh when a third is, reading it back about a third and a quarter, and the
 * structure stage a fifth and a half (the source is checked whichever works are chosen).
 */
const BAND = { build: 0.3, reparse: 0.6, structure: 0.93 } as const;

function* buildSteps(doc: CwrDoc, groups: PlanGroup[], options: ExtractOptions, step: Stepper, total: number): Generator<Progress, Built, void> {
  const texts: string[] = [];
  const sources: Array<RecRef | null> = [];
  const textOf = (ref: RecRef): string => lineText(doc, doc.records[ref]!.line);

  let hdr = textOf(doc.file.hdr!);
  if (!options.keepHeader) {
    const now = options.now ?? new Date();
    const date = `${String(now.getUTCFullYear()).padStart(4, '0')}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`;
    const time = `${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
    hdr = writeSpan(hdr, fieldOf(doc, 'HDR', 'creationDate'), date);
    hdr = writeSpan(hdr, fieldOf(doc, 'HDR', 'creationTime'), time);
    hdr = writeSpan(hdr, fieldOf(doc, 'HDR', 'transmissionDate'), date);
  }
  texts.push(hdr);
  sources.push(doc.file.hdr!);

  let transactions = 0;
  let count = 1; // the HDR
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    const groupId = gi + 1;
    texts.push(writeNumber(textOf(g.source.grh), fieldOf(doc, 'GRH', 'groupId'), groupId));
    sources.push(g.source.grh);
    let tseq = -1;
    let records = 0;
    for (const { txn } of g.txns) {
      // An EXC that continues an ACK never gets here (it is refused), so every transaction starts a number of its own.
      tseq += 1;
      let rseq = 0;
      const refs = [txn.header, ...txn.records];
      for (let k = 0; k < refs.length; k++) {
        if (k > 0) rseq += 1;
        if (texts.length % RECORD_STEP === 0) yield step('build', texts.length, total, 0, BAND.build);
        // A record with no valid prefix has no number to write over: it keeps its place in the count and is copied whole.
        texts.push(doc.records[refs[k]!]!.tseq !== undefined ? withPrefix(textOf(refs[k]!), tseq, rseq) : textOf(refs[k]!));
        sources.push(refs[k]!);
      }
      records += refs.length;
    }
    transactions += g.txns.length;
    let grt = g.source.grt !== undefined ? textOf(g.source.grt) : 'GRT' + '0'.repeat(21);
    grt = writeNumber(grt, fieldOf(doc, 'GRT', 'groupId'), groupId);
    grt = writeNumber(grt, fieldOf(doc, 'GRT', 'transactionCount'), g.txns.length);
    grt = writeNumber(grt, fieldOf(doc, 'GRT', 'recordCount'), records + 2);
    texts.push(grt);
    sources.push(g.source.grt ?? null);
    count += records + 2;
  }
  count += 1; // the TRL
  let trl = doc.file.trl !== undefined ? textOf(doc.file.trl) : 'TRL' + '0'.repeat(21);
  trl = writeNumber(trl, fieldOf(doc, 'TRL', 'groupCount'), groups.length);
  trl = writeNumber(trl, fieldOf(doc, 'TRL', 'transactionCount'), transactions);
  trl = writeNumber(trl, fieldOf(doc, 'TRL', 'recordCount'), count);
  texts.push(trl);
  sources.push(doc.file.trl ?? null);
  return { texts, sources };
}

/** The lines as bytes, with the line ending the options ask for. `null` when a line cannot be written in the source's encoding. */
function* encodeSteps(doc: CwrDoc, texts: string[], options: ExtractOptions, step: Stepper, total: number): Generator<Progress, Uint8Array | null, void> {
  const eol = options.eol === 'crlf' ? '\r\n' : (doc.lines.find(l => l.eol !== '')?.eol ?? '\r\n');
  const lastEol = doc.lines.length === 0 || doc.lines[doc.lines.length - 1]!.eol !== '' ? eol : '';
  const parts: Uint8Array[] = [];
  let size = doc.bom ? 3 : 0;
  for (let i = 0; i < texts.length; i++) {
    if (i > 0 && i % RECORD_STEP === 0) yield step('build', texts.length + i, total, 0, BAND.build);
    const body = encodeText(texts[i]! + (i === texts.length - 1 ? lastEol : eol), doc.encoding);
    if (!body) return null;
    parts.push(body);
    size += body.length;
  }
  yield step('build', 2 * texts.length, total, 0, BAND.build);
  const out = new Uint8Array(size);
  let at = 0;
  if (doc.bom) {
    out.set(doc.bytes.subarray(0, 3), 0);
    at = 3;
  }
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && i % RECORD_STEP === 0) yield step('build', 2 * texts.length + i, total, 0, BAND.build);
    out.set(parts[i]!, at);
    at += parts[i]!.length;
  }
  yield step('build', total, total, 0, BAND.build);
  return out;
}

// ---- the guardrails -----------------------------------------------------------------------------------------------------

const CAP = 20;

class Outcome {
  readonly problems: string[] = [];
  more = 0;
  /** True once a problem is added that the source does not explain. */
  tool = false;
  /** `file`: the problem is in the source, not in what this tool wrote. */
  add(message: string, file = false): void {
    if (!file) this.tool = true;
    if (this.problems.length < CAP) this.problems.push(message);
    else this.more++;
  }
  done(): GuardrailOutcome {
    return { ok: this.problems.length === 0, problems: this.problems, more: this.more };
  }
}

interface Expected {
  type: string;
  /** The source record it copies, or null for a trailer written from nothing. */
  src: RecRef | null;
}

/** The records the output must hold, in order, for a plan. */
function expectedRecords(doc: CwrDoc, groups: PlanGroup[]): Expected[] {
  const out: Expected[] = [{ type: 'HDR', src: doc.file.hdr ?? null }];
  for (const g of groups) {
    out.push({ type: 'GRH', src: g.source.grh });
    for (const { txn } of g.txns) for (const ref of [txn.header, ...txn.records]) out.push({ type: doc.records[ref]!.type, src: ref });
    out.push({ type: 'GRT', src: g.source.grt ?? null });
  }
  out.push({ type: 'TRL', src: doc.file.trl ?? null });
  return out;
}

const keyOf = (ruleId: string, line: number, span: { start: number; end: number } | null): string => `${ruleId}|${line}|${span ? `${span.start}-${span.end}` : ''}`;

/** The spans of a control record that may differ from the source, as field ids. */
function maskedFields(type: string, keepHeader: boolean): string[] {
  if (type === 'HDR') return keepHeader ? [] : ['creationDate', 'creationTime', 'transmissionDate'];
  if (type === 'GRH') return ['groupId'];
  if (type === 'GRT') return ['groupId', 'transactionCount', 'recordCount'];
  return ['groupCount', 'transactionCount', 'recordCount'];
}

function masked(doc: CwrDoc, type: string, text: string, keepHeader: boolean): string {
  let out = text;
  for (const id of maskedFields(type, keepHeader)) {
    const f = fieldOf(doc, type, id);
    out = out.length > f.start ? out.slice(0, f.start) + '\u0000'.repeat(Math.min(f.end, out.length) - f.start) + out.slice(f.end) : out;
  }
  return out;
}

interface Verified {
  checks: ExtractChecks;
  /** The output parsed again; present when it could be parsed. The same document the guardrails looked at. */
  out: CwrDoc | undefined;
  /** `file` when every problem found is in the source. */
  cause: ExtractCause;
  /** Source lines of the copied records that read as other text in the output, when it is opened in another encoding than the source. */
  reread: number[];
}

function* verifySteps(source: CwrDoc, selected: ExtractSelection, output: Uint8Array, options: Pick<ExtractOptions, 'keepHeader'>, step: Stepper): Generator<Progress, Verified, void> {
  const reparse = new Outcome();
  const structure = new Outcome();
  const bodies = new Outcome();
  const keepHeader = options.keepHeader === true;
  const finish = (out?: CwrDoc, reread: number[] = []): Verified => {
    const r = reparse.done();
    const s = structure.done();
    const b = bodies.done();
    return { checks: { ok: r.ok && s.ok && b.ok, reparse: r, structure: s, bodies: b }, out, cause: reparse.tool || structure.tool || bodies.tool ? 'tool' : 'file', reread };
  };
  const notCompared = 'Not compared: the output does not line up with the selected transactions.';

  yield step('reparse', 0, 1000, BAND.build, BAND.reparse);
  const picked = plan(source, selected);
  if (!picked.ok) {
    reparse.add(picked.error.message);
    structure.add(notCompared);
    bodies.add(notCompared);
    return finish();
  }
  const groups = picked.groups;
  const expected = expectedRecords(source, groups);

  // Reading it back. Only the parse itself is inside the try, so a stop request is never taken for a bad output.
  const reading = parseSteps(output, { version: source.version.version, layouts: source.layouts, maxBytes: Math.max(DEFAULT_MAX_BYTES, output.length) });
  let out: CwrDoc;
  for (;;) {
    let next: IteratorResult<Progress, CwrDoc>;
    try {
      next = reading.next();
    } catch (e) {
      if (e instanceof CancelledError) throw e;
      reparse.add(`The output cannot be parsed again: ${e instanceof Error ? e.message : 'unknown error'}`);
      structure.add(notCompared);
      bodies.add(notCompared);
      return finish();
    }
    if (next.done) {
      out = next.value;
      break;
    }
    yield step('reparse', Math.round(next.value.fraction * 1000), 1000, BAND.build, BAND.reparse);
  }

  // 1. The shape of the reparsed output.
  if (out.file.hdr !== 0) reparse.add('The output does not start with a file header.');
  if (out.file.trl === undefined || out.file.trl !== out.records.length - 1) reparse.add('The output does not end with a file trailer.');
  if (out.orphans.length > 0) reparse.add(`${out.orphans.length} record${out.orphans.length === 1 ? ' is' : 's are'} outside any group or transaction.`);
  if (out.file.groups.length !== groups.length) reparse.add(`The output has ${out.file.groups.length} groups; ${groups.length} were expected.`);
  else {
    groups.forEach((g, gi) => {
      const og = out.file.groups[gi]!;
      if (og.grt === undefined) reparse.add(`Group ${gi + 1} has no group trailer.`);
      if (og.transactions.length !== g.txns.length) reparse.add(`Group ${gi + 1} has ${og.transactions.length} transactions; ${g.txns.length} were expected.`);
    });
  }
  if (out.records.length !== expected.length) reparse.add(`The output has ${out.records.length} records; ${expected.length} were expected.`);
  const same = Math.min(out.records.length, expected.length);
  for (let i = 0; i < same; i++) {
    const found = out.records[i]!.type;
    if (found !== expected[i]!.type) reparse.add(`Output line ${out.records[i]!.line + 1}: expected ${withArticle(expected[i]!.type)} record, found ${found.trim() === '' ? 'a blank type' : found}.`);
  }
  if (!reparse.done().ok) {
    structure.add(notCompared);
    bodies.add(notCompared);
    return finish(out);
  }

  // Where each copied source line went.
  const lineMap = new Map<number, number>();
  expected.forEach((e, i) => {
    if (e.src !== null) lineMap.set(source.records[e.src]!.line, out.records[i]!.line);
  });

  // 2. Structure rules, on the output and on the source. The two runs share the stage: the output is the first half.
  const ruleOptions = { registry: structureRules(), maxPerRule: Number.MAX_SAFE_INTEGER };
  yield step('structure', 0, 1000, BAND.reparse, BAND.structure);
  const outRun = checkSteps(out, ruleOptions);
  let outNext = outRun.next();
  while (!outNext.done) {
    yield step('structure', Math.round(outNext.value.fraction * 500), 1000, BAND.reparse, BAND.structure);
    outNext = outRun.next();
  }
  const outResult = outNext.value;
  const srcRun = checkSteps(source, ruleOptions);
  let srcNext = srcRun.next();
  while (!srcNext.done) {
    yield step('structure', 500 + Math.round(srcNext.value.fraction * 500), 1000, BAND.reparse, BAND.structure);
    srcNext = srcRun.next();
  }
  const srcResult = srcNext.value;
  // A chosen record numbered for another transaction than the one it sits in: writing the numbers again would hide what the source check reports.
  for (const { txn } of groups.flatMap(g => g.txns)) {
    const head = source.records[txn.header]!.tseq;
    for (const { line, type, tseq } of txn.records.map(ref => source.records[ref]!)) {
      if (head !== undefined && tseq !== undefined && tseq !== head) structure.add(`Source line ${line + 1}: ${type} has Transaction Sequence # ${tseq} but sits in transaction ${head}.`, true);
    }
  }
  const framing = new Set(FRAMING_RULES);
  const content = new Set(CONTENT_RULES);
  const notWorse = new Set(NOT_WORSE_RULES);
  for (const p of outResult.problems) {
    if (framing.has(p.ruleId)) structure.add(`Output line ${p.line + 1}: ${p.ruleId} still finds a problem in what this tool writes (${p.headline}).`);
  }
  const sourceKeys = new Map<string, number>();
  const sourceNotWorse = new Map<string, number>();
  for (const p of srcResult.problems) {
    const mapped = lineMap.get(p.line);
    if (mapped === undefined) continue;
    const key = keyOf(p.ruleId, mapped, p.span);
    if (content.has(p.ruleId)) sourceKeys.set(key, (sourceKeys.get(key) ?? 0) + 1);
    else if (notWorse.has(p.ruleId)) sourceNotWorse.set(key, (sourceNotWorse.get(key) ?? 0) + 1);
  }
  const outKeys = new Map<string, number>();
  for (const p of outResult.problems) {
    const key = keyOf(p.ruleId, p.line, p.span);
    if (content.has(p.ruleId)) outKeys.set(key, (outKeys.get(key) ?? 0) + 1);
    else if (notWorse.has(p.ruleId) && (sourceNotWorse.get(key) ?? 0) === 0) structure.add(`Output line ${p.line + 1}: ${p.ruleId} finds a problem the source does not have at the matching place.`);
  }
  for (const [key, n] of outKeys) {
    if ((sourceKeys.get(key) ?? 0) < n) structure.add(`Output line ${Number(key.split('|')[1]) + 1}: ${key.split('|')[0]} finds a problem the source does not have at the matching place.`);
  }
  for (const [key, n] of sourceKeys) {
    if ((outKeys.get(key) ?? 0) < n) structure.add(`Output line ${Number(key.split('|')[1]) + 1}: ${key.split('|')[0]} found a problem in the source that the output no longer shows.`);
  }

  // 3. Record bodies. The source line of each record that differs is kept: when the output is opened in another encoding than the source, those are the records read as other text.
  const moved: number[] = [];
  const mark = (src: RecRef, message: string): void => {
    bodies.add(message);
    moved.push(source.records[src]!.line);
  };
  for (let i = 0; i < expected.length; i++) {
    if (i % RECORD_STEP === 0) yield step('bodies', i, expected.length, BAND.structure, 1);
    const e = expected[i]!;
    if (e.src === null) continue;
    const line = out.records[i]!.line;
    const a = lineText(source, source.records[e.src]!.line);
    const b = lineText(out, line);
    if (CONTROL.has(e.type)) {
      if (masked(source, e.type, a, keepHeader) !== masked(out, e.type, b, keepHeader)) {
        mark(e.src, `Output line ${line + 1}: the ${e.type} record differs from the source beyond ${e.type === 'HDR' ? 'its dates and time' : 'its id and counts'}.`);
      }
      continue;
    }
    if (source.records[e.src]!.tseq === undefined) {
      // No valid prefix, so nothing was renumbered: the whole line is the source's.
      if (a !== b) mark(e.src, `Output line ${line + 1}: the ${e.type} record has no valid prefix and differs from its source.`);
    } else if (a.length < PREFIX_END || b.length < PREFIX_END) mark(e.src, `Output line ${line + 1}: the record is too short to hold a sequence prefix.`);
    else if (a.slice(0, 3) !== b.slice(0, 3)) mark(e.src, `Output line ${line + 1}: the record type changed.`);
    else if (a.slice(PREFIX_END) !== b.slice(PREFIX_END)) mark(e.src, `Output line ${line + 1}: the ${e.type} record differs from its source after the sequence prefix.`);
  }
  yield step('bodies', expected.length, expected.length, BAND.structure, 1);

  return finish(out, out.encoding === source.encoding ? [] : moved);
}

/**
 * Runs the three guardrails on bytes that are meant to be an extract of `source`. `selected` are the source's
 * transaction header refs that went into the output (`ExtractSuccess.selected`). Never throws on a bad output; every
 * way it can be wrong is a problem in the result. `keepHeader` says whether the header was meant to be copied unchanged.
 */
export function verifyExtraction(source: CwrDoc, selected: ExtractSelection, output: Uint8Array, options: Pick<ExtractOptions, 'keepHeader'> = {}): ExtractChecks {
  return drain(verifySteps(source, selected, output, options, stepper('extract', {}))).checks;
}

// ---- the tool ---------------------------------------------------------------------------------------------------------------

export function extractWorks(doc: CwrDoc, selection: ExtractSelection, options: ExtractOptions = {}): ExtractResult {
  return drain(extractWorksSteps(doc, selection, options));
}

/**
 * `extractWorks` as a generator, shaped like `checkSteps`: it yields a `Progress` (`task: 'extract'`) about every 2,048
 * records and between the stages, and returns the same `ExtractResult` `extractWorks` returns, byte for byte. The stages, in
 * order, are
 *
 *  - `build`: the new file is written (its lines, then its bytes);
 *  - `reparse`: the bytes are read back (guardrail 1);
 *  - `structure`: the structure rules are run on the output and on the source (guardrail 2);
 *  - `bodies`: every record is compared with its source (guardrail 3).
 *
 * `done` and `total` count lines or records in `build` and `bodies`, and thousandths of the stage in `reparse` and `structure`,
 * which wrap the parser and the checker. `fraction` runs from 0 to 1 across the whole job and never goes down. A request the
 * tool refuses before it starts (an empty selection, say) returns its error without yielding.
 *
 * A host that has to stay responsive gives the event loop a turn between `next()` calls. Stopping is not calling `next()`
 * again (or `return()`): nothing has been written outside the generator and the source is only read, so a stopped run leaves
 * nothing behind. `options.signal` and `options.onProgress` work as in `checkSteps`; an aborted signal throws `CancelledError`.
 */
export function* extractWorksSteps(doc: CwrDoc, selection: ExtractSelection, options: ExtractStepsOptions = {}): Generator<Progress, ExtractResult, void> {
  const step = stepper('extract', options);
  const picked = plan(doc, selection);
  if (!picked.ok) return { ok: false, error: picked.error };
  if (doc.file.hdr === undefined) {
    return { ok: false, error: { code: 'no-header', cause: 'file', message: 'The file has no header record to build the new file from.' } };
  }

  // A new date and time cannot be written into a header that stops before them (the transmission date is the last of the three).
  const hdrLine = doc.records[doc.file.hdr]!.line;
  if (options.keepHeader !== true && lineText(doc, hdrLine).length < fieldOf(doc, 'HDR', 'transmissionDate').end) {
    return { ok: false, error: { code: 'short-header', cause: 'file', lines: [hdrLine], message: 'The file header ends before its dates, so it cannot be given new ones.' } };
  }

  // The EXC has the ACK's transaction number, yet the engine's group and file counts take it for a transaction of its own. Which count a receiver
  // wants is not settled, so a file with such a pair is not written.
  const continued = picked.groups.flatMap(g => g.txns.filter(t => t.continuation).map(t => t.txn.header));
  if (continued.length > 0) {
    return { ok: false, error: { code: 'ack-continuation', refs: continued, message: 'An EXC that continues an ACK is selected, and the counts for such a pair are not settled.' } };
  }

  // Every copied record must be able to carry a sequence prefix.
  const short: number[] = [];
  for (const g of picked.groups) {
    for (const { txn } of g.txns) {
      for (const ref of [txn.header, ...txn.records]) {
        const rec = doc.records[ref]!;
        if (lineText(doc, rec.line).length < PREFIX_END) short.push(rec.line);
      }
    }
  }
  if (short.length > 0) {
    return {
      ok: false,
      error: {
        code: 'unnumberable-record',
        cause: 'file',
        message: `${short.length} selected record${short.length === 1 ? ' is' : 's are'} shorter than the 19-character prefix, so ${short.length === 1 ? 'it' : 'they'} cannot be renumbered. Fix ${short.length === 1 ? 'it' : 'them'} first.`,
        lines: short,
      },
    };
  }

  // The output holds a record for each of these; the stage counts them three times: the lines are written, encoded, then joined into one buffer.
  const lines = picked.groups.reduce((sum, g) => sum + 2 + g.txns.reduce((n, t) => n + 1 + t.txn.records.length, 0), 2);
  yield step('build', 0, 3 * lines, 0, BAND.build);
  let built: Built;
  try {
    built = yield* buildSteps(doc, picked.groups, options, step, 3 * lines);
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, error: { code: 'count-overflow', message: 'A count in the new file does not fit its field.' } };
    throw e;
  }
  const bytes = yield* encodeSteps(doc, built.texts, options, step, 3 * lines);
  if (!bytes) return { ok: false, error: { code: 'not-encodable', message: 'The new file cannot be written in the source file\'s encoding.' } };

  const selected: RecRef[] = [];
  for (const g of picked.groups) for (const t of g.txns) selected.push(t.txn.header);
  const { checks, out, cause, reread } = yield* verifySteps(doc, selected, bytes, { keepHeader: options.keepHeader === true }, step);
  if (reread.length > 0) {
    return { ok: false, error: { code: 'encoding-differs', cause: 'file', lines: reread, message: 'The file mixes text encodings; the chosen records would read differently alone.' } };
  }
  if (!checks.ok || out === undefined) {
    return { ok: false, error: { code: 'guardrail', cause, message: 'A check failed, so no new file was produced. See `checks`.' }, checks };
  }

  return {
    ok: true,
    bytes,
    doc: out,
    stats: {
      groups: picked.groups.length,
      transactions: selected.length,
      records: built.texts.length,
      droppedGroups: doc.file.groups.length - picked.groups.length,
      outsideRecords: doc.orphans.length,
      outsideLines: doc.orphans.slice(0, 10).map(r => doc.records[r]!.line),
    },
    selected,
    addedToSelection: picked.added,
    headerChanged: options.keepHeader !== true,
    checks,
  };
}
