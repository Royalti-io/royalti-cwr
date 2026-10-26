/**
 * `@royalti/cwr/reference`: which document each check rests on.
 *
 * The documents (`SOURCES`: title, address, edition), and the slug of the document behind each rule, field and field edit.
 * This package carries no passages or quotations from those documents: every `quote` is the empty string and there are no lookup labels,
 * so a page links to the document and does not quote it.
 * Everything is plain data read by key.
 * It does not import the engine; it only needs the ids a `Problem` already carries.
 */
import type { Citation } from '../rules/types';
import { EDIT_CITATIONS, FIELD_CITATIONS, LAYOUT_ALIASES, LOOKUP_ROWS, RULE_CITATIONS } from './data';
import { LABEL_OVERRIDES } from '../spec/lookups/overrides';

export { SOURCES, sourceInfo } from './sources';
export type { SourceInfo } from './sources';
export type { Citation };

type Version = '2.1' | '2.2';

/** The citations behind a rule: the specification text it rests on. `source` is the main one. Undefined for an unknown rule id. */
export function ruleCitations(ruleId: string): { source: Citation; alsoSource: Citation[] } | undefined {
  const rows = Object.prototype.hasOwnProperty.call(RULE_CITATIONS, ruleId) ? RULE_CITATIONS[ruleId] : undefined;
  if (!rows || rows.length === 0) return undefined;
  const cites = rows.map(([slug, quote]) => ({ slug, quote }));
  return { source: cites[0]!, alsoSource: cites.slice(1) };
}

export interface FieldCitation extends Citation {
  /** Always absent in this package. */
  impliedQuote?: string;
  /** Always absent in this package. */
  notes?: string;
}

function layoutKey(version: Version, recordType: string): string {
  const alias = LAYOUT_ALIASES[version]?.[recordType];
  return alias ?? recordType;
}

/** The document behind a field (its quote is empty). `recordType` may be an alias (`REV`). Undefined for an unknown field. */
export function fieldCitation(version: Version, recordType: string, fieldId: string): FieldCitation | undefined {
  const key = `${version}:${layoutKey(version, recordType)}.${fieldId}`;
  const row = Object.prototype.hasOwnProperty.call(FIELD_CITATIONS, key) ? FIELD_CITATIONS[key] : undefined;
  if (!row) return undefined;
  const out: FieldCitation = { slug: row[0]!, quote: row[1]! };
  if (row[2]) out.impliedQuote = row[2];
  if (row[3]) out.notes = row[3];
  return out;
}

/** The spec's FR edit key that makes a field problem a warning (`NWR-F-005`), with its document (the quote is empty). Undefined when the field has none. */
export function editCitation(version: Version, recordType: string, fieldId: string): { edit: string; citation: Citation } | undefined {
  const key = `${layoutKey(version, recordType)}.${fieldId}`;
  const row = Object.prototype.hasOwnProperty.call(EDIT_CITATIONS, key) ? EDIT_CITATIONS[key] : undefined;
  if (!row) return undefined;
  const slug = version === '2.1' ? 'cisac/cwr-functional-spec-2-1' : 'cisac/cwr-functional-spec-2-2';
  return { edit: row[0]!, citation: { slug, quote: version === '2.2' && row[2] !== undefined ? row[2] : row[1]! } };
}

export interface LookupRowInfo {
  code: string;
  /** Always empty in this package. */
  description: string;
  /** Always absent in this package. */
  detail?: string;
}

/** The row for a code in a lookup table (exact match), or undefined. */
export function lookupRow(table: string, code: string): LookupRowInfo | undefined {
  const t = Object.prototype.hasOwnProperty.call(LOOKUP_ROWS, table) ? LOOKUP_ROWS[table] : undefined;
  const row = t && Object.prototype.hasOwnProperty.call(t, code) ? t[code] : undefined;
  if (!row) return undefined;
  const out: LookupRowInfo = { code, description: row[0]! };
  if (row[1] !== undefined) out.detail = row[1];
  return out;
}

/** The label for a code. This package carries none, except `lookupLabel('tis', '2136')`, which is `World`. */
export function lookupLabel(table: string, code: string): string | undefined {
  const override = LABEL_OVERRIDES[table]?.[code];
  if (override !== undefined) return override;
  const row = lookupRow(table, code);
  return row && row.description !== '' ? row.description : undefined;
}

/** What a `Problem` and its document are enough to look up. */
export interface CitedProblem {
  ruleId: string;
  fieldId?: string;
  record?: number;
}

/** The pieces of a document `explain` reads. */
export interface CitedDoc {
  records: ReadonlyArray<{ type: string }>;
  version: { version: Version };
}

export interface ProblemCitations {
  rule: { source: Citation; alsoSource: Citation[] } | undefined;
  field: FieldCitation | undefined;
  edit: { edit: string; citation: Citation } | undefined;
}

/** Everything the reference module holds about one problem: its rule's citations, its field's row and its FR edit. */
export function citationsFor(problem: CitedProblem, doc: CitedDoc): ProblemCitations {
  const version = doc.version.version;
  const type = problem.record === undefined ? undefined : doc.records[problem.record]?.type;
  const withField = problem.fieldId !== undefined && type !== undefined;
  return {
    rule: ruleCitations(problem.ruleId),
    field: withField ? fieldCitation(version, type, problem.fieldId!) : undefined,
    edit: withField ? editCitation(version, type, problem.fieldId!) : undefined,
  };
}
