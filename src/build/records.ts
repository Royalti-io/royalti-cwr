/**
 * Writes one fixed-width CWR 2.2 record from field values, using the engine's own field table for the positions and widths.
 * Internal to the builder.
 */

import { specLayouts } from '../model/specLayout';
import type { FieldDef } from '../model/types';

/** Values for a record's fields, by field id. A field with no value is blank (zeros in a numeric, date or time field). */
export type FieldValues = Record<string, string | number>;

const NUMERIC = new Set<FieldDef['format']>(['N', 'D', 'T']);

/**
 * One record line, without its line ending. Text is upper-cased and cut to the field width; numbers are right-justified and zero-filled.
 * Throws when a field id is not in the layout or a numeric value is not digits that fit: those are mistakes in the builder, not in the sheet.
 * A line shorter than the full layout is kept at `length` characters when given (the group header and trailer are shorter).
 */
export function writeRecord(type: string, values: FieldValues, length?: number): string {
  const layout = specLayouts.getLayout('2.2', type);
  if (!layout) throw new Error(`No CWR 2.2 layout for ${type}.`);
  const chars = new Array<string>(layout.fullLength).fill(' ');
  const put = (start: number, text: string): void => {
    for (let i = 0; i < text.length; i++) chars[start + i] = text[i]!;
  };
  put(0, type);
  for (const f of layout.fields) {
    const width = f.end - f.start;
    const given = values[f.id];
    if (NUMERIC.has(f.format)) {
      const digits = given === undefined ? '' : String(given);
      if (!/^\d*$/.test(digits) || digits.length > width) throw new Error(`${type}.${f.id} takes up to ${width} digits; got "${digits}".`);
      put(f.start, digits.padStart(width, '0'));
    } else if (given !== undefined) {
      const text = String(given).toUpperCase();
      put(f.start, text.length > width ? text.slice(0, width) : text.padEnd(width, ' '));
    }
  }
  for (const id of Object.keys(values)) {
    if (!layout.fields.some(f => f.id === id)) throw new Error(`${type} has no field "${id}".`);
  }
  const line = chars.join('');
  return length === undefined ? line : line.slice(0, length);
}

/** The 19-character prefix values for a detail record. */
export const prefix = (tseq: number, rseq: number): FieldValues => ({ transactionSequence: tseq, recordSequence: rseq });
