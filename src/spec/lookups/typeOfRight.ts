// Generated from spec/lookups/typeOfRight.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const TYPE_OF_RIGHT: readonly LookupRow[] = [
  { code: "MEC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PER", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SYN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const TYPE_OF_RIGHT_SET: ReadonlySet<string> = new Set(TYPE_OF_RIGHT.map((r) => r.code));

/** True when `code` is a code in the typeOfRight table (exact match). */
export function isTypeOfRight(code: string): boolean {
  return TYPE_OF_RIGHT_SET.has(code);
}
