import type { CwrVersion } from '../model/types';
import type { Citation } from './types';
import { S21, S22 } from './locate';

/**
 * Field-level edits that end in (FR): the spec rejects the field and the receiver supplies a default value.
 * The format and lookup rules report such a field as a warning, not an error, and name the edit.
 * Every other field falls back to the legend in the spec's section on data elements: data that is
 * inconsistent with the field's format rules "...", so those are errors.
 *
 * `layout` is the layout key (SPU also covers OPU, SWR covers OWR). `edit` is CISAC's key
 * (`<record>-F-<edit number>` in the 2.1 numbering). `versions` lists the specs whose text carries the same
 * edit.
 */
export interface FieldEdit {
  readonly layout: string;
  readonly fieldId: string;
  readonly edit: string;
  readonly quote: string;
  /** The 2.2 wording when it differs from `quote`. */
  readonly quote22?: string;
  readonly versions: readonly CwrVersion[];
}

const V: readonly CwrVersion[] = ['2.1', '2.2'];

export const FIELD_EDITS: readonly FieldEdit[] = [
  { layout: 'AGR', fieldId: 'dateOfSignatureOfAgreement', edit: 'AGR-F-018', quote: '', versions: V },
  { layout: 'AGR', fieldId: 'sharesChange', edit: 'AGR-F-022', quote: '', versions: V },
  { layout: 'AGR', fieldId: 'advanceGiven', edit: 'AGR-F-023', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'copyrightDate', edit: 'NWR-F-005', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'duration', edit: 'NWR-F-008', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'recordedIndicator', edit: 'NWR-F-009', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'textMusicRelationship', edit: 'NWR-F-010', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'compositeType', edit: 'NWR-F-011', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'excerptType', edit: 'NWR-F-013', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'grandRightsInd', edit: 'NWR-F-016', quote: '', versions: V },
  { layout: 'NWR', fieldId: 'cwrWorkType', edit: 'NWR-F-017', quote: '', versions: V },
  { layout: 'SPU', fieldId: 'specialAgreementsIndicator', edit: 'SPU-F-020', quote: '', versions: V },
  { layout: 'SPU', fieldId: 'firstRecordingRefusalInd', edit: 'SPU-F-021', quote: '', versions: V },
  { layout: 'SPU', fieldId: 'agreementType', edit: 'SPU-F-030', quote: '', versions: V },
  { layout: 'SPU', fieldId: 'usaLicenseInd', edit: 'SPU-F-031', quote: '', versions: V },
  { layout: 'REC', fieldId: 'recordingTechnique', edit: 'REC-F-012', quote: '', versions: V },
  { layout: 'SPT', fieldId: 'sharesChange', edit: 'SPT-F-011', quote: '', versions: V },
  { layout: 'SWT', fieldId: 'sharesChange', edit: 'SWT-F-008', quote: '', versions: V },
  { layout: 'SWR', fieldId: 'reversionaryIndicator', edit: 'SWR-F-016', quote: '', versions: V },
  { layout: 'SWR', fieldId: 'firstRecordingRefusalInd', edit: 'SWR-F-017', quote: '', versions: V },
  { layout: 'SWR', fieldId: 'workForHireIndicator', edit: 'SWR-F-018', quote: '', versions: V },
  { layout: 'SWR', fieldId: 'usaLicenseInd', edit: 'SWR-F-024', quote: '', versions: V },
  { layout: 'ALT', fieldId: 'titleType', edit: 'ALT-F-002', quote: '', versions: V },
  { layout: 'NAT', fieldId: 'titleType', edit: 'NAT-F-002', quote: '', versions: V },
  { layout: 'NPN', fieldId: 'languageCode', edit: 'NPN-F-004', quote: '', versions: V },
  { layout: 'NWN', fieldId: 'languageCode', edit: 'NWN-F-003', quote: '', versions: V },
  { layout: 'NPA', fieldId: 'languageCode', edit: 'NPA-F-003', quote: '', versions: V },
  { layout: 'NOW', fieldId: 'languageCode', edit: 'NOW-F-002', quote: '', versions: V },
  { layout: 'NPR', fieldId: 'languageCode', edit: 'NPR-F-004', quote: '', versions: V },
  { layout: 'NPR', fieldId: 'performanceLanguage', edit: 'NPR-F-006', quote: '', versions: V },
  { layout: 'EWT', fieldId: 'languageCode', edit: 'EWT-F-003', quote: '', versions: V },
  { layout: 'VER', fieldId: 'languageCode', edit: 'VER-F-003', quote: '', versions: V },
  { layout: 'REC', fieldId: 'firstReleaseDate', edit: 'REC-F-002', quote: '', quote22: '', versions: V },
  { layout: 'REC', fieldId: 'firstReleaseDuration', edit: 'REC-F-003', quote: '', quote22: '', versions: V },
  { layout: 'REC', fieldId: 'mediaType', edit: 'REC-F-014', quote: '', versions: V },
  { layout: 'COM', fieldId: 'duration', edit: 'COM-F-003', quote: '', versions: V },
];

const byKey = new Map<string, FieldEdit>();
for (const e of FIELD_EDITS) byKey.set(`${e.layout}.${e.fieldId}`, e);

/** The FR edit that covers a field, for a version, or undefined (the legend's rejection then applies). */
export function frEditFor(version: CwrVersion, layout: string, fieldId: string): FieldEdit | undefined {
  const e = byKey.get(`${layout}.${fieldId}`);
  return e && e.versions.includes(version) ? e : undefined;
}

/** Every citation in the table. */
export function fieldEditCitations(): Array<{ where: string; citation: Citation }> {
  const out: Array<{ where: string; citation: Citation }> = [];
  for (const e of FIELD_EDITS) {
    const where = `${e.layout}.${e.fieldId} ${e.edit}`;
    if (e.versions.includes('2.1')) out.push({ where: `${where} (2.1)`, citation: { slug: S21, quote: e.quote } });
    if (e.versions.includes('2.2')) out.push({ where: `${where} (2.2)`, citation: { slug: S22, quote: e.quote22 ?? e.quote } });
  }
  return out;
}
