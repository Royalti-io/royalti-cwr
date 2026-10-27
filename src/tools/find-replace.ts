import { fieldInfo } from '../spec/info';
import { recordText } from '../model/fields';
import { EditError } from '../model/types';
import type { CwrDoc, CwrVersion, FieldDef, RecRef, RecordLayoutDef } from '../model/types';
import { specLayouts } from '../model/specLayout';
import { layoutKeys } from '../spec/index';
import { forkDoc, setField } from '../write/edit';
import { fieldRefIndex } from './types';
import type { ToolChange, ToolError, ToolFieldRef } from './types';

/**
 * Find and replace in chosen text fields: titles, names and the other free-text fields.
 *
 * The tool is deliberately narrow. It works only on fields on an allow list (`findReplaceFields`). Asking for a
 * prefix, numeric, share, code or identifier field returns an error that names the field and the reason; nothing is
 * skipped quietly. The call previews by default. With `apply` it returns a new document, but only when every change
 * can be written: if one change would overflow its field, would blank a mandatory field or cannot be encoded, nothing
 * is applied, the document is not returned, and `refused` says which changes stopped it. The input is never touched.
 *
 * `uppercase` writes the whole field in upper case, and the check for "nothing changed" is made on that result. A field whose upper
 * case would turn a letter into one of another script (the micro sign into a Greek capital mu) is refused as `uppercase-script`. `only`
 * limits the call to named fields, as it does for `cleanIdentifiers`, so a one-field fix is one call whose preview and apply
 * list the same change.
 */

export type FindReplaceMode = 'whole' | 'substring';

export interface FindReplaceOptions {
  /** Field ids (`workTitle`), optionally with the record type in front (`SWR.writerLastName`). */
  fields: readonly string[];
  find: string;
  replace: string;
  /** `whole`: the field, ignoring the padding around it, equals `find`, and `replace` becomes the field. `substring`: every occurrence of `find` inside the field is replaced. */
  mode: FindReplaceMode;
  /** Default false: upper and lower case are treated alike when looking for `find`. */
  caseSensitive?: boolean;
  /** Default false: preview only. */
  apply?: boolean;
  /**
   * Write the whole field in upper case, not only the replacement: the text around a replaced part is upper-cased too, so
   * `Even Lantern 00005` with `lantern` replaced by `lamp` becomes `EVEN LAMP 00005`. A field that matches `find` is changed
   * when upper case makes it differ from what it holds, even if the replacement is the text already there. Default false: the
   * field is written as the replacement leaves it.
   */
  uppercase?: boolean;
  /**
   * Only look at these fields (a quick fix), as `cleanIdentifiers` takes them: `record` is the `RecRef` a change carries (the
   * index into `doc.records`), not a line number. Other fields are neither changed nor reported, and an entry that names no
   * field this call searches (a record out of range, a field that is not in `fields`, a field the record does not have) is
   * ignored. An empty list names nothing, so nothing is looked at. Default: every field in `fields`. The request itself
   * (`fields`, `find`, `replace`) is still checked, and preview and apply list the same changes.
   */
  only?: readonly FindReplaceFieldRef[];
}

/** One field of one record, as `FindReplaceOptions.only` names it. The same shape `cleanIdentifiers` takes. */
export type FindReplaceFieldRef = ToolFieldRef;

/** Why a field cannot be a target. */
export type RefusedFieldKind = 'prefix' | 'numeric' | 'share' | 'code' | 'identifier' | 'unsupported';

export interface RefusedField {
  /** The field as the caller wrote it. */
  field: string;
  kind: RefusedFieldKind;
  message: string;
}

export type FindReplaceErrorCode = 'no-fields' | 'empty-find' | 'unknown-field' | 'field-refused' | 'changes-refused';

export interface FindReplaceError extends ToolError {
  code: FindReplaceErrorCode;
  /** Set for `field-refused` and `unknown-field`. */
  fields?: RefusedField[];
}

export type RefusedChangeReason = 'overflow' | 'invalid-value' | 'not-encodable' | 'uppercase-script' | 'would-blank-mandatory' | 'record-too-short';

export interface RefusedChange extends ToolChange {
  reason: RefusedChangeReason;
  message: string;
}

export interface FindReplaceResult {
  /** False when the request itself was refused (see `error`), or when `apply` was set and a change was refused. */
  ok: boolean;
  error?: FindReplaceError;
  /** Every change that can be written, in file order. With `apply` it is what was written. */
  changes: ToolChange[];
  /** Changes the tool will not write. */
  refused: RefusedChange[];
  applied: boolean;
  /** Present only when the changes were applied. */
  doc?: CwrDoc;
}

// ---- which fields may be edited -----------------------------------------------------------------------------------

/** Free-text fields: titles, personal and company names, labels and the like. Everything else is refused. */
const TEXT_FIELDS: ReadonlySet<string> = new Set([
  'workTitle',
  'alternateTitle',
  'title',
  'entireWorkTitle',
  'originalWorkTitle',
  'creationTitle',
  'productionTitle',
  'episodeTitle',
  'recordingTitle',
  'versionTitle',
  'firstAlbumTitle',
  'publisherName',
  'writerLastName',
  'writerFirstName',
  'writerName',
  'writer1LastName',
  'writer1FirstName',
  'writer2LastName',
  'writer2FirstName',
  'performingArtistLastName',
  'performingArtistFirstName',
  'performingArtistName',
  'interestedPartyLastName',
  'interestedPartyWriterFirstName',
  'interestedPartyName',
  'contactName',
  'displayArtist',
  'recordLabel',
  'firstAlbumLabel',
  'library',
  'source',
]);

const PREFIX_IDS: ReadonlySet<string> = new Set(['recordType', 'transactionSequence', 'recordSequence']);
const SHARE_ID = /^(?:pr|mr|sr)(?:Ownership|Collection)?Share$/;
const IDENTIFIER_ID =
  /IpiNameNumber$|IpiBaseNumber$|^ipiBaseNumber$|^iswc|^isrc$|^ean$|IpNumber$|^interestedPartyNumber$|AgreementNumber$|AgreementCode$|^submitterWorkNumber$|CreationNumber$|^workNumber$|^identifier$|^taxIdNumber$|^personalNumber$|^copyrightNumber$|^catalogueNumber$|^opusNumber$|^eidr|^vIsan|^audioVisualNumber$|^submitterRecordingIdentifier$|^cdIdentifier$|^productionNumber$|^episodeNumber$|^contactId$|^senderId$|^firstReleaseCatalogNumber$|^validationNumber$/;

const REASON: Record<RefusedFieldKind, string> = {
  prefix: 'it is part of a record prefix (record type or sequence number)',
  numeric: 'it is a numeric, date or time field',
  share: 'it is a share field',
  code: 'it holds a code or a flag from a fixed list',
  identifier: 'it holds an identifier or a reference number',
  unsupported: 'it is not on the list of text fields this tool may change',
};

/** 'text' for a field the tool may change, otherwise the reason it may not. */
export function classifyField(field: FieldDef): 'text' | RefusedFieldKind {
  const id = field.id;
  if (PREFIX_IDS.has(id)) return 'prefix';
  if (SHARE_ID.test(id)) return 'share';
  if (IDENTIFIER_ID.test(id)) return 'identifier';
  if (field.format === 'N' || field.format === 'D' || field.format === 'T') return 'numeric';
  if (field.lookup !== undefined || field.format === 'L' || field.format === 'B' || field.format === 'F') return 'code';
  return TEXT_FIELDS.has(id) ? 'text' : 'unsupported';
}

/** The fields the tool may change in one version: id, name, and the record types (layout keys) that carry it. */
export function findReplaceFields(version: CwrVersion): Array<{ id: string; name: string; records: string[] }> {
  const out = new Map<string, { id: string; name: string; records: string[] }>();
  for (const type of layoutKeys(version)) {
    const layout = specLayouts.getLayout(version, type);
    if (!layout) continue;
    for (const field of layout.fields) {
      if (classifyField(field) !== 'text') continue;
      const entry = out.get(field.id) ?? { id: field.id, name: fieldInfo(version, layout.name, field.id)?.name ?? field.id, records: [] };
      if (!entry.records.includes(layout.name)) entry.records.push(layout.name);
      out.set(field.id, entry);
    }
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---- the tool -----------------------------------------------------------------------------------------------------

interface Target {
  /** The spec as the caller wrote it. */
  spec: string;
  /** Layout keys the target is limited to; empty means every record that has the field. */
  layoutName: string | null;
  fieldId: string;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function refuse(code: FindReplaceErrorCode, message: string, fields?: RefusedField[]): FindReplaceResult {
  const error: FindReplaceError = fields ? { code, message, fields } : { code, message };
  return { ok: false, error, changes: [], refused: [], applied: false };
}

export function findReplace(doc: CwrDoc, options: FindReplaceOptions): FindReplaceResult {
  const { fields, find, replace, mode } = options;
  const version = doc.version.version;
  if (fields.length === 0) return refuse('no-fields', 'Choose at least one field to search.');
  if (find === '') return refuse('empty-find', 'The text to find is empty.');
  // In whole mode the padding around the field is ignored, so blank text would match every empty field and fill it in.
  if (mode === 'whole' && find.trim() === '') return refuse('empty-find', 'The text to find is blank; in whole-field mode that would match every empty field.');
  if (/[\r\n]/.test(replace)) return refuse('changes-refused', 'The replacement cannot contain a line break.');

  // Scope: every requested field must exist and must be a text field in every record that has it.
  const targets: Target[] = [];
  const bad: RefusedField[] = [];
  const unknown: RefusedField[] = [];
  for (const spec of fields) {
    const dot = spec.indexOf('.');
    const qualifier = dot >= 0 ? spec.slice(0, dot) : null;
    const fieldId = dot >= 0 ? spec.slice(dot + 1) : spec;
    let layouts: RecordLayoutDef[];
    if (qualifier !== null) {
      const layout = doc.layouts.getLayout(version, qualifier);
      layouts = layout ? [layout] : [];
    } else {
      layouts = layoutKeys(version).map(k => doc.layouts.getLayout(version, k)).filter((l): l is RecordLayoutDef => l !== null);
    }
    const carrying = layouts.filter(l => l.fields.some(f => f.id === fieldId));
    if (carrying.length === 0) {
      unknown.push({ field: spec, kind: 'unsupported', message: `No record of a ${version} file has a field "${spec}".` });
      continue;
    }
    let refusedKind: RefusedFieldKind | null = null;
    for (const layout of carrying) {
      const kind = classifyField(layout.fields.find(f => f.id === fieldId)!);
      if (kind !== 'text') {
        refusedKind = kind;
        break;
      }
    }
    if (refusedKind !== null) {
      bad.push({ field: spec, kind: refusedKind, message: `"${spec}" cannot be searched and replaced: ${REASON[refusedKind]}.` });
      continue;
    }
    targets.push({ spec, layoutName: qualifier === null ? null : carrying[0]!.name, fieldId });
  }
  if (unknown.length > 0) return refuse('unknown-field', unknown.map(u => u.message).join(' '), unknown);
  if (bad.length > 0) return refuse('field-refused', bad.map(b => b.message).join(' '), bad);

  const flags = options.caseSensitive === true ? 'g' : 'gi';
  const pattern = new RegExp(mode === 'whole' ? `^${escapeRegExp(find.trim())}$` : escapeRegExp(find), flags);
  const hasMatch = (value: string): boolean => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  };

  const only = options.only ? fieldRefIndex(options.only, doc.records.length) : null;
  const uppercase = options.uppercase === true;
  const scratch = forkDoc(doc);
  const changes: ToolChange[] = [];
  const refused: RefusedChange[] = [];
  const fieldsByType = new Map<string, FieldDef[]>();
  // A field is edited once however many specs name it (`workTitle` and `NWR.workTitle`, or the same spec twice).
  const fieldsOf = (type: string): FieldDef[] => {
    let list = fieldsByType.get(type);
    if (!list) {
      list = [];
      const layout = doc.layouts.getLayout(version, type);
      if (layout) {
        for (const target of targets) {
          if (target.layoutName !== null && target.layoutName !== layout.name) continue;
          const field = layout.fields.find(f => f.id === target.fieldId);
          if (field && !list.includes(field)) list.push(field);
        }
      }
      fieldsByType.set(type, list);
    }
    return list;
  };

  // With `only`, visit just the named records, in file order; otherwise every record.
  const refs = only ? [...only.keys()].sort((a, b) => a - b) : null;
  const visits = refs ? refs.length : doc.records.length;
  for (let i = 0; i < visits; i++) {
    const ref: RecRef = refs ? refs[i]! : i;
    const rec = doc.records[ref]!;
    const list = fieldsOf(rec.type);
    if (list.length === 0) continue;
    const named = only?.get(ref);
    for (const field of list) {
      if (named && !named.has(field.id)) continue;
      const text = recordText(scratch, ref);
      if (text.length <= field.start) continue;
      const current = text.slice(field.start, field.end);
      const value = mode === 'whole' ? current.trim() : current.replace(/ +$/, '');
      if (!hasMatch(value)) continue;
      const replaced = mode === 'whole' ? replace : value.replace(pattern, () => replace);
      // Upper case is part of the result, so it is applied before asking whether anything changed: a field that matches and
      // only differs in case is a change.
      const next = uppercase ? replaced.toUpperCase() : replaced;
      if (next === value) continue;
      const base: ToolChange = {
        line: rec.line,
        record: ref,
        recordType: rec.type,
        fieldId: field.id,
        fieldName: fieldInfo(version, rec.type, field.id)?.name ?? field.id,
        start: field.start,
        end: field.end,
        before: current,
        after: '',
      };
      const stop = (reason: RefusedChangeReason, message: string): void => {
        refused.push({ ...base, after: next, reason, message });
      };
      if (text.length < field.end) {
        stop('record-too-short', 'The record ends inside this field, so it is left alone.');
        continue;
      }
      if (next.trim() === '' && field.req === 'M') {
        stop('would-blank-mandatory', `${base.fieldName} is mandatory and the replacement would leave it empty.`);
        continue;
      }
      try {
        const r = setField(scratch, ref, field.id, replaced, { uppercase });
        if (r.after !== current) changes.push({ ...base, after: r.after });
      } catch (e) {
        if (!(e instanceof EditError)) throw e;
        const reason: RefusedChangeReason = e.code === 'overflow' || e.code === 'not-encodable' || e.code === 'uppercase-script' ? e.code : 'invalid-value';
        stop(reason, reason === 'overflow' ? `${base.fieldName} is ${field.end - field.start} characters wide; the result is ${next.length}.` : e.message);
      }
    }
  }

  const sortKey = (c: ToolChange): number => c.line * 1000000 + c.start;
  changes.sort((a, b) => sortKey(a) - sortKey(b));
  refused.sort((a, b) => sortKey(a) - sortKey(b));

  if (!options.apply) return { ok: true, changes, refused, applied: false };
  if (refused.length > 0) {
    return {
      ok: false,
      error: { code: 'changes-refused', message: `${refused.length} change${refused.length === 1 ? '' : 's'} cannot be written, so nothing was applied.` },
      changes,
      refused,
      applied: false,
    };
  }
  return { ok: true, changes, refused, applied: true, doc: scratch };
}
