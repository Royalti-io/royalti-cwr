// Generated from spec/lookups/subjectCode.tsv. Do not edit.
// 5 rows.
import type { LookupRow } from './types';

export const SUBJECT_CODE: readonly LookupRow[] = [
  { code: "DL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DW", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "IQ", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RQ", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const SUBJECT_CODE_SET: ReadonlySet<string> = new Set(SUBJECT_CODE.map((r) => r.code));

/** True when `code` is a code in the subjectCode table (exact match). */
export function isSubjectCode(code: string): boolean {
  return SUBJECT_CODE_SET.has(code);
}
