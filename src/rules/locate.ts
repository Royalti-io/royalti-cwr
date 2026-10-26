import { allFields, fieldsOf } from '../spec/index';
import { fieldSpan } from '../model/fields';
import type { CwrDoc, CwrVersion, RecRef, RecordLayoutDef } from '../model/types';
import type { RuleCtx, Span } from './types';

export const S21 = 'cisac/cwr-functional-spec-2-1';
export const S22 = 'cisac/cwr-functional-spec-2-2';
export const ERR = 'cisac/cwr-error-messages';
export const CRF = 'cisac/cwr-lookup-tables-crf020';
export const L30 = 'cisac/cwr-3-0-lookup-table-05';

/** Transaction header record types. */
export const HEADER_TYPES = ['AGR', 'NWR', 'REV', 'ISW', 'EXC', 'ACK'] as const;
/** The record types of the NWR family, which carry a work. */
export const WORK_TYPES = ['NWR', 'REV', 'ISW', 'EXC'] as const;
/** Detail record types in either version (OPT, OWT and XRF exist in 2.2 only; in 2.1 they are unknown types). */
export const DETAIL_TYPES = [
  'TER', 'IPA', 'NPA', 'SPU', 'OPU', 'NPN', 'SPT', 'OPT', 'SWR', 'OWR', 'NWN', 'SWT', 'OWT', 'PWR', 'ALT', 'NAT',
  'EWT', 'VER', 'PER', 'NPR', 'REC', 'ORN', 'INS', 'IND', 'COM', 'MSG', 'NET', 'NCT', 'NVT', 'NOW', 'ARI', 'XRF',
] as const;

/** Characters 1 to 3 of a record, shortened for a line under three characters. */
export function typeSpan(ctx: RuleCtx, ref: RecRef = ctx.ref): Span {
  return { start: 0, end: Math.min(3, textOf(ctx.doc, ref).length) };
}

export function textOf(doc: CwrDoc, ref: RecRef): string {
  const rec = doc.records[ref]!;
  return doc.edits.get(rec.line) ?? doc.lines[rec.line]!.text;
}

/** The span of a field on a record's line (even where the line is too short to reach it), or null. */
export function spanOf(doc: CwrDoc, ref: RecRef, fieldId: string): Span | null {
  const s = fieldSpan(doc, ref, fieldId);
  return s ? { start: s.start, end: s.end } : null;
}

const nameCache = new Map<string, Map<string, string>>();

/** The spec's wording for a field id (`Work Title` for `workTitle`), falling back to the id. */
export function fieldName(version: CwrVersion, layout: RecordLayoutDef | null, fieldId: string): string {
  if (!layout) return fieldId;
  const key = `${version}:${layout.name}`;
  let map = nameCache.get(key);
  if (!map) {
    map = new Map();
    for (const f of fieldsOf(version, layout.name)) map.set(f.id, f.name);
    nameCache.set(key, map);
  }
  return map.get(fieldId) ?? fieldId;
}

/**
 * Where a transaction-level problem is drawn: the work title on an NWR-family header (that identifies the
 * work), else the record type on the header.
 */
export function txnAnchor(ctx: RuleCtx): { line: number; start: number; end: number } {
  const txn = ctx.txn!;
  const header = txn.header;
  const rec = ctx.doc.records[header]!;
  const title = rec.type === 'NWR' || rec.type === 'REV' || rec.type === 'ISW' || rec.type === 'EXC' ? spanOf(ctx.doc, header, 'workTitle') : null;
  if (title) return { line: rec.line, start: title.start, end: title.end };
  return { line: rec.line, start: 0, end: Math.min(3, textOf(ctx.doc, header).length) };
}

/** The characters of the field being checked (a field rule's current field). Allocates: use it on the failure path. */
export function valueOf(ctx: RuleCtx): string {
  const f = ctx.field!;
  return ctx.text.slice(f.start, f.end);
}

let new22: Set<string> | undefined;

/**
 * True for a field that exists in CWR 2.2 only (the spec file's `change: new`): the HDR Version, Revision and Software Package, the
 * PWR Publisher Sequence #, the REC and ORN additions, and the XRF record.
 */
export function isNewIn22(layoutName: string, fieldId: string): boolean {
  if (!new22) {
    new22 = new Set();
    for (const f of allFields('2.2')) if (f.change === 'new') new22.add(`${f.record}.${f.id}`);
  }
  return new22.has(`${layoutName}.${fieldId}`);
}

/**
 * The spec's note on ACK transactions in 2.2: [S: cisac/cwr-functional-spec-2-2] True for a record inside an ACK transaction of a 2.2 file.
 */
export function inAck22(ctx: RuleCtx): boolean {
  return ctx.version === '2.2' && ctx.txnHeader >= 0 && ctx.doc.records[ctx.txnHeader]!.type === 'ACK';
}
