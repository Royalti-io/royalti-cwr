// Generated from spec/lookups/versionType.tsv. Do not edit.
// 2 rows.
import type { LookupRow } from './types';

export const VERSION_TYPE: readonly LookupRow[] = [
  { code: "MOD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ORI", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const VERSION_TYPE_SET: ReadonlySet<string> = new Set(VERSION_TYPE.map((r) => r.code));

/** True when `code` is a code in the versionType table (exact match). */
export function isVersionType(code: string): boolean {
  return VERSION_TYPE_SET.has(code);
}
