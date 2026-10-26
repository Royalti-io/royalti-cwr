import { encodeText } from '../model/text';
import { EditError } from '../model/types';
import type { CwrDoc, Eol } from '../model/types';

export interface SerializeOptions {
  /** `keep` (default) writes each line's own EOL; `crlf` rewrites every present EOL as CR/LF. */
  eol?: 'keep' | 'crlf';
}

const eolBytes = (eol: Eol): Uint8Array =>
  eol === '' ? EMPTY : eol === '\r\n' ? CRLF : eol === '\n' ? LF : CR;
const EMPTY = new Uint8Array(0);
const CRLF = Uint8Array.of(13, 10);
const LF = Uint8Array.of(10);
const CR = Uint8Array.of(13);

/**
 * Model to bytes. An untouched line is copied from `doc.bytes` with its own EOL, so an unedited model
 * serialises to exactly its input. An edited line is re-encoded from `doc.edits` in the document's
 * encoding, followed by that line's original EOL. The BOM and a missing final newline are kept.
 */
export function serialize(doc: CwrDoc, options: SerializeOptions = {}): Uint8Array {
  const crlf = options.eol === 'crlf';
  if (doc.edits.size === 0 && !crlf) return doc.bytes.slice();

  const bomLength = doc.bom ? 3 : 0;
  const pieces: Array<Uint8Array | null> = new Array<Uint8Array | null>(doc.lines.length).fill(null);
  let total = bomLength;
  for (const line of doc.lines) {
    const edited = doc.edits.get(line.index);
    const eol = crlf && line.eol !== '' ? CRLF : eolBytes(line.eol);
    if (edited !== undefined) {
      const body = encodeText(edited, doc.encoding);
      if (!body) throw new EditError('not-encodable', `Line ${line.index} cannot be encoded as ${doc.encoding}.`);
      const piece = new Uint8Array(body.length + eol.length);
      piece.set(body, 0);
      piece.set(eol, body.length);
      pieces[line.index] = piece;
      total += piece.length;
    } else if (crlf && line.eol !== '' && line.eol !== '\r\n') {
      const contentEnd = line.byteEnd - eolBytes(line.eol).length;
      const piece = new Uint8Array(contentEnd - line.byteStart + 2);
      piece.set(doc.bytes.subarray(line.byteStart, contentEnd), 0);
      piece.set(CRLF, contentEnd - line.byteStart);
      pieces[line.index] = piece;
      total += piece.length;
    } else {
      total += line.byteEnd - line.byteStart;
    }
  }

  const out = new Uint8Array(total);
  let at = 0;
  if (bomLength) {
    out.set(doc.bytes.subarray(0, bomLength), 0);
    at = bomLength;
  }
  for (const line of doc.lines) {
    const piece = pieces[line.index];
    if (piece) {
      out.set(piece, at);
      at += piece.length;
    } else {
      out.set(doc.bytes.subarray(line.byteStart, line.byteEnd), at);
      at += line.byteEnd - line.byteStart;
    }
  }
  return out;
}
