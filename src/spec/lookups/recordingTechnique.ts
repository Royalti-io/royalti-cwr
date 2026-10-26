// Generated from spec/lookups/recordingTechnique.tsv. Do not edit.
// 3 rows.
import type { LookupRow } from './types';

export const RECORDING_TECHNIQUE: readonly LookupRow[] = [
  { code: "A", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "D", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "U", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const RECORDING_TECHNIQUE_SET: ReadonlySet<string> = new Set(RECORDING_TECHNIQUE.map((r) => r.code));

/** True when `code` is a code in the recordingTechnique table (exact match). */
export function isRecordingTechnique(code: string): boolean {
  return RECORDING_TECHNIQUE_SET.has(code);
}
