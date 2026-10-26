// Generated from spec/lookups/publisherType.tsv. Do not edit.
// 6 rows.
import type { LookupRow } from './types';

export const PUBLISHER_TYPE: readonly LookupRow[] = [
  { code: "AQ", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "E", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ES", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SE", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const PUBLISHER_TYPE_SET: ReadonlySet<string> = new Set(PUBLISHER_TYPE.map((r) => r.code));

/** True when `code` is a code in the publisherType table (exact match). */
export function isPublisherType(code: string): boolean {
  return PUBLISHER_TYPE_SET.has(code);
}
