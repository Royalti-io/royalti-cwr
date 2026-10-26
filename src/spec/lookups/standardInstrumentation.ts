// Generated from spec/lookups/standardInstrumentation.tsv. Do not edit.
// 50 rows.
import type { LookupRow } from './types';

export const STANDARD_INSTRUMENTATION: readonly LookupRow[] = [
  { code: "AUD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BND", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BBA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BRC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BQU", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BQN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BXT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BTR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CEN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CHO", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CAO", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "BCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MXC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "UCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "WCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "YCH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CLC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CQN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CBA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "FLC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "GML", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "GQT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "HNC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "JZE", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "OQU", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "COR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "ORC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SOR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PCE", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PDU", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PFH", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PQU", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PQN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "PTR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SQT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SOC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SQU", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SQN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SGT", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SBA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TBC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TPC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "TUC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "WEN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "WQR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "WQN", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const STANDARD_INSTRUMENTATION_SET: ReadonlySet<string> = new Set(STANDARD_INSTRUMENTATION.map((r) => r.code));

/** True when `code` is a code in the standardInstrumentation table (exact match). */
export function isStandardInstrumentation(code: string): boolean {
  return STANDARD_INSTRUMENTATION_SET.has(code);
}
