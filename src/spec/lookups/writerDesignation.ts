// Generated from spec/lookups/writerDesignation.tsv. Do not edit.
// 9 rows.
import type { LookupRow } from './types';

export const WRITER_DESIGNATION: readonly LookupRow[] = [
  { code: "AD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "AR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "A", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "C", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const WRITER_DESIGNATION_SET: ReadonlySet<string> = new Set(WRITER_DESIGNATION.map((r) => r.code));

/** True when `code` is a code in the writerDesignation table (exact match). */
export function isWriterDesignation(code: string): boolean {
  return WRITER_DESIGNATION_SET.has(code);
}
