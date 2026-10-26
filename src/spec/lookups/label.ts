import { LOOKUPS } from './index';
import { LABEL_OVERRIDES } from './overrides';
import type { LookupRow } from './types';

const index = new Map<string, Map<string, LookupRow>>();

function rowsOf(table: string): Map<string, LookupRow> | undefined {
  let m = index.get(table);
  if (m) return m;
  const t = (LOOKUPS as Readonly<Record<string, { rows: readonly LookupRow[] }>>)[table];
  if (!t) return undefined;
  m = new Map();
  for (const r of t.rows) if (!m.has(r.code)) m.set(r.code, r);
  index.set(table, m);
  return m;
}

/** The row for `code` in a lookup table (exact match on the code), or undefined. */
export function lookupRow(table: string, code: string): LookupRow | undefined {
  return rowsOf(table)?.get(code);
}

/**
 * The label for a code. This package carries no lookup labels, so the answer is undefined except for the society names
 * (`lookupLabel('societyCode', '010')`) and the world territory (`lookupLabel('tis', '2136')` is `World`).
 * Not in the lite entry.
 */
export function lookupLabel(table: string, code: string): string | undefined {
  const override = LABEL_OVERRIDES[table]?.[code];
  if (override !== undefined) return override;
  const row = lookupRow(table, code);
  return row && row.description !== '' ? row.description : undefined;
}
