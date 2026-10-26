// Generated from spec/lookups/messageLevel.tsv. Do not edit.
// 5 rows.
import type { LookupRow } from './types';

export const MESSAGE_LEVEL: readonly LookupRow[] = [
  { code: "E", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "G", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "T", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "R", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "F", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const MESSAGE_LEVEL_SET: ReadonlySet<string> = new Set(MESSAGE_LEVEL.map((r) => r.code));

/** True when `code` is a code in the messageLevel table (exact match). */
export function isMessageLevel(code: string): boolean {
  return MESSAGE_LEVEL_SET.has(code);
}
