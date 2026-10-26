// Generated from spec/lookups/intendedPurpose.tsv. Do not edit.
// 9 rows.
import type { LookupRow } from './types';

export const INTENDED_PURPOSE: readonly LookupRow[] = [
  { code: "COM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "FIL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "GEN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LIB", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MUL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RAD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TEL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "THR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "VID", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const INTENDED_PURPOSE_SET: ReadonlySet<string> = new Set(INTENDED_PURPOSE.map((r) => r.code));

/** True when `code` is a code in the intendedPurpose table (exact match). */
export function isIntendedPurpose(code: string): boolean {
  return INTENDED_PURPOSE_SET.has(code);
}
