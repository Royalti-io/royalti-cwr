// Generated from spec/lookups/transactionType.tsv. Do not edit.
// 7 rows.
import type { LookupRow } from './types';

export const TRANSACTION_TYPE: readonly LookupRow[] = [
  { code: "ACK", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AGR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "NWR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "REV", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ISW", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "EXC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "COP", description: "", scope: "crf020", status: "retired", source: "cisac/cwr-lookup-tables-crf020" },
];

const TRANSACTION_TYPE_SET: ReadonlySet<string> = new Set(TRANSACTION_TYPE.map((r) => r.code));

/** True when `code` is a code in the transactionType table (exact match). */
export function isTransactionType(code: string): boolean {
  return TRANSACTION_TYPE_SET.has(code);
}
