// Generated from spec/lookups/usaLicenseIndicator.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const USA_LICENSE_INDICATOR: readonly LookupRow[] = [
  { code: "A", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "B", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "S", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const USA_LICENSE_INDICATOR_SET: ReadonlySet<string> = new Set(USA_LICENSE_INDICATOR.map((r) => r.code));

/** True when `code` is a code in the usaLicenseIndicator table (exact match). */
export function isUsaLicenseIndicator(code: string): boolean {
  return USA_LICENSE_INDICATOR_SET.has(code);
}
