// Generated from spec/lookups/identifierValidity.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const IDENTIFIER_VALIDITY: readonly LookupRow[] = [
  { code: "Y", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "U", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "N", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const IDENTIFIER_VALIDITY_SET: ReadonlySet<string> = new Set(IDENTIFIER_VALIDITY.map((r) => r.code));

/** True when `code` is a code in the identifierValidity table (exact match). */
export function isIdentifierValidity(code: string): boolean {
  return IDENTIFIER_VALIDITY_SET.has(code);
}
