// Generated from spec/lookups/identifierType.tsv. Do not edit.
// 4 rows.
import type { LookupRow } from './types';

export const IDENTIFIER_TYPE: readonly LookupRow[] = [
  { code: "W", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "R", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "P", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "V", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const IDENTIFIER_TYPE_SET: ReadonlySet<string> = new Set(IDENTIFIER_TYPE.map((r) => r.code));

/** True when `code` is a code in the identifierType table (exact match). */
export function isIdentifierType(code: string): boolean {
  return IDENTIFIER_TYPE_SET.has(code);
}
