/**
 * Rules engine types. A rule is data (id, severity, scope, versions, message, citation) plus a small
 * `run` function. The registry holds the rules; `check` drives them over a parsed document.
 *
 * The engine never says a file is "valid". It reports the problems it found in the checks it ran.
 */
import type { CwrDoc, CwrVersion, FieldDef, FieldFormat, Group, Rec, RecRef, RecordLayoutDef, Txn } from '../model/types';
import type { RunOptions } from '../model/progress';

export type Severity = 'error' | 'warning' | 'info';
export type RuleScope = 'field' | 'record' | 'transaction' | 'group' | 'file';

/** The spec's rejection code printed at the end of an edit: entire file, group, transaction, record, or field. */
export type SpecAction = 'ER' | 'GR' | 'TR' | 'RR' | 'FR';

/** The slug of the document a rule rests on (a key of `SOURCES` in the reference module). `quote` is always the empty string in this package. */
export interface Citation {
  readonly slug: string;
  readonly quote: string;
}

/** Which fields a field-scope rule runs on. Every given condition must hold. */
export interface FieldFilter {
  readonly formats?: readonly FieldFormat[];
  readonly reqs?: ReadonlyArray<FieldDef['req']>;
  /** Only fields the spec names a lookup table for. */
  readonly lookup?: boolean;
  /** Only fields whose lookup table is one of these ids. */
  readonly lookupIds?: readonly string[];
  /** Skip fields whose lookup table is one of these ids. */
  readonly excludeLookupIds?: readonly string[];
  /** Only fields with one of these spec ids (`prOwnershipShare`). */
  readonly ids?: readonly string[];
}

export interface Span {
  /** 0-based character offset on the line. */
  start: number;
  /** Exclusive. */
  end: number;
}

export interface RuleDef {
  /** CISAC's own key where the design gives one (`NWR-T-011`), otherwise the design's id (`STR-LEN`). */
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly scope: RuleScope;
  readonly versions: readonly CwrVersion[];
  /** Record types (as written in the file: `OPU`, `REV`) a record or field rule runs on. Default: all. */
  readonly records?: readonly string[];
  /** Field rules only. */
  readonly fields?: FieldFilter;
  /** The rejection code the spec prints for the edit, when it prints one. */
  readonly specAction?: SpecAction;
  /** CISAC's message key (`FIL E 002`) as printed in the CWR error-message list, when it has one. */
  readonly cisac?: string;
  /** `{name}` placeholders are filled from the problem's params. */
  readonly message: string;
  /**
   * A short form of `message` for list rows (up to 80 characters), with the same `{name}` placeholders.
   * Without one, the headline is the first sentence of the filled message, cut to 80 characters.
   */
  readonly headline?: string;
  readonly source: Citation;
  /** Further citations: the same edit in the other version, or a table, or the error-message list. */
  readonly alsoSource?: readonly Citation[];
  /**
   * True when the check rests on a secondary source and not on the CISAC specification. Its `source` then names that
   * source (slug `secondary/...`), its problems carry `secondary: true`, and its severity is `warning`.
   */
  readonly secondary?: boolean;
  run(ctx: RuleCtx): void;
}

export interface ReportInput {
  /** 0-based physical line index; -1 for the whole file. */
  line: number;
  /** Characters on that line to underline; omit for a record or whole-file location. */
  start?: number;
  end?: number;
  /** Drawn as a dotted box: characters the record should have but does not. */
  ghost?: boolean;
  fieldId?: string;
  params?: Record<string, string | number>;
  /** Overrides the rule's default severity (a field edit the spec marks FR is a warning). */
  severity?: Severity;
  /** Overrides the rule's message template. */
  message?: string;
  /** Overrides the rule's headline template (or, without one, the headline taken from the message). */
  headline?: string;
  /** CISAC key of the record-level edit that applies (`NWR-F-005`), when the field table knows it. */
  edit?: string;
  related?: ReadonlyArray<{ line: number; start: number; end: number; role: string }>;
}

export interface Problem {
  ruleId: string;
  severity: Severity;
  scope: RuleScope;
  message: string;
  /** A short form of `message` for list rows: at most 80 characters, no closing full stop. */
  headline: string;
  /** 0-based physical line index; -1 when the problem is about the whole file. */
  line: number;
  /** Underline on that line, or null for a record, transaction or file location. */
  span: Span | null;
  ghost?: boolean;
  fieldId?: string;
  edit?: string;
  params: Record<string, string | number>;
  related?: ReadonlyArray<{ line: number; start: number; end: number; role: string }>;
  /** The record the problem is about, when it has one. */
  record?: RecRef;
  /** The rule rests on a secondary source, not on the CISAC specification (the page shows a badge). */
  secondary?: true;
}

export interface CheckSummary {
  errors: number;
  warnings: number;
  infos: number;
  /** errors + warnings: what the sentence below counts. Info items are notes. */
  problems: number;
  checked: number;
  records: number;
  /** "..." or "...". Never "valid". */
  text: string;
}

export interface CheckResult {
  /** Sorted by line, then start, then rule id. At most `maxPerRule` per rule; see `suppressed`. */
  problems: Problem[];
  /** The number of rule executions that actually ran. */
  checked: number;
  summary: CheckSummary;
  version: CwrVersion;
  /** Problems found beyond `maxPerRule`, per rule id. They are counted in the summary but not listed. */
  suppressed: Record<string, number>;
}

export interface CheckOptions extends RunOptions {
  /** Default 1000. The summary still counts every problem. */
  maxPerRule?: number;
  /** Rule ids to skip. */
  disable?: readonly string[];
  /** A registry other than the built-in one (profiles, tests). */
  registry?: RuleRegistry;
}

export interface RuleRegistry {
  readonly rules: readonly RuleDef[];
  get(id: string): RuleDef | undefined;
  forVersion(version: CwrVersion): readonly RuleDef[];
}

/** What a rule's `run` sees. One mutable object, reused: read what you need, do not keep it. */
export interface RuleCtx {
  readonly doc: CwrDoc;
  readonly version: CwrVersion;
  readonly rule: RuleDef;
  /** group / transaction scope */
  group: Group | undefined;
  groupIndex: number;
  txn: Txn | undefined;
  /** record / field scope */
  ref: RecRef;
  rec: Rec;
  line: number;
  text: string;
  layout: RecordLayoutDef | null;
  /** field scope: the field being checked. Its characters are `text.slice(field.start, field.end)`; use `valueOf` for that. */
  field: FieldDef | undefined;
  /** Header of the transaction this record belongs to, or -1. */
  txnHeader: RecRef;
  /** For a transaction header: the previous top-level header in the same group, or -1. */
  prevHeader: RecRef;
  /** The header before `prevHeader`, or -1. */
  prev2Header: RecRef;
  /** For a transaction header: true when the spec's note [1] makes it a continuation of the previous one. */
  continuation: boolean;
  /** True when the record sits in an EXC transaction (the spec allows mandatory-field edits to be bypassed there). */
  inExc: boolean;
  /** True when `ref` is a header that continues the transaction before it (spec note [1]). */
  continuationAt(ref: RecRef): boolean;
  report(input: ReportInput): void;
}
