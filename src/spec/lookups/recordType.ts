// Generated from spec/lookups/recordType.tsv. Do not edit.
// 42 rows.
import type { LookupRow } from './types';

export const RECORD_TYPE: readonly LookupRow[] = [
  { code: "HDR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "GRH", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "GRT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "TRL", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "AGR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NWR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "REV", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "ISW", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "EXC", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "ACK", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "TER", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "IPA", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NPA", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "SPU", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "OPU", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NPN", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "SPT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "SWR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "OWR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NWN", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "SWT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "PWR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "ALT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NAT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "EWT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "VER", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "PER", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NPR", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "REC", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "ORN", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "INS", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "IND", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "COM", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "MSG", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NET", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NCT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NVT", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "NOW", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "ARI", description: "", scope: "spec-2.1+2.2", source: "cisac/cwr-functional-spec-2-1" },
  { code: "OPT", description: "", scope: "spec-2.2", source: "cisac/cwr-functional-spec-2-2" },
  { code: "OWT", description: "", scope: "spec-2.2", source: "cisac/cwr-functional-spec-2-2" },
  { code: "XRF", description: "", scope: "spec-2.2", source: "cisac/cwr-functional-spec-2-2" },
];

const RECORD_TYPE_SET: ReadonlySet<string> = new Set(RECORD_TYPE.map((r) => r.code));

/** True when `code` is a code in the recordType table (exact match). */
export function isRecordType(code: string): boolean {
  return RECORD_TYPE_SET.has(code);
}
