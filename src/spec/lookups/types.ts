// Generated. Do not edit.
/** Where a table comes from: CRF020 (2008, scoped to CWR up to 2.1), borrowed from the CWR 3.0 Lookup Table-05, or rebuilt from the functional specs. */
export type LookupScope = "crf020" | "3.0-borrowed" | "spec-2.1+2.2" | "spec-2.2";

/** One row of a lookup table. This package keeps the code, scope and status of every row, and no label text (see `description` and `detail`). */
export interface LookupRow {
  readonly code: string;
  /** Empty on every row except `societyCode`, where it is the society's name (a rule matches publisher names against it). */
  readonly description: string;
  /** Absent on every row except `tis`, where it holds only `type GROUP;` and `TIS-A xx;` (what the territory rules read). */
  readonly detail?: string;
  readonly scope: LookupScope;
  /** Space-separated flags: retired, autonumbered, historic, bibliographic. */
  readonly status?: string;
  /** Slug of the document the table comes from (a key of `SOURCES` in the reference module). */
  readonly source: string;
}

/** A table plus its membership helper. */
export interface LookupTable {
  readonly id: string;
  readonly rows: readonly LookupRow[];
  /** True when `code` is the code of at least one row (exact match, no trimming or case folding). */
  readonly has: (code: string) => boolean;
}
