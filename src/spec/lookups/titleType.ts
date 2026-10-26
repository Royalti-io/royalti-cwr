// Generated from spec/lookups/titleType.tsv. Do not edit.
// 11 rows.
import type { LookupRow } from './types';

export const TITLE_TYPE: readonly LookupRow[] = [
  { code: "AT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TE", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "FT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "IT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "OT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ET", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "OL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const TITLE_TYPE_SET: ReadonlySet<string> = new Set(TITLE_TYPE.map((r) => r.code));

/** True when `code` is a code in the titleType table (exact match). */
export function isTitleType(code: string): boolean {
  return TITLE_TYPE_SET.has(code);
}
