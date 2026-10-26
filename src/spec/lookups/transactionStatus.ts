// Generated from spec/lookups/transactionStatus.tsv. Do not edit.
// 8 rows.
import type { LookupRow } from './types';

export const TRANSACTION_STATUS: readonly LookupRow[] = [
  { code: "CO", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DU", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RJ", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "NP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const TRANSACTION_STATUS_SET: ReadonlySet<string> = new Set(TRANSACTION_STATUS.map((r) => r.code));

/** True when `code` is a code in the transactionStatus table (exact match). */
export function isTransactionStatus(code: string): boolean {
  return TRANSACTION_STATUS_SET.has(code);
}
