/** Spec editions this build implements. Bumped when a rule or field definition changes. */
export const SPEC_VERSION = '0.0.0';
export const SUPPORTED_VERSIONS = ['2.1', '2.2'] as const satisfies readonly CwrVersion[];

import type { CwrVersion } from './model/types';
export type { CwrVersion };

export { parse, parseSteps, DEFAULT_LAYOUTS } from './model/parse';
export { CancelledError, createCancelToken, throwIfCancelled } from './model/progress';
export type { CancelSignal, CancelToken, Progress, RunOptions } from './model/progress';
export { sniff } from './model/sniff';
export type { SniffKind, SniffOptions, SniffReason, SniffResult } from './model/sniff';
export { buildStructure, getWorkView, TXN_HEADERS, WORK_HEADERS, CONTROL_TYPES } from './model/group';
export { lineText, recordText, layoutOf, findField, fieldSpan, getField, overflowSpan } from './model/fields';
export type { FieldSpan } from './model/fields';
export { specLayouts } from './model/specLayout';
export { fieldInfo, fieldInfos, FIELD_FORMAT_NAMES, FIELD_REQ_NAMES } from './spec/info';
export type { FieldInfo } from './spec/info';
export { workSummary, workSummaries, formatShare } from './rules/workSummary';
export type { PartySummary, RightTotal, Right, WorkSummary } from './rules/workSummary';
export { FIELD_REFS } from './model/fieldRefs';
export { UnsupportedVersionError, InputTooLargeError, EditError, DEFAULT_MAX_BYTES } from './model/types';
export type {
  CwrDoc,
  Encoding,
  Eol,
  FieldDef,
  FieldFormat,
  FileStructure,
  Group,
  LayoutProvider,
  Line,
  ParseOptions,
  Rec,
  RecRef,
  RecStatus,
  RecordLayoutDef,
  Txn,
  VersionInfo,
  WorkView,
} from './model/types';
export { serialize } from './write/serialize';
export type { SerializeOptions } from './write/serialize';
export { setField, forkDoc, renumber } from './write/edit';
export type { SetFieldOptions, SetFieldResult, RenumberChange } from './write/edit';
export { generateCwr, generateCwrText, SYNTH_IPIS } from './synth/generate';
export type { SynthOptions } from './synth/generate';
export { check, checkSteps, headlineOf, HEADLINE_MAX, createRegistry, defineRule, BUILTIN_REGISTRY, BUILTIN_RULES, FIELD_EDITS, fieldEditCitations, frEditFor } from './rules/index';
export type {
  Citation,
  CheckOptions,
  CheckResult,
  CheckSummary,
  FieldEdit,
  FieldFilter,
  Problem,
  ReportInput,
  RuleCtx,
  RuleDef,
  RuleRegistry,
  RuleScope,
  Severity,
  SpecAction,
  Span,
} from './rules/index';
