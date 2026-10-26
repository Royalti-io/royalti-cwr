// Generated from spec/lookups/excerptType.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const EXCERPT_TYPE: readonly LookupRow[] = [
  { code: "MOV", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "UEX", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "[blank]", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const EXCERPT_TYPE_SET: ReadonlySet<string> = new Set(EXCERPT_TYPE.map((r) => r.code));

/** True when `code` is a code in the excerptType table (exact match). */
export function isExcerptType(code: string): boolean {
  return EXCERPT_TYPE_SET.has(code);
}
