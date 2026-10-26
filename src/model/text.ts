import type { Encoding } from './types';

/**
 * Hand-written text codecs. `TextDecoder` is not used: it is a host global the engine avoids, and its
 * `latin1` label is windows-1252, which is not reversible for 0x80-0x9F.
 */

/** Latin-1 and ASCII: byte N is U+00N. Chunked so a 10 MB file does not blow the argument limit. */
export function decodeSingleByte(bytes: Uint8Array, start = 0, end = bytes.length): string {
  const CHUNK = 8192;
  let out = '';
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, end)) as unknown as number[]);
  }
  return out;
}

/** Length of the UTF-8 sequence starting at `i`, or 0 when it is not strictly valid (overlong, surrogate, > U+10FFFF, truncated). */
function utf8SequenceLength(bytes: Uint8Array, i: number, end: number): number {
  const b = bytes[i]!;
  if (b < 0x80) return 1;
  let need: number;
  let min: number;
  let cp: number;
  if (b >= 0xc2 && b <= 0xdf) {
    need = 1;
    min = 0x80;
    cp = b & 0x1f;
  } else if (b >= 0xe0 && b <= 0xef) {
    need = 2;
    min = 0x800;
    cp = b & 0x0f;
  } else if (b >= 0xf0 && b <= 0xf4) {
    need = 3;
    min = 0x10000;
    cp = b & 0x07;
  } else {
    return 0;
  }
  if (i + need >= end) return 0;
  for (let k = 1; k <= need; k++) {
    const c = bytes[i + k]!;
    if ((c & 0xc0) !== 0x80) return 0;
    cp = (cp << 6) | (c & 0x3f);
  }
  if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return 0;
  return need + 1;
}

/** True when `bytes[start..end)` is strictly valid UTF-8. */
export function isValidUtf8(bytes: Uint8Array, start = 0, end = bytes.length): boolean {
  let i = start;
  while (i < end) {
    const n = utf8SequenceLength(bytes, i, end);
    if (n === 0) return false;
    i += n;
  }
  return true;
}

/** Decodes valid UTF-8. Callers validate first; an invalid sequence yields U+FFFD for that byte. */
export function decodeUtf8(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = '';
  let i = start;
  while (i < end) {
    const b = bytes[i]!;
    if (b < 0x80) {
      // Fast path: run of ASCII.
      let j = i + 1;
      while (j < end && bytes[j]! < 0x80) j++;
      out += decodeSingleByte(bytes, i, j);
      i = j;
      continue;
    }
    const n = utf8SequenceLength(bytes, i, end);
    if (n === 0) {
      out += '�';
      i++;
      continue;
    }
    let cp = n === 2 ? b & 0x1f : n === 3 ? b & 0x0f : b & 0x07;
    for (let k = 1; k < n; k++) cp = (cp << 6) | (bytes[i + k]! & 0x3f);
    out += String.fromCodePoint(cp);
    i += n;
  }
  return out;
}

/** UTF-8 encode. Lone surrogates are not encodable and return null. */
export function encodeUtf8(text: string): Uint8Array | null {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const lo = text.charCodeAt(i + 1);
      if (!(lo >= 0xdc00 && lo <= 0xdfff)) return null;
      cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
      i++;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      return null;
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

/**
 * Encodes text in the document's encoding, or returns null when a character cannot be represented
 * (>= 0x80 in an ASCII file, > 0xFF in a Latin-1 file, a lone surrogate in a UTF-8 file).
 */
export function encodeText(text: string, encoding: Encoding): Uint8Array | null {
  if (encoding === 'utf8') return encodeUtf8(text);
  const limit = encoding === 'ascii' ? 0x80 : 0x100;
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= limit) return null;
    out[i] = c;
  }
  return out;
}

/**
 * ASCII when every byte is below 0x80; UTF-8 when the high bytes form valid UTF-8; otherwise Latin-1.
 * A BOM forces UTF-8 when the rest is valid; with a BOM and invalid UTF-8 the rest is read as Latin-1
 * so no byte is replaced (the bytes are kept either way).
 */
export function detectEncoding(bytes: Uint8Array, from: number, bom: boolean): Encoding {
  let high = false;
  for (let i = from; i < bytes.length; i++) {
    if (bytes[i]! >= 0x80) {
      high = true;
      break;
    }
  }
  if (!high) return bom ? 'utf8' : 'ascii';
  return isValidUtf8(bytes, from) ? 'utf8' : 'latin1';
}
