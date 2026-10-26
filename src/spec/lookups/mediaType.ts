// Generated from spec/lookups/mediaType.tsv. Do not edit.
// 51 rows.
import type { LookupRow } from './types';

export const MEDIA_TYPE: readonly LookupRow[] = [
  { code: "S", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "EP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RDS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RMS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "EPM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MLP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LP2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LP3", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "LP4", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SCD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CDS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CDM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RCD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CD2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SA", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SA2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CES", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CXS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CXM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RCE", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CEP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CE", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "CE2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SMC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SM2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MMC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "EMC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "RMC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MCP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MC2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MC3", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MC4", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DMC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MDS", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MDR", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MDP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MD", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "MD2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DC2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DV1", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DV2", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DV3", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DV4", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DW", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DM", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "DL", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const MEDIA_TYPE_SET: ReadonlySet<string> = new Set(MEDIA_TYPE.map((r) => r.code));

/** True when `code` is a code in the mediaType table (exact match). */
export function isMediaType(code: string): boolean {
  return MEDIA_TYPE_SET.has(code);
}
