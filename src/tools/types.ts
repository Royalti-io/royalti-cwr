import type { RecRef } from '../model/types';

/** One field of one record, before and after a fix tool rewrites it. Lines are 0-based, like `Problem.line`. */
export interface ToolChange {
  /** 0-based physical line index of the record. */
  line: number;
  record: RecRef;
  /** The record type as written in the file (`REV`, `OPU`). */
  recordType: string;
  /** Field id (`workTitle`). */
  fieldId: string;
  /** The specification's name for the field, or the id when the name is unknown. */
  fieldName: string;
  /** Characters the edit rewrites on the line: 0-based, end exclusive. */
  start: number;
  end: number;
  /** The field's characters before the edit and as the edit writes them, padding included. */
  before: string;
  after: string;
}

/** A tool refused the request as a whole. `code` is stable and meant for a program; `message` is for a person. */
export interface ToolError {
  code: string;
  message: string;
}

/** One field of one record: `record` is the index into `doc.records` that `ToolChange.record` carries, and `fieldId` is the field's id. */
export interface ToolFieldRef {
  record: RecRef;
  fieldId: string;
}

/** A list of field refs as record to field ids, for the tools that take `only`. Entries that cannot name a field of a document with `records` records are dropped. */
export function fieldRefIndex(refs: readonly ToolFieldRef[], records: number): Map<RecRef, Set<string>> {
  const index = new Map<RecRef, Set<string>>();
  for (const entry of refs) {
    if (!Number.isInteger(entry.record) || entry.record < 0 || entry.record >= records || typeof entry.fieldId !== 'string') continue;
    let ids = index.get(entry.record);
    if (!ids) index.set(entry.record, (ids = new Set()));
    ids.add(entry.fieldId);
  }
  return index;
}
