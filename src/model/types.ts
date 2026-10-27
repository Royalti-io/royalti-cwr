/**
 * The lossless CWR model. See docs/MODEL.md for the choices made where the format was open.
 *
 * Lossless means `serialize(parse(bytes))` equals `bytes` for every input, garbage included.
 * Field values are never copied out: `getField(doc, ref, name)` slices the line text on demand.
 */

import type { RunOptions } from './progress';

export type CwrVersion = '2.1' | '2.2';

/** Spec legend (§2.1.1): A alpha, N numeric, D date, T time, B boolean, F flag, L lookup. */
export type FieldFormat = 'A' | 'N' | 'D' | 'T' | 'B' | 'F' | 'L';

/** One field of a record layout. `start` is 0-based, `end` exclusive (so `end - start` is the width). */
export interface FieldDef {
  /** The generated spec's id (`prOwnershipShare`, `writerLastName`), unique within a layout. */
  id: string;
  start: number;
  end: number;
  format: FieldFormat;
  /** Mandatory, Conditional or Optional, as printed in the spec. */
  req: 'M' | 'C' | 'O';
  /** How far the spec row can be trusted; `aggregate` rows never reach a layout. */
  status: 'ok' | 'ambiguous' | 'unsourced';
  /** Lookup table id, where the spec names one. */
  lookup?: string;
}

export interface RecordLayoutDef {
  /** Layout key. Aliases share one: OPU, OWR, OPT, OWT, REV... resolve to SPU, SWR, SPT, SWT, NWR. */
  name: string;
  /** Full length in characters for the version asked. */
  fullLength: number;
  /** Other lengths that are legitimate and not reported as short (GRH 26, GRT 24). */
  alsoValid?: readonly number[];
  fields: readonly FieldDef[];
}

/**
 * What the parser needs from the field specification. `specLayout.ts` implements it over the
 * generated `src/spec`, for every record type of both versions; tests pass their own to exercise
 * the "valid type, no layout" path.
 */
export interface LayoutProvider {
  /** The field layout of a record type for a version, or null when there is none (yet). */
  getLayout(version: CwrVersion, recordType: string): RecordLayoutDef | null;
  /** True when the code is a valid record type for the version (even if it has no layout here). */
  isRecordType(version: CwrVersion, recordType: string): boolean;
}

export type Encoding = 'ascii' | 'latin1' | 'utf8';
export type Eol = '' | '\n' | '\r\n' | '\r';

export interface Line {
  index: number;
  /** First byte of the line. */
  byteStart: number;
  /** One past the last byte of the line, its EOL included (the lines tile the file after the BOM). */
  byteEnd: number;
  eol: Eol;
  /** Decoded text without the EOL. Never altered; edits live in `CwrDoc.edits`. */
  text: string;
}

export type RecStatus = 'ok' | 'unknown-type' | 'short' | 'long' | 'bad-prefix';

export interface Rec {
  /** Index into `CwrDoc.lines`. */
  line: number;
  /** First three characters, verbatim (may be `'   '`, `'ALX'` or shorter than three). */
  type: string;
  /** Layout name, or null when the type is unknown for the version or has no layout provider entry. */
  layout: string | null;
  /** Length in characters at parse time. */
  length: number;
  /** Transaction and record sequence from the 19-character prefix, when numeric. */
  tseq?: number;
  rseq?: number;
  status: RecStatus;
}

/** Index into `CwrDoc.records`. */
export type RecRef = number;

export interface WorkView {
  chains: { seq: number | null; publishers: RecRef[]; territories: Map<RecRef, RecRef[]> }[];
  writers: { rec: RecRef; territories: RecRef[]; pwr: RecRef[] }[];
  /** ALT, NAT, EWT, VER, NET, NCT, NVT, NOW. */
  titles: RecRef[];
  /** Everything else in the transaction: PER, REC, ORN, XRF, MSG, unknown records, unattached SPT... */
  others: RecRef[];
}

export interface Txn {
  /** NWR, REV, ISW, EXC, AGR or ACK. */
  header: RecRef;
  /** Every record after the header, up to the next top-level header or the group's end. */
  records: RecRef[];
  /** Built lazily by `getWorkView`. */
  work?: WorkView;
  /** ACK only: the NWR/REV/ISW/EXC/AGR it carries (header and its records, as slices of `records`). */
  inner?: Txn[];
}

export interface Group {
  grh: RecRef;
  grt?: RecRef;
  /** Transaction type from the GRH (characters 4-6), verbatim. */
  type: string;
  transactions: Txn[];
}

export interface FileStructure {
  hdr?: RecRef;
  trl?: RecRef;
  groups: Group[];
}

export interface VersionInfo {
  version: CwrVersion;
  /** Raw GRH version field of the first GRH (`02.10`), when there is one. */
  grh: string | null;
  /** Raw HDR version field (`2.2`), when the HDR is long enough to carry one. */
  hdr: string | null;
  source: 'grh' | 'hdr' | 'option' | 'default';
}

export interface CwrDoc {
  /** The input, kept by reference and never mutated. */
  bytes: Uint8Array;
  encoding: Encoding;
  bom: boolean;
  lines: Line[];
  /** One per non-blank line, in file order. */
  records: Rec[];
  /** Line index to record index, or -1 for a blank line. */
  recordOfLine: Int32Array;
  version: VersionInfo;
  file: FileStructure;
  /** Records outside any group or transaction (and extra HDR/TRL), displayed inline. */
  orphans: RecRef[];
  /** Line index to replacement text. Only the fix tools write here. */
  edits: Map<number, string>;
  layouts: LayoutProvider;
}

export interface ParseOptions extends RunOptions {
  layouts?: LayoutProvider;
  /** Force the version instead of detecting it (the "re-check as 2.x" button). */
  version?: CwrVersion;
  /** Used only to refuse `.V30` / `.V31` names. */
  fileName?: string;
  /** Default 50 MB. */
  maxBytes?: number;
}

export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/** The one content-driven throw: a CWR 3.x file. Nothing is parsed. */
export class UnsupportedVersionError extends Error {
  readonly code = 'UNSUPPORTED_VERSION';
  readonly detected: string;
  readonly evidence: 'grh' | 'hdr' | 'fileName';
  constructor(detected: string, evidence: 'grh' | 'hdr' | 'fileName') {
    super('CWR 3.x is a different format; this tool checks 2.1 and 2.2 only.');
    this.name = 'UnsupportedVersionError';
    this.detected = detected;
    this.evidence = evidence;
  }
}

export class InputTooLargeError extends Error {
  readonly code = 'INPUT_TOO_LARGE';
  readonly size: number;
  readonly max: number;
  constructor(size: number, max: number) {
    super(`Input is ${size} bytes; the limit is ${max}.`);
    this.name = 'InputTooLargeError';
    this.size = size;
    this.max = max;
  }
}

/** A caller error in `setField` (unknown field, bad value, overflow). Never raised by `parse`. */
export class EditError extends Error {
  readonly code: 'unknown-record' | 'unknown-field' | 'invalid-value' | 'overflow' | 'not-encodable' | 'uppercase-script';
  constructor(code: EditError['code'], message: string) {
    super(message);
    this.name = 'EditError';
    this.code = code;
  }
}
