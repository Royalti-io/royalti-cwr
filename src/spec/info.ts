import { fieldsOf, layoutFor } from './index';
import type { CwrVersion, FieldBlock, FieldChange, FieldFormat, FieldReq, FieldStatus } from './types';

/**
 * What the specification says about one field: its name, position, size and format (this package carries no quote). Enough for a tooltip: `Writer Last Name, 45 characters, alphanumeric, mandatory`.
 */
export interface FieldInfo {
  /** Layout key: `NWR` for a `REV` record. */
  record: string;
  version: CwrVersion;
  /** The id used everywhere else in the API (`prOwnershipShare`). */
  id: string;
  /** The specification's own name for the field (`PR Ownership Share`). */
  name: string;
  /** 1-based start, as the specification prints it. */
  start: number;
  size: number;
  format: FieldFormat;
  req: FieldReq;
  /** Lookup table id, when the specification names one (a key of `LOOKUPS`). */
  lookup?: string;
  /** Shares: five digits with two implied decimals. */
  implied?: '999v99';
  block: FieldBlock;
  change: FieldChange;
  status: FieldStatus;
  /** Slug of the source document that holds the row (`cisac/cwr-functional-spec-2-2`). Resolve it with `sourceInfo` from the reference module. */
  slug: string;
  /** A note on an ambiguous or unsourced row. Always absent in this package. */
  notes?: string;
}

/** The legend's names for the format letters, for a tooltip. */
export const FIELD_FORMAT_NAMES: Readonly<Record<FieldFormat, string>> = {
  A: 'alphanumeric',
  N: 'numeric',
  D: 'date (YYYYMMDD)',
  T: 'time (HHMMSS)',
  B: 'boolean (Y or N)',
  F: 'flag',
  L: 'lookup',
};

/** The legend's names for the requirement letters. */
export const FIELD_REQ_NAMES: Readonly<Record<FieldReq, string>> = { M: 'mandatory', C: 'conditional', O: 'optional' };

/**
 * The specification's row for a field, or undefined for an unknown record type or id.
 * `recordType` may be an alias (`REV`, `OPU`): it resolves to the shared layout. Aggregate rows (a parent that
 * repeats its children's width) are included; check `status`.
 */
export function fieldInfo(version: CwrVersion, recordType: string, fieldId: string): FieldInfo | undefined {
  const f = fieldsOf(version, recordType).find(x => x.id === fieldId);
  if (!f) return undefined;
  const info: FieldInfo = {
    record: f.record,
    version: f.version,
    id: f.id,
    name: f.name,
    start: f.start,
    size: f.size,
    format: f.format,
    req: f.req,
    block: f.block,
    change: f.change,
    status: f.status,
    slug: f.source.slug,
  };
  if (f.lookup !== undefined) info.lookup = f.lookup;
  if (f.implied !== undefined) info.implied = f.implied;
  if (f.notes !== undefined && f.notes !== '') info.notes = f.notes;
  return info;
}

/** Every field of a record type in spec order (see `fieldInfo`), or an empty list when the type is not valid for the version. */
export function fieldInfos(version: CwrVersion, recordType: string): FieldInfo[] {
  if (layoutFor(version, recordType) === null) return [];
  const out: FieldInfo[] = [];
  for (const f of fieldsOf(version, recordType)) {
    const info = fieldInfo(version, recordType, f.id);
    if (info) out.push(info);
  }
  return out;
}
