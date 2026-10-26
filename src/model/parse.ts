import { buildStructure, CONTROL_TYPES } from './group';
import { drain, throwIfCancelled } from './progress';
import type { Progress, RunOptions } from './progress';
import { specLayouts } from './specLayout';
import { decodeSingleByte, decodeUtf8, detectEncoding } from './text';
import {
  CwrDoc,
  CwrVersion,
  DEFAULT_MAX_BYTES,
  InputTooLargeError,
  Line,
  LayoutProvider,
  ParseOptions,
  Rec,
  RecordLayoutDef,
  UnsupportedVersionError,
  VersionInfo,
} from './types';

const CR = 13;
const LF = 10;

/** The generated field specification; callers may pass their own through `options.layouts`. */
export const DEFAULT_LAYOUTS: LayoutProvider = specLayouts;

/** Lines between two progress reports (and two cancel checks). */
const STEP = 4096;

/** Reports one step: checks the signal, calls the callback, checks again, and returns the value the generator yields. */
function progressOf(stage: string, done: number, total: number, from: number, to: number, options: RunOptions): Progress {
  throwIfCancelled(options.signal);
  const p: Progress = { task: 'parse', stage, done, total, fraction: total > 0 ? from + (to - from) * Math.min(1, done / total) : to };
  options.onProgress?.(p);
  throwIfCancelled(options.signal);
  return p;
}

/**
 * Bytes to a lossless model. Never throws on content; throws only `UnsupportedVersionError` (CWR 3.x,
 * before anything is parsed), `InputTooLargeError` and, when `options.signal` was aborted, `CancelledError`.
 * `options.onProgress` is called every few thousand lines.
 */
export function parse(bytes: Uint8Array, options: ParseOptions = {}): CwrDoc {
  return drain(parseSteps(bytes, options));
}

/**
 * `parse` as a generator: yields a `Progress` every few thousand lines and returns the document. A host that has to
 * stay responsive (a worker that must hear a Cancel message) calls `next()` and gives the event loop a turn
 * between calls; stopping early is just not calling `next()` again (or `return()`).
 */
export function* parseSteps(bytes: Uint8Array, options: ParseOptions = {}): Generator<Progress, CwrDoc, void> {
  const layouts = options.layouts ?? DEFAULT_LAYOUTS;
  const max = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (bytes.length > max) throw new InputTooLargeError(bytes.length, max);
  throwIfCancelled(options.signal);

  yield progressOf('read', 0, bytes.length, 0, 0.4, options);
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const bodyStart = bom ? 3 : 0;
  const encoding = detectEncoding(bytes, bodyStart, bom);

  const lines = yield* splitLines(bytes, bodyStart, encoding, options);
  const version = detectVersion(lines, options);
  const { records, recordOfLine } = yield* buildRecords(lines, version.version, layouts, options);
  const { file, orphans } = buildStructure(lines, records);
  yield progressOf('structure', 1, 1, 0.93, 1, options);

  return {
    bytes,
    encoding,
    bom,
    lines,
    records,
    recordOfLine,
    version,
    file,
    orphans,
    edits: new Map(),
    layouts,
  };
}

/**
 * Splits on CRLF, LF or a lone CR, keeping each line's own EOL. The lines tile the bytes after the
 * BOM exactly; an empty file has no lines, and a final newline does not create an empty last line.
 */
function* splitLines(bytes: Uint8Array, bodyStart: number, encoding: CwrDoc['encoding'], options: RunOptions): Generator<Progress, Line[], void> {
  // Single-byte encodings are decoded once and sliced: character offsets equal byte offsets.
  const whole = encoding === 'utf8' ? null : decodeSingleByte(bytes);
  const lines: Line[] = [];
  const n = bytes.length;
  let start = bodyStart;
  let i = bodyStart;
  while (i < n) {
    const b = bytes[i]!;
    if (b !== LF && b !== CR) {
      i++;
      continue;
    }
    let eol: Line['eol'] = b === LF ? '\n' : '\r';
    let next = i + 1;
    if (b === CR && next < n && bytes[next] === LF) {
      eol = '\r\n';
      next++;
    }
    lines.push(makeLine(lines.length, bytes, whole, start, i, next, eol));
    start = next;
    i = next;
    if (lines.length % STEP === 0) yield progressOf('lines', i, n, 0.4, 0.65, options);
  }
  if (start < n) lines.push(makeLine(lines.length, bytes, whole, start, n, n, ''));
  return lines;
}

function makeLine(
  index: number,
  bytes: Uint8Array,
  whole: string | null,
  byteStart: number,
  contentEnd: number,
  byteEnd: number,
  eol: Line['eol'],
): Line {
  const text = whole !== null ? whole.slice(byteStart, contentEnd) : decodeUtf8(bytes, byteStart, contentEnd);
  return { index, byteStart, byteEnd, eol, text };
}

const GRH_VERSION_RE = /^02\.(\d\d)/;

/** The version of a file from its first HDR and GRH. Throws `UnsupportedVersionError` for CWR 3.x. Takes anything with line `text`. */
export function detectVersion(lines: ReadonlyArray<{ readonly text: string }>, options: { version?: CwrVersion; fileName?: string }): VersionInfo {
  if (options.fileName && /\.V3\d$/i.test(options.fileName.trim())) {
    throw new UnsupportedVersionError(options.fileName.trim().slice(-3).toUpperCase(), 'fileName');
  }

  let grh: string | null = null;
  let hdr: string | null = null;
  let sawGrh = false;
  let sawHdr = false;
  for (const line of lines) {
    const t = line.text;
    if (!sawHdr && t.startsWith('HDR')) {
      sawHdr = true;
      if (t.length >= 104) hdr = t.slice(101, 104);
    } else if (!sawGrh && t.startsWith('GRH')) {
      sawGrh = true;
      grh = t.length > 11 ? t.slice(11, 16) : null;
    }
    if (sawHdr && sawGrh) break;
  }

  if (grh !== null && /^\s*0?3\./.test(grh)) throw new UnsupportedVersionError(grh.trim(), 'grh');
  if (hdr !== null && /^\s*3\./.test(hdr)) throw new UnsupportedVersionError(hdr.trim(), 'hdr');

  const info = (version: CwrVersion, source: VersionInfo['source']): VersionInfo => ({ version, grh, hdr, source });
  if (options.version) return info(options.version, 'option');
  if (grh !== null) {
    const m = GRH_VERSION_RE.exec(grh.trim());
    if (m) return info(m[1] === '20' ? '2.2' : '2.1', 'grh');
  }
  if (hdr !== null && hdr.trim() === '2.2') return info('2.2', 'hdr');
  return info('2.1', 'default');
}

function digits(text: string, from: number, to: number): number | undefined {
  if (text.length < to) return undefined;
  let value = 0;
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i) - 48;
    if (c < 0 || c > 9) return undefined;
    value = value * 10 + c;
  }
  return value;
}

interface TypeInfo {
  known: boolean;
  layout: RecordLayoutDef | null;
  max: number;
}

function* buildRecords(
  lines: Line[],
  version: CwrVersion,
  layouts: LayoutProvider,
  options: RunOptions,
): Generator<Progress, { records: Rec[]; recordOfLine: Int32Array }, void> {
  const records: Rec[] = [];
  const recordOfLine = new Int32Array(lines.length).fill(-1);
  const cache = new Map<string, TypeInfo>();

  for (const line of lines) {
    if (line.index > 0 && line.index % STEP === 0) yield progressOf('records', line.index, lines.length, 0.65, 0.93, options);
    const text = line.text;
    if (isBlank(text)) continue;

    const type = text.slice(0, 3);
    let info = cache.get(type);
    if (!info) {
      const layout = layouts.getLayout(version, type);
      info = {
        known: layout !== null || layouts.isRecordType(version, type),
        layout,
        max: layout ? Math.max(layout.fullLength, ...(layout.alsoValid ?? [])) : 0,
      };
      cache.set(type, info);
    }

    const tseq = digits(text, 3, 11);
    const rseq = tseq === undefined ? undefined : digits(text, 11, 19);
    const length = text.length;

    let status: Rec['status'] = 'ok';
    if (!info.known) status = 'unknown-type';
    else if (!CONTROL_TYPES.has(type) && (tseq === undefined || rseq === undefined)) status = 'bad-prefix';
    else if (info.layout) {
      const layout = info.layout;
      if (length > info.max) status = 'long';
      else if (length < layout.fullLength && !(layout.alsoValid && layout.alsoValid.includes(length))) status = 'short';
    }

    const rec: Rec = { line: line.index, type, layout: info.layout ? info.layout.name : null, length, status };
    if (tseq !== undefined && rseq !== undefined && !CONTROL_TYPES.has(type)) {
      rec.tseq = tseq;
      rec.rseq = rseq;
    }
    recordOfLine[line.index] = records.length;
    records.push(rec);
  }
  return { records, recordOfLine };
}

/** A line of nothing but spaces and tabs (or empty) is blank: kept in `lines`, not in `records`. */
function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}
