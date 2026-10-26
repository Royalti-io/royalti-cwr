// Generated from spec/lookups/inclusionExclusionIndicator.tsv. Do not edit.
// 2 rows.
import type { LookupRow } from './types';

export const INCLUSION_EXCLUSION_INDICATOR: readonly LookupRow[] = [
  { code: "I", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "E", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const INCLUSION_EXCLUSION_INDICATOR_SET: ReadonlySet<string> = new Set(INCLUSION_EXCLUSION_INDICATOR.map((r) => r.code));

/** True when `code` is a code in the inclusionExclusionIndicator table (exact match). */
export function isInclusionExclusionIndicator(code: string): boolean {
  return INCLUSION_EXCLUSION_INDICATOR_SET.has(code);
}
