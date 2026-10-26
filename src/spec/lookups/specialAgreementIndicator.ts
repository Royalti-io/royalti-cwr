// Generated from spec/lookups/specialAgreementIndicator.tsv. Do not edit.
// 6 rows.
import type { LookupRow } from './types';

export const SPECIAL_AGREEMENT_INDICATOR: readonly LookupRow[] = [
  { code: "R", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "L", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "B", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "Y", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "N", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "U", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const SPECIAL_AGREEMENT_INDICATOR_SET: ReadonlySet<string> = new Set(SPECIAL_AGREEMENT_INDICATOR.map((r) => r.code));

/** True when `code` is a code in the specialAgreementIndicator table (exact match). */
export function isSpecialAgreementIndicator(code: string): boolean {
  return SPECIAL_AGREEMENT_INDICATOR_SET.has(code);
}
