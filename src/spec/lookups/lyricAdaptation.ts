// Generated from spec/lookups/lyricAdaptation.tsv. Do not edit.
// 8 rows.
import type { LookupRow } from './types';

export const LYRIC_ADAPTATION: readonly LookupRow[] = [
  { code: "NEW", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MOD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "NON", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ORI", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "REP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ADL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "UNS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TRA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const LYRIC_ADAPTATION_SET: ReadonlySet<string> = new Set(LYRIC_ADAPTATION.map((r) => r.code));

/** True when `code` is a code in the lyricAdaptation table (exact match). */
export function isLyricAdaptation(code: string): boolean {
  return LYRIC_ADAPTATION_SET.has(code);
}
