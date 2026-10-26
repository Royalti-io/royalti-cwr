// Generated from spec/lookups/isrcValidity.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const ISRC_VALIDITY: readonly LookupRow[] = [
  { code: "Y", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "U", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "N", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const ISRC_VALIDITY_SET: ReadonlySet<string> = new Set(ISRC_VALIDITY.map((r) => r.code));

/** True when `code` is a code in the isrcValidity table (exact match). */
export function isIsrcValidity(code: string): boolean {
  return ISRC_VALIDITY_SET.has(code);
}
