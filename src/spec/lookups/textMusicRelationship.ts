// Generated from spec/lookups/textMusicRelationship.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const TEXT_MUSIC_RELATIONSHIP: readonly LookupRow[] = [
  { code: "MUS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MTX", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TXT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const TEXT_MUSIC_RELATIONSHIP_SET: ReadonlySet<string> = new Set(TEXT_MUSIC_RELATIONSHIP.map((r) => r.code));

/** True when `code` is a code in the textMusicRelationship table (exact match). */
export function isTextMusicRelationship(code: string): boolean {
  return TEXT_MUSIC_RELATIONSHIP_SET.has(code);
}
