// Generated from spec/lookups/cwrRevisionNumber.tsv. Do not edit.
// 1 rows.
import type { LookupRow } from './types';

export const CWR_REVISION_NUMBER: readonly LookupRow[] = [
  { code: "000", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const CWR_REVISION_NUMBER_SET: ReadonlySet<string> = new Set(CWR_REVISION_NUMBER.map((r) => r.code));

/** True when `code` is a code in the cwrRevisionNumber table (exact match). */
export function isCwrRevisionNumber(code: string): boolean {
  return CWR_REVISION_NUMBER_SET.has(code);
}
