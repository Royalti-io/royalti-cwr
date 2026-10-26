// Generated from spec/lookups/bltvr.tsv. Do not edit.
// 5 rows.
import type { LookupRow } from './types';

export const BLTVR: readonly LookupRow[] = [
  { code: "B", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "L", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "R", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "T", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "V", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const BLTVR_SET: ReadonlySet<string> = new Set(BLTVR.map((r) => r.code));

/** True when `code` is a code in the bltvr table (exact match). */
export function isBltvr(code: string): boolean {
  return BLTVR_SET.has(code);
}
