// Generated from spec/lookups/compositeType.tsv. Do not edit.
// 5 rows.
import type { LookupRow } from './types';

export const COMPOSITE_TYPE: readonly LookupRow[] = [
  { code: "COS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MED", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "POT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "UCO", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "[blank]", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const COMPOSITE_TYPE_SET: ReadonlySet<string> = new Set(COMPOSITE_TYPE.map((r) => r.code));

/** True when `code` is a code in the compositeType table (exact match). */
export function isCompositeType(code: string): boolean {
  return COMPOSITE_TYPE_SET.has(code);
}
