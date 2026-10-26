// Generated from spec/lookups/messageType.tsv. Do not edit.
// 5 rows.
import type { LookupRow } from './types';

export const MESSAGE_TYPE: readonly LookupRow[] = [
  { code: "F", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "R", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "T", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "G", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
  { code: "E", description: "", scope: "3.0-borrowed", source: "cisac/cwr-3-0-lookup-table-05" },
];

const MESSAGE_TYPE_SET: ReadonlySet<string> = new Set(MESSAGE_TYPE.map((r) => r.code));

/** True when `code` is a code in the messageType table (exact match). */
export function isMessageType(code: string): boolean {
  return MESSAGE_TYPE_SET.has(code);
}
