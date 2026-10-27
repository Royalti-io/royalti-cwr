import { fieldInfo } from '../spec/info';
import { withArticle } from '../model/article';
import { recordText } from '../model/fields';
import { EditError } from '../model/types';
import type { CwrDoc, FieldDef, RecRef } from '../model/types';
import { ipiBaseCheckDigit, ipiNameCheckDigits } from '../rules/defs/identifiers';
import { forkDoc, setField } from '../write/edit';
import { fieldRefIndex } from './types';
import type { ToolChange, ToolFieldRef } from './types';

/**
 * Clean identifiers: rewrites IPI name numbers, IPI base numbers, ISWCs and ISRCs into the written form of each.
 *
 *  - IPI name number: digits only, zero-padded on the left to 11. Leading zeros are never stripped: the field is 11
 *    characters wide and the zeros are part of the number. Separators (spaces, dashes, dots) are dropped first. The
 *    padding is made ONLY IF the padded number passes its check-digit test; otherwise the field is left as it is and
 *    listed in `needsHuman`, because a number that lost its zeros and also fails the test is more likely a wrong number
 *    than a short one, and padding it would only give a wrong number the right shape. A value that is only zeros
 *    (`0`, `00`, `.0.0.0.`) passes the test, but it is a number that was never entered, so it is not padded either; it
 *    is listed in `needsHuman` with a message that says so. Eleven zeros already in the field are not touched.
 *  - IPI base number: `I-NNNNNNNNN-C`.
 *  - ISWC: `T` and ten digits, dashes, dots and spaces removed, upper case.
 *  - ISRC: twelve letters and digits, dashes removed, upper case.
 *
 * A check digit is never recomputed or changed. It is only tested, and only for the one decision above. A field that
 * already has the written form is not touched, a blank field is not touched, and a value that cannot be brought into the
 * form (letters in an IPI number, a wrong number of digits) is listed in `skipped` and left as it is. Every edit goes
 * through `setField`, so nothing outside the field's own characters changes.
 *
 * `only` limits the run to named fields (a quick fix). Preview and apply are one call path with a flag: for the same
 * input they list the same `changes`, `skipped` and `needsHuman`.
 */

export type IdentifierKind = 'ipiName' | 'ipiBase' | 'iswc' | 'isrc';

export const IDENTIFIER_KINDS: readonly IdentifierKind[] = ['ipiName', 'ipiBase', 'iswc', 'isrc'];

/** One field of one record: `record` is the index into `doc.records` that `IdentifierChange.record` carries, and `fieldId` is the field's id. */
export type IdentifierFieldRef = ToolFieldRef;

export interface CleanIdentifiersOptions {
  /** False (default): a preview only, no document is returned. True: the edits are made on a copy and the copy is returned. */
  apply?: boolean;
  /** Which kinds to clean; default all four. */
  kinds?: readonly IdentifierKind[];
  /**
   * Only look at these fields (a quick fix). Default: every identifier field. Other fields are neither changed nor
   * reported, and an entry that names no identifier field of the document is ignored. An empty list names nothing, so
   * nothing is looked at. Combined with `kinds`, a field must match both.
   */
  only?: readonly IdentifierFieldRef[];
  /** Passed to `setField`. Default `refuse`. The written forms always fit their fields, so this matters only for a layout that is narrower than expected. */
  overflow?: 'refuse' | 'truncate';
}

export interface IdentifierChange extends ToolChange {
  kind: IdentifierKind;
}

export type IdentifierSkipReason = 'no-valid-form' | 'record-too-short' | 'edit-refused';

export interface SkippedIdentifier {
  line: number;
  record: RecRef;
  recordType: string;
  fieldId: string;
  fieldName: string;
  kind: IdentifierKind;
  /** Characters the field covers on the line: 0-based, end exclusive. */
  start: number;
  end: number;
  /** The field's characters with the padding trimmed. */
  value: string;
  reason: IdentifierSkipReason;
  message: string;
}

/**
 * A number the tool would have padded, but whose padded form fails the check-digit test, or a value that is only zeros.
 * The field is left as it is: a person has to look the number up. Today only IPI name numbers land here. For a value of
 * only zeros, `padded` is eleven zeros and `found` and `expected` are both `00`.
 */
export interface NeedsHumanIdentifier {
  line: number;
  record: RecRef;
  recordType: string;
  fieldId: string;
  fieldName: string;
  kind: IdentifierKind;
  /** Characters the field covers on the line: 0-based, end exclusive. */
  start: number;
  end: number;
  /** The field's characters with the padding trimmed, as the file holds them. */
  value: string;
  /** What the tool would have written: the value brought to its written form (eleven digits). It failed the test, or it is eleven zeros. */
  padded: string;
  /** The check digits the padded number ends in, and the ones its first nine digits give. */
  found: string;
  expected: string;
  message: string;
}

export interface CleanIdentifiersResult {
  /** Every field the tool would change (preview) or did change (apply), in file order. */
  changes: IdentifierChange[];
  /** Fields with a value in them that were left alone, with the reason, in file order. */
  skipped: SkippedIdentifier[];
  /** IPI name numbers left alone because padding them would give a number that fails the check-digit test, or because the value is only zeros (no number was entered), in file order. */
  needsHuman: NeedsHumanIdentifier[];
  applied: boolean;
  /** Present only when `apply` was set: a copy of the document with the changes made. The input document is not touched. */
  doc?: CwrDoc;
}

/** Separators people put inside identifiers: spaces, dashes and dots. */
const SEPARATORS = /[\s\-.]/g;

/** An IPI name number in its written form: the field's 11 characters, all digits. Pads without testing the check digits (`cleanIdentifiers` tests them). */
export function normalizeIpiName(raw: string): string | null {
  const digits = raw.replace(SEPARATORS, '');
  if (!/^\d+$/.test(digits) || digits.length > 11) return null;
  return digits.padStart(11, '0');
}

/** An IPI base number as `I-NNNNNNNNN-C`. The `I` may be missing, and the separators may be spaces, dashes, dots or nothing. */
export function normalizeIpiBase(raw: string): string | null {
  const compact = raw.toUpperCase().replace(SEPARATORS, '');
  const body = compact.startsWith('I') ? compact.slice(1) : compact;
  if (!/^\d{10}$/.test(body)) return null;
  return `I-${body.slice(0, 9)}-${body.slice(9)}`;
}

/** An ISWC as `T` and ten digits. */
export function normalizeIswc(raw: string): string | null {
  const compact = raw.toUpperCase().replace(SEPARATORS, '');
  return /^T\d{10}$/.test(compact) ? compact : null;
}

/** An ISRC as twelve upper-case letters and digits. */
export function normalizeIsrc(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/-/g, '');
  return /^[A-Z0-9]{12}$/.test(compact) ? compact : null;
}

const NORMALIZE: Record<IdentifierKind, (raw: string) => string | null> = {
  ipiName: normalizeIpiName,
  ipiBase: normalizeIpiBase,
  iswc: normalizeIswc,
  isrc: normalizeIsrc,
};

/** The written form of each kind, as it stands in a full field. */
const WRITTEN_FORM: Record<IdentifierKind, RegExp> = {
  ipiName: /^\d{11}$/,
  ipiBase: /^I-\d{9}-\d$/,
  iswc: /^T\d{10}$/,
  isrc: /^[A-Z0-9]{12}$/,
};

const KIND_LABEL: Record<IdentifierKind, string> = {
  ipiName: 'IPI name number',
  ipiBase: 'IPI base number',
  iswc: 'ISWC',
  isrc: 'ISRC',
};

/** What `identifierCheck` found out about one value. */
export interface IdentifierCheck {
  kind: IdentifierKind;
  /** True when the value is in the written form of its kind and, for the two IPI numbers, its check digits are right. */
  ok: boolean;
  /**
   * True when the check digits were tested: IPI name numbers and IPI base numbers in their written form. False for ISWCs
   * and ISRCs (the engine has no check-digit test for them, so `ok` says only that the written form is right) and for
   * a value whose written form is wrong, which cannot be tested.
   */
  checkDigitTested: boolean;
  /** Why `ok` is false: nothing in the field, not in the written form, or the check digits do not match. */
  reason?: 'blank' | 'wrong-shape' | 'check-digit';
  /** With `reason: 'check-digit'`: the check digits the value ends in (two digits for a name number, one for a base number) and the ones its other digits give. */
  found?: string;
  expected?: string;
}

/**
 * Tests one identifier as it would stand in the file: is it in the written form of its kind, and, for an IPI name number
 * or an IPI base number, do its check digits match the ones its other digits give? The value is not normalised (use
 * `normalizeIpiName` and friends first); spaces around it, the field's padding, are ignored. Pure: same input, same answer.
 *
 * An IPI name number of eleven zeros passes (its check digits are 00); the checker treats such a value as not entered.
 * The check-digit tests are the secondary-source ones the checker's `ID-IPI-CHK` and `ID-IPIB-CHK` rules use.
 */
export function identifierCheck(kind: IdentifierKind, value: string): IdentifierCheck {
  const v = value.trim();
  if (v === '') return { kind, ok: false, checkDigitTested: false, reason: 'blank' };
  if (!WRITTEN_FORM[kind].test(v)) return { kind, ok: false, checkDigitTested: false, reason: 'wrong-shape' };
  if (kind === 'ipiName' || kind === 'ipiBase') {
    const found = kind === 'ipiName' ? v.slice(9) : v.slice(12);
    const expected = kind === 'ipiName' ? ipiNameCheckDigits(v) : String(ipiBaseCheckDigit(v.slice(2, 11)));
    if (found === expected) return { kind, ok: true, checkDigitTested: true };
    return { kind, ok: false, checkDigitTested: true, reason: 'check-digit', found, expected };
  }
  return { kind, ok: true, checkDigitTested: false };
}

/** Which kind of identifier a field id holds, or null. Matches the id patterns the identifier checks use. */
export function identifierKindOf(fieldId: string): IdentifierKind | null {
  if (/IpiNameNumber$/.test(fieldId)) return 'ipiName';
  if (fieldId === 'ipiBaseNumber' || /IpiBaseNumber$/.test(fieldId)) return 'ipiBase';
  if (/^iswc/.test(fieldId)) return 'iswc';
  if (fieldId === 'isrc') return 'isrc';
  return null;
}

interface Target {
  field: FieldDef;
  kind: IdentifierKind;
}

const isBlank = (s: string): boolean => /^ *$/.test(s);

/** File order: by line, then by position on the line. Records and layouts are already in this order; the sort keeps edit refusals in it too. */
const byPosition = (a: { line: number; start: number }, b: { line: number; start: number }): number => a.line - b.line || a.start - b.start;

export function cleanIdentifiers(doc: CwrDoc, options: CleanIdentifiersOptions = {}): CleanIdentifiersResult {
  const kinds = new Set<IdentifierKind>(options.kinds ?? IDENTIFIER_KINDS);
  const only = options.only ? fieldRefIndex(options.only, doc.records.length) : null;
  const version = doc.version.version;
  const targetsByType = new Map<string, Target[]>();
  const targetsOf = (type: string): Target[] => {
    let list = targetsByType.get(type);
    if (!list) {
      list = [];
      const layout = doc.layouts.getLayout(version, type);
      if (layout) {
        for (const field of layout.fields) {
          const kind = identifierKindOf(field.id);
          if (kind !== null && kinds.has(kind)) list.push({ field, kind });
        }
      }
      targetsByType.set(type, list);
    }
    return list;
  };
  const nameOf = (type: string, id: string): string => fieldInfo(version, type, id)?.name ?? id;

  let changes: IdentifierChange[] = [];
  const skipped: SkippedIdentifier[] = [];
  const needsHuman: NeedsHumanIdentifier[] = [];

  // With `only`, visit just the named records, in file order; otherwise every record.
  const refs = only ? [...only.keys()].sort((a, b) => a - b) : null;
  const visits = refs ? refs.length : doc.records.length;
  for (let i = 0; i < visits; i++) {
    const ref = refs ? refs[i]! : i;
    const rec = doc.records[ref]!;
    const targets = targetsOf(rec.type);
    if (targets.length === 0) continue;
    const named = only?.get(ref);
    const text = recordText(doc, ref);
    for (const { field, kind } of targets) {
      if (named && !named.has(field.id)) continue;
      if (text.length <= field.start) continue; // the record does not reach the field
      const raw = text.slice(field.start, field.end);
      if (isBlank(raw) || WRITTEN_FORM[kind].test(raw)) continue;
      const where = { line: rec.line, record: ref, recordType: rec.type, fieldId: field.id, fieldName: nameOf(rec.type, field.id), kind, start: field.start, end: field.end };
      const skip = (reason: IdentifierSkipReason, message: string): void => {
        skipped.push({ ...where, value: raw.trim(), reason, message });
      };
      if (text.length < field.end) {
        skip('record-too-short', `The record ends inside this field, so it is left alone.`);
        continue;
      }
      const next = NORMALIZE[kind](raw);
      if (next === null) {
        skip('no-valid-form', `"${raw.trim()}" cannot be turned into ${withArticle(KIND_LABEL[kind])} in its written form without guessing.`);
        continue;
      }
      if (kind === 'ipiName') {
        // Padding is only made when the padded number passes its check digits, and never to give eleven zeros: a value
        // of only zeros passes the test, but no number was entered (the checker reads eleven zeros the same way).
        if (/^0+$/.test(next)) {
          needsHuman.push({
            ...where,
            value: raw.trim(),
            padded: next,
            found: next.slice(9),
            expected: ipiNameCheckDigits(next),
            message: `"${raw.trim()}" is all zeros, so no IPI number was entered, and it is left as it is.`,
          });
          continue;
        }
        const test = identifierCheck(kind, next);
        if (!test.ok) {
          const found = test.found ?? '';
          const expected = test.expected ?? '';
          needsHuman.push({
            ...where,
            value: raw.trim(),
            padded: next,
            found,
            expected,
            message: `"${raw.trim()}" would become ${next}, which ends in check digits ${found} where its first nine digits give ${expected}, so it is left as it is.`,
          });
          continue;
        }
      }
      changes.push({
        kind,
        line: rec.line,
        record: ref,
        recordType: rec.type,
        fieldId: field.id,
        fieldName: where.fieldName,
        start: field.start,
        end: field.end,
        before: raw,
        after: next.padEnd(field.end - field.start, ' '),
      });
    }
  }

  skipped.sort(byPosition);
  if (!options.apply) return { changes, skipped, needsHuman, applied: false };

  const out = forkDoc(doc);
  const done: IdentifierChange[] = [];
  for (const change of changes) {
    try {
      setField(out, change.record, change.fieldId, change.after, { overflow: options.overflow ?? 'refuse' });
      done.push(change);
    } catch (e) {
      if (!(e instanceof EditError)) throw e;
      skipped.push({
        line: change.line,
        record: change.record,
        recordType: change.recordType,
        fieldId: change.fieldId,
        fieldName: change.fieldName,
        kind: change.kind,
        start: change.start,
        end: change.end,
        value: change.before.trim(),
        reason: 'edit-refused',
        message: e.message,
      });
    }
  }
  skipped.sort(byPosition);
  changes = done;
  return { changes, skipped, needsHuman, applied: true, doc: out };
}
