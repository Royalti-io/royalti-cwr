// Generated from spec/lookups/agreementType.tsv. Do not edit.
// 4 rows.
import type { LookupRow } from './types';

export const AGREEMENT_TYPE: readonly LookupRow[] = [
  { code: "OS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PG", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "OG", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const AGREEMENT_TYPE_SET: ReadonlySet<string> = new Set(AGREEMENT_TYPE.map((r) => r.code));

/** True when `code` is a code in the agreementType table (exact match). */
export function isAgreementType(code: string): boolean {
  return AGREEMENT_TYPE_SET.has(code);
}
