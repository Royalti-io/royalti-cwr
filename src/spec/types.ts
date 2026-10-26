/** Field-specification types. The data in `fields.2-1.ts` / `fields.2-2.ts` is generated from `spec/*.tsv`. */

export type CwrVersion = '2.1' | '2.2';

/** The spec legend (CWR 2.1 section 2.1.1): A alpha, B boolean, D date, F flag, L lookup, N numeric, T time. */
export type FieldFormat = 'A' | 'N' | 'D' | 'T' | 'B' | 'F' | 'L';

/** Mandatory, Conditional, Optional, as printed in the spec's Req column. */
export type FieldReq = 'M' | 'C' | 'O';

/** The spec's "Version x Fields" heading the row sits under. `society` is "Society Specific Fields". */
export type FieldBlock = 'base' | '2.0' | '2.1' | '2.2' | 'society';

/**
 * `ok`: transcribed from the spec table row.
 * `ambiguous`: the spec text is unclear.
 * `unsourced`: no spec text found; never used for rules.
 * `aggregate`: a parent row that repeats its children's width; left out of length sums.
 */
export type FieldStatus = 'ok' | 'ambiguous' | 'unsourced' | 'aggregate';

/** How a 2.2 row relates to the 2.1 row at the same position. Empty for 2.1 rows. */
export type FieldChange = '' | 'same' | 'changed' | 'renamed' | 'new';

export interface FieldDef {
  /** Layout key: `NWR` also covers REV, ISW and EXC; see `LAYOUT_ALIASES`. */
  readonly record: string;
  readonly version: CwrVersion;
  /** Stable camelCase id derived from the spec name; unique within a layout and version. */
  readonly id: string;
  /** Spec wording, whitespace collapsed. */
  readonly name: string;
  /** 1-based start, as printed in the spec. */
  readonly start: number;
  readonly size: number;
  readonly format: FieldFormat;
  readonly req: FieldReq;
  /** Lookup table id, only where the spec text names a table. */
  readonly lookup?: string;
  /** Shares: 5 digits with two implied decimals. Only where the spec prints 999v99. */
  readonly implied?: '999v99';
  readonly block: FieldBlock;
  readonly change: FieldChange;
  readonly status: FieldStatus;
  readonly source: { readonly slug: string; readonly quote: string; readonly impliedQuote?: string };
  readonly notes?: string;
}

/** An alias record type that shares a layout, with the spec sentence that says so. */
export interface LayoutAlias {
  readonly alias: string;
  readonly layout: string;
  readonly version: CwrVersion;
  readonly source: { readonly slug: string; readonly quote: string };
}
