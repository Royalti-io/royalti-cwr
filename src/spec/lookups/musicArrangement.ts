// Generated from spec/lookups/musicArrangement.tsv. Do not edit.
// 5 rows.
import type { LookupRow } from './types';

export const MUSIC_ARRANGEMENT: readonly LookupRow[] = [
  { code: "NEW", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ARR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ADM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "UNS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ORI", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const MUSIC_ARRANGEMENT_SET: ReadonlySet<string> = new Set(MUSIC_ARRANGEMENT.map((r) => r.code));

/** True when `code` is a code in the musicArrangement table (exact match). */
export function isMusicArrangement(code: string): boolean {
  return MUSIC_ARRANGEMENT_SET.has(code);
}
