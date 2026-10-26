import type { CwrVersion, FieldDef } from './types';
import { FIELDS_2_1, FIELDS_BY_RECORD_2_1, LAYOUTS_2_1, LAYOUT_ALIASES_2_1 } from './fields.2-1';
import { FIELDS_2_2, FIELDS_BY_RECORD_2_2, LAYOUTS_2_2, LAYOUT_ALIASES_2_2 } from './fields.2-2';

export type { CwrVersion, FieldBlock, FieldChange, FieldDef, FieldFormat, FieldReq, FieldStatus, LayoutAlias } from './types';

const BY_VERSION = {
  '2.1': { fields: FIELDS_2_1, byRecord: FIELDS_BY_RECORD_2_1, layouts: LAYOUTS_2_1, aliases: LAYOUT_ALIASES_2_1 },
  '2.2': { fields: FIELDS_2_2, byRecord: FIELDS_BY_RECORD_2_2, layouts: LAYOUTS_2_2, aliases: LAYOUT_ALIASES_2_2 },
} as const;

/** All fields of a version, in spec order. */
export function allFields(version: CwrVersion): readonly FieldDef[] {
  return BY_VERSION[version].fields;
}

/** Layout keys of a version, in spec order. */
export function layoutKeys(version: CwrVersion): readonly string[] {
  return BY_VERSION[version].layouts;
}

/** Resolves a record type to its layout key (`REV` to `NWR`), or null when the type is not valid for the version. */
export function layoutFor(version: CwrVersion, recordType: string): string | null {
  const v = BY_VERSION[version];
  if (Object.prototype.hasOwnProperty.call(v.byRecord, recordType)) return recordType;
  const alias = v.aliases.find((a) => a.alias === recordType);
  return alias ? alias.layout : null;
}

/** Fields of a record type (aliases resolved), or an empty list for an unknown type. */
export function fieldsOf(version: CwrVersion, recordType: string): readonly FieldDef[] {
  const layout = layoutFor(version, recordType);
  return layout === null ? [] : (BY_VERSION[version].byRecord[layout] ?? []);
}

/** Full width of a layout (end of its last field), or undefined for an unknown type. Aggregate rows are ignored. */
export function layoutLength(version: CwrVersion, recordType: string): number | undefined {
  const fields = fieldsOf(version, recordType).filter((f) => f.status !== 'aggregate');
  if (fields.length === 0) return undefined;
  return Math.max(...fields.map((f) => f.start + f.size - 1));
}
