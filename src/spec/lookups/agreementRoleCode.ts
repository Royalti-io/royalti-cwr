// Generated from spec/lookups/agreementRoleCode.tsv. Do not edit.
// 2 rows.
import type { LookupRow } from './types';

export const AGREEMENT_ROLE_CODE: readonly LookupRow[] = [
  { code: "AS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const AGREEMENT_ROLE_CODE_SET: ReadonlySet<string> = new Set(AGREEMENT_ROLE_CODE.map((r) => r.code));

/** True when `code` is a code in the agreementRoleCode table (exact match). */
export function isAgreementRoleCode(code: string): boolean {
  return AGREEMENT_ROLE_CODE_SET.has(code);
}
