import { FIELD_REFS } from '../model/fieldRefs';
import { findField, layoutOf, recordText } from '../model/fields';
import { encodeText } from '../model/text';
import { EditError } from '../model/types';
import type { CwrDoc, FieldDef, RecRef } from '../model/types';

export interface SetFieldOptions {
  /** Longer than the field: refuse (default) or cut to fit. Numeric fields are always refused. */
  overflow?: 'refuse' | 'truncate';
  /** Upper-case text fields before writing. */
  uppercase?: boolean;
}

export interface SetFieldResult {
  ref: RecRef;
  line: number;
  field: string;
  /** Character span rewritten on the line (0-based, end exclusive). */
  start: number;
  end: number;
  before: string;
  after: string;
  changed: boolean;
  truncated: boolean;
  /** Line length before and after: differs only when a short record had to be padded up to the field. */
  lengthBefore: number;
  lengthAfter: number;
}

const NUMERIC = new Set<FieldDef['format']>(['N', 'D', 'T']);

/** Fixed-width padding by field type: digits right-justified and zero-filled, text left-justified and space-padded. */
function pad(field: FieldDef, value: string, options: SetFieldOptions): { text: string; truncated: boolean } {
  const width = field.end - field.start;
  if (NUMERIC.has(field.format)) {
    if (!/^[0-9]*$/.test(value)) throw new EditError('invalid-value', `${field.id} takes digits only; got "${value}".`);
    let digits = value;
    if (digits.length > width) digits = digits.replace(/^0+/, '');
    if (digits.length > width) {
      throw new EditError('overflow', `${field.id} is ${width} wide; "${value}" does not fit.`);
    }
    return { text: digits.padStart(width, '0'), truncated: false };
  }
  if (/[\r\n]/.test(value)) throw new EditError('invalid-value', `${field.id} cannot contain a line break.`);
  let text = options.uppercase ? value.toUpperCase() : value;
  let truncated = false;
  if (text.length > width) {
    if (options.overflow !== 'truncate') {
      throw new EditError('overflow', `${field.id} is ${width} wide; "${value}" is ${text.length}.`);
    }
    text = text.slice(0, width);
    truncated = true;
  }
  return { text: text.padEnd(width, ' '), truncated };
}

/**
 * Rewrites one field's characters and nothing else. Mutates `doc.edits` (use `forkDoc` first to keep
 * the previous state for undo). A record shorter than the field is padded with blanks up to it, which
 * is the only way the line length changes. Throws `EditError` on a caller mistake.
 */
export function setField(
  doc: CwrDoc,
  ref: RecRef,
  fieldName: string,
  value: string,
  options: SetFieldOptions = {},
): SetFieldResult {
  const rec = doc.records[ref];
  if (!rec) throw new EditError('unknown-record', `No record ${ref}.`);
  const layout = layoutOf(doc, ref);
  const field = layout ? findField(layout, fieldName) : undefined;
  if (!field) throw new EditError('unknown-field', `${rec.type} has no field "${fieldName}".`);

  const { text: padded, truncated } = pad(field, value, options);
  if (!encodeText(padded, doc.encoding)) {
    throw new EditError('not-encodable', `"${value}" cannot be written in a ${doc.encoding} file.`);
  }

  const current = recordText(doc, ref);
  const head = current.length < field.start ? current.padEnd(field.start, ' ') : current.slice(0, field.start);
  const next = head + padded + current.slice(field.end);
  const original = doc.lines[rec.line]!.text;
  if (next === original) doc.edits.delete(rec.line);
  else doc.edits.set(rec.line, next);

  return {
    ref,
    line: rec.line,
    field: fieldName,
    start: field.start,
    end: field.end,
    before: current.slice(field.start, field.end),
    after: padded,
    changed: next !== current,
    truncated,
    lengthBefore: current.length,
    lengthAfter: next.length,
  };
}

/** A copy that shares the immutable parts and owns its edits, so a tool can be applied and undone. */
export function forkDoc(doc: CwrDoc): CwrDoc {
  return { ...doc, edits: new Map(doc.edits) };
}

export interface RenumberChange {
  ref: RecRef;
  field: string;
  before: string;
  after: string;
}

/**
 * Recomputes the GRT and TRL counts from the structure:
 * GRT transaction count = transactions in the group, record count = physical records from the GRH to
 * the GRT inclusive; TRL group count = groups, transaction count = transactions in the file, record
 * count = physical records from the HDR to the TRL inclusive. A missing GRT or TRL is not created.
 * ACK-carried transactions belong to their ACK's transaction and are not counted twice.
 */
export function renumber(doc: CwrDoc): RenumberChange[] {
  const changes: RenumberChange[] = [];
  const write = (ref: RecRef, field: string, count: number): void => {
    const r = setField(doc, ref, field, String(count));
    if (r.changed) changes.push({ ref, field, before: r.before, after: r.after });
  };

  let transactions = 0;
  for (const group of doc.file.groups) {
    transactions += group.transactions.length;
    if (group.grt !== undefined) {
      write(group.grt, FIELD_REFS.grtTransactionCount.id, group.transactions.length);
      write(group.grt, FIELD_REFS.grtRecordCount.id, group.grt - group.grh + 1);
    }
  }
  const trl = doc.file.trl;
  if (trl !== undefined) {
    write(trl, FIELD_REFS.trlGroupCount.id, doc.file.groups.length);
    write(trl, FIELD_REFS.trlTransactionCount.id, transactions);
    write(trl, FIELD_REFS.trlRecordCount.id, trl - (doc.file.hdr ?? 0) + 1);
  }
  return changes;
}
