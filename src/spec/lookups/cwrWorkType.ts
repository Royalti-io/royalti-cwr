// Generated from spec/lookups/cwrWorkType.tsv. Do not edit.
// 29 rows.
import type { LookupRow } from './types';

export const CWR_WORK_TYPE: readonly LookupRow[] = [
  { code: "TA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "FM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "FK", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BG", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SG", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "JZ", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "JG", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "NA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "OP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PK", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RK", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RB", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SY", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const CWR_WORK_TYPE_SET: ReadonlySet<string> = new Set(CWR_WORK_TYPE.map((r) => r.code));

/** True when `code` is a code in the cwrWorkType table (exact match). */
export function isCwrWorkType(code: string): boolean {
  return CWR_WORK_TYPE_SET.has(code);
}
