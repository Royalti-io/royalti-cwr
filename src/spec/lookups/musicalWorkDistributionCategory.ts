// Generated from spec/lookups/musicalWorkDistributionCategory.tsv. Do not edit.
// 4 rows.
import type { LookupRow } from './types';

export const MUSICAL_WORK_DISTRIBUTION_CATEGORY: readonly LookupRow[] = [
  { code: "JAZ", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "POP", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "SER", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
  { code: "UNC", description: "", scope: "crf020", source: "cisac/cwr-lookup-tables-crf020" },
];

const MUSICAL_WORK_DISTRIBUTION_CATEGORY_SET: ReadonlySet<string> = new Set(MUSICAL_WORK_DISTRIBUTION_CATEGORY.map((r) => r.code));

/** True when `code` is a code in the musicalWorkDistributionCategory table (exact match). */
export function isMusicalWorkDistributionCategory(code: string): boolean {
  return MUSICAL_WORK_DISTRIBUTION_CATEGORY_SET.has(code);
}
