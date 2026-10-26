export { check, checkSteps } from './check';
export { headlineOf, HEADLINE_MAX } from './headline';
export { createRegistry, defineRule } from './registry';
export { BUILTIN_REGISTRY, BUILTIN_RULES } from './builtin';
export { FIELD_EDITS, fieldEditCitations, frEditFor } from './fieldEdits';
export type { FieldEdit } from './fieldEdits';
export type {
  Citation,
  CheckOptions,
  CheckResult,
  CheckSummary,
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
} from './types';
