import type { CwrDoc, FieldDef, RecRef, RecordLayoutDef } from './types';

/** The text of a line as it stands now: the pending edit if there is one, else the original. */
export function lineText(doc: CwrDoc, lineIndex: number): string {
  return doc.edits.get(lineIndex) ?? doc.lines[lineIndex]!.text;
}

export function recordText(doc: CwrDoc, ref: RecRef): string {
  return lineText(doc, doc.records[ref]!.line);
}

/** The layout for a record in this document's version, or null (unknown type, or none in the provider). */
export function layoutOf(doc: CwrDoc, ref: RecRef): RecordLayoutDef | null {
  const rec = doc.records[ref];
  if (!rec) return null;
  return doc.layouts.getLayout(doc.version.version, rec.type);
}

const byId = new WeakMap<RecordLayoutDef, Map<string, FieldDef>>();

export function findField(layout: RecordLayoutDef, id: string): FieldDef | undefined {
  let map = byId.get(layout);
  if (!map) {
    map = new Map(layout.fields.map(f => [f.id, f]));
    byId.set(layout, map);
  }
  return map.get(id);
}

export interface FieldSpan {
  /** 0-based start, exclusive end: character offsets on the line. */
  start: number;
  end: number;
  format: FieldDef['format'];
  /** The line reaches into the field. False for a field wholly past the end of a short record. */
  present: boolean;
  /** The line covers the whole field. */
  complete: boolean;
}

/** Where a field sits on its line, or null when the record has no such field. */
export function fieldSpan(doc: CwrDoc, ref: RecRef, name: string): FieldSpan | null {
  const layout = layoutOf(doc, ref);
  if (!layout) return null;
  const field = findField(layout, name);
  if (!field) return null;
  const length = recordText(doc, ref).length;
  return {
    start: field.start,
    end: field.end,
    format: field.format,
    present: length > field.start,
    complete: length >= field.end,
  };
}

/**
 * The raw characters of a field, untrimmed: `''` when the record is too short to reach it,
 * `undefined` when the record has no such field.
 */
export function getField(doc: CwrDoc, ref: RecRef, name: string): string | undefined {
  const span = fieldSpan(doc, ref, name);
  if (!span) return undefined;
  return recordText(doc, ref).slice(span.start, span.end);
}

/** Characters past the end of the layout (a record longer than its full length), or null. */
export function overflowSpan(doc: CwrDoc, ref: RecRef): { start: number; end: number } | null {
  const layout = layoutOf(doc, ref);
  if (!layout) return null;
  const max = Math.max(layout.fullLength, ...(layout.alsoValid ?? []));
  const length = recordText(doc, ref).length;
  return length > max ? { start: max, end: length } : null;
}
