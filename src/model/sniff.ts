import { detectVersion } from './parse';
import { specLayouts } from './specLayout';
import { UnsupportedVersionError } from './types';
import type { CwrVersion } from './types';

/**
 * What a file looks like, before anything is parsed.
 *
 * - `cwr2`: the first lines look like CWR 2.1 or 2.2 records; `version` says which.
 * - `cwr3`: CWR 3.x (by the HDR or GRH version, or a `.V30` / `.V31` file name). The engine does not read it.
 * - `binary`: not text: a known file signature, or NUL bytes in the first 4 KB.
 * - `unknown`: text (or empty) with no CWR record in its first 20 non-blank lines.
 */
export type SniffKind = 'cwr2' | 'cwr3' | 'binary' | 'unknown';

export type SniffReason =
  | 'records' // cwr2: record types found
  | 'cwr3-version' // cwr3: version field says 3.x
  | 'cwr3-file-name' // cwr3: file name ends .V3x
  | 'pdf'
  | 'zip' // also .xlsx, .docx, .pptx, .odt
  | 'ole' // legacy .xls, .doc
  | 'gzip'
  | 'image'
  | 'nul-bytes'
  | 'markup' // starts with "<" (XML, HTML)
  | 'empty'
  | 'no-records';

export interface SniffResult {
  kind: SniffKind;
  reason: SniffReason;
  /** `cwr2` only. */
  version?: CwrVersion;
  /** `cwr3` only: the version text found, such as `3.0`. */
  detected?: string;
  /** The start of the first non-blank line, at most 40 characters, with anything that is not printable ASCII shown as `.`. */
  firstLine: string;
  /** How many of the first 20 non-blank lines look like CWR records. */
  recordsSeen: number;
}

export interface SniffOptions {
  /** Used only to spot `.V30` / `.V31`. */
  fileName?: string;
}

const HEAD_BYTES = 65536;
const NUL_BYTES = 4096;
const LINES = 20;
const FIRST_LINE_MAX = 40;

const startsWith = (b: Uint8Array, sig: readonly number[]): boolean => sig.every((v, i) => b[i] === v);

function signature(b: Uint8Array): SniffReason | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return 'zip'; // PK
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (startsWith(b, [0x1f, 0x8b])) return 'gzip';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47]) || startsWith(b, [0xff, 0xd8, 0xff]) || startsWith(b, [0x47, 0x49, 0x46, 0x38])) return 'image';
  return null;
}

/** The first bytes of the first non-blank line, printable ASCII only. */
function sample(bytes: Uint8Array): string {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 10 || bytes[i] === 13 || bytes[i] === 32 || bytes[i] === 9)) i++;
  let out = '';
  for (; i < bytes.length && out.length < FIRST_LINE_MAX; i++) {
    const c = bytes[i]!;
    if (c === 10 || c === 13) break;
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : '.';
  }
  return out;
}

const CONTROL = new Set(['HDR', 'GRH', 'GRT', 'TRL']);

/** True when the line starts like a CWR record of either version: a known type and the prefix that type carries. */
function looksLikeRecord(line: string): boolean {
  if (line.length < 8) return false;
  const type = line.slice(0, 3);
  if (!specLayouts.isRecordType('2.1', type) && !specLayouts.isRecordType('2.2', type)) return false;
  if (type === 'HDR') return /^HDR(PB|SO|AA|WR)/.test(line);
  if (type === 'GRH') return /^GRH[A-Z]{3}\d{5}/.test(line);
  if (type === 'GRT' || type === 'TRL') return /^(GRT|TRL)\d{5}/.test(line);
  return !CONTROL.has(type) && /^\d{8}/.test(line.slice(3, 11));
}

/**
 * Looks at the start of a file and says what it is, with the reason, so a page can tell a person "this is a PDF"
 * instead of reporting a hundred structure errors. Reads at most the first 64 KB. Never throws.
 */
export function sniff(bytes: Uint8Array, options: SniffOptions = {}): SniffResult {
  const firstLine = sample(bytes);
  const result = (kind: SniffKind, reason: SniffReason, extra: Partial<SniffResult> = {}): SniffResult => ({
    kind,
    reason,
    firstLine,
    recordsSeen: 0,
    ...extra,
  });

  if (bytes.length === 0) return result('unknown', 'empty');
  const sig = signature(bytes);
  if (sig !== null) return result('binary', sig);
  for (let i = 0; i < Math.min(bytes.length, NUL_BYTES); i++) if (bytes[i] === 0) return result('binary', 'nul-bytes');

  // Latin-1 view of the head: enough to read record prefixes, which are ASCII.
  const head = bytes.length > HEAD_BYTES ? bytes.subarray(0, HEAD_BYTES) : bytes;
  let text = '';
  for (let i = bodyStart(head); i < head.length; i += 8192) text += String.fromCharCode(...head.subarray(i, Math.min(i + 8192, head.length)));
  const lines = text.split(/\r\n|\n|\r/);
  if (head.length === HEAD_BYTES) lines.pop(); // the last line was cut off by the 64 KB limit

  const nonBlank: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    nonBlank.push(line);
    if (nonBlank.length === LINES) break;
  }
  if (nonBlank.length === 0) return result('unknown', 'empty');

  let seen = 0;
  for (const line of nonBlank) if (looksLikeRecord(line)) seen++;

  try {
    const fileName = options.fileName;
    const v = detectVersion(lines.map(t => ({ text: t })), fileName === undefined ? {} : { fileName });
    if (seen > 0) return result('cwr2', 'records', { version: v.version, recordsSeen: seen });
  } catch (e) {
    if (e instanceof UnsupportedVersionError) {
      return result('cwr3', e.evidence === 'fileName' ? 'cwr3-file-name' : 'cwr3-version', { detected: e.detected, recordsSeen: seen });
    }
    throw e;
  }
  if (nonBlank[0]!.trimStart().startsWith('<')) return result('unknown', 'markup');
  return result('unknown', 'no-records');
}

function bodyStart(b: Uint8Array): number {
  return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
}
