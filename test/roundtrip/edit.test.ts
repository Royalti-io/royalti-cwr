import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EditError,
  forkDoc,
  generateCwr,
  getField,
  layoutOf,
  parse,
  recordText,
  renumber,
  serialize,
  setField,
  UnsupportedVersionError,
} from '../../src/index';
import type { CwrDoc } from '../../src/index';
import { ascii, equalBytes, fixture, SAMPLE } from '../helpers';

/**
 * Edit locality: everything before the field's first character and everything after its last is
 * byte-identical, other lines included. `lineByte` is where the line starts (ASCII/Latin-1: chars = bytes).
 */
function expectLocal(before: Uint8Array, after: Uint8Array, lineByte: number, start: number, end: number, oldLen: number): void {
  const headEnd = lineByte + Math.min(start, oldLen);
  expect(equalBytes(before.subarray(0, headEnd), after.subarray(0, headEnd))).toBe(true);
  const inTail = before.subarray(lineByte + Math.min(end, oldLen));
  const outTail = after.subarray(lineByte + end);
  expect(equalBytes(inTail, outTail)).toBe(true);
}

describe('setField: edit locality', () => {
  it('a full-length record changes only that byte range', () => {
    const bytes = generateCwr({ version: '2.1', works: 3 });
    const doc = parse(bytes);
    const ref = doc.records.findIndex(r => r.type === 'NWR');
    const r = setField(doc, ref, 'workTitle', 'A BRAND NEW TITLE');
    expect(r).toMatchObject({ start: 19, end: 79, changed: true, truncated: false, lengthBefore: 260, lengthAfter: 260 });
    const out = serialize(doc);
    expect(out.length).toBe(bytes.length);
    const lineStart = doc.lines[doc.records[ref]!.line]!.byteStart;
    const diffs: number[] = [];
    for (let i = 0; i < bytes.length; i++) if (bytes[i] !== out[i]) diffs.push(i);
    expect(diffs.length).toBeGreaterThan(0);
    expect(Math.min(...diffs)).toBeGreaterThanOrEqual(lineStart + 19);
    expect(Math.max(...diffs)).toBeLessThan(lineStart + 79);
    expect(new TextDecoder().decode(out.subarray(lineStart + 19, lineStart + 79))).toBe('A BRAND NEW TITLE'.padEnd(60, ' '));
    // The source bytes are never mutated.
    expect(equalBytes(doc.bytes, bytes)).toBe(true);
  });

  it('holds for every field of every record type in the public sample, mixed EOLs included', () => {
    const base = fixture(SAMPLE);
    // Rebuild the sample with mixed line endings and no final newline, to prove EOLs are untouched.
    const text = new TextDecoder().decode(base).replace(/\n$/, '').split('\n');
    const eols = ['\n', '\r\n', '\r'];
    const mixed = ascii(text.map((l, i) => l + (i === text.length - 1 ? '' : eols[i % 3])).join(''));
    const doc0 = parse(mixed);
    let edits = 0;
    const perType = new Map<string, number>();
    for (let ref = 0; ref < doc0.records.length; ref++) {
      const layout = layoutOf(doc0, ref);
      if (!layout) continue;
      // The first three of each record type, short and malformed ones included.
      const type = doc0.records[ref]!.type;
      if ((perType.get(type) ?? 0) >= 3) continue;
      perType.set(type, (perType.get(type) ?? 0) + 1);
      for (const field of layout.fields) {
        const doc = forkDoc(doc0);
        const width = field.end - field.start;
        const numeric = field.format === 'N' || field.format === 'D' || field.format === 'T';
        const value = numeric ? '7'.repeat(Math.min(width, 3)) : 'ZQ'.repeat(width).slice(0, Math.min(width, 5));
        const oldLen = recordText(doc, ref).length;
        const lineByte = doc.lines[doc.records[ref]!.line]!.byteStart;
        setField(doc, ref, field.id, value);
        expectLocal(mixed, serialize(doc), lineByte, field.start, field.end, oldLen);
        edits++;
      }
    }
    expect(perType.size).toBeGreaterThanOrEqual(10);
    expect(edits).toBeGreaterThan(300);
  });

  it(`random field, random value: ${1000} runs`, () => {
    const doc0 = parse(generateCwr({ version: '2.2', works: 20, otherParties: true }));
    const bytes = doc0.bytes;
    const refs = doc0.records.map((_, i) => i);
    fc.assert(
      fc.property(fc.constantFrom(...refs), fc.nat(40), fc.string({ unit: fc.constantFrom(...'ABCXYZ 0123456789-.'.split('')), maxLength: 70 }), (ref, pick, raw) => {
        const layout = layoutOf(doc0, ref)!;
        const field = layout.fields[pick % layout.fields.length]!;
        const doc = forkDoc(doc0);
        const numeric = field.format === 'N' || field.format === 'D' || field.format === 'T';
        const value = numeric ? raw.replace(/\D/g, '') : raw;
        const oldLen = recordText(doc, ref).length;
        const lineByte = doc.lines[doc.records[ref]!.line]!.byteStart;
        try {
          setField(doc, ref, field.id, value, { overflow: 'truncate' });
        } catch (e) {
          expect(e).toBeInstanceOf(EditError); // numeric overflow is the only refusal with these inputs
          expect(numeric).toBe(true);
          return;
        }
        expectLocal(bytes, serialize(doc), lineByte, field.start, field.end, oldLen);
        // And the document still parses to the same structure.
        try {
          expect(parse(serialize(doc)).records.length).toBe(doc0.records.length);
        } catch (e) {
          if (!(e instanceof UnsupportedVersionError)) throw e; // the random edit made the HDR version read 3.x, which parse refuses by design
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('a record shorter than the field is padded with blanks up to it; the rest is untouched', () => {
    const lines = ['GRHNWR0000102.10', 'NWR0000000000000000SHORT TITLE', 'GRT'];
    const bytes = ascii(lines.join('\r\n') + '\r\n');
    const doc = parse(bytes);
    const r = setField(doc, 1, 'languageCode', 'en', { uppercase: true });
    expect(r).toMatchObject({ start: 79, end: 81, lengthBefore: 30, lengthAfter: 81 });
    const expected = ascii('GRHNWR0000102.10\r\n' + 'NWR0000000000000000SHORT TITLE'.padEnd(79, ' ') + 'EN' + '\r\nGRT\r\n');
    expect(equalBytes(serialize(doc), expected)).toBe(true);
  });

  it('upper case that would turn a letter into one of another script is refused, and nothing is written', () => {
    const nwr = 'NWR0000000000000000' + '5 µs café'.padEnd(60, ' ') + 'EN' + 'W1'.padEnd(14, ' ');
    const doc = parse(new Uint8Array(Buffer.from(nwr + '\n', 'utf8')));
    expect(doc.encoding).toBe('utf8');
    let error: unknown;
    try {
      setField(doc, 0, 'workTitle', '5 µs café', { uppercase: true });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EditError);
    expect((error as EditError).code).toBe('uppercase-script');
    expect(doc.edits.size).toBe(0);
    // Ordinary Latin upper case is written, and without the option the micro sign is written as given.
    expect(setField(doc, 0, 'workTitle', 'café ÿ ß', { uppercase: true }).after.trimEnd()).toBe('CAFÉ Ÿ SS');
    expect(setField(doc, 0, 'workTitle', '5 µs café').after.trimEnd()).toBe('5 µs café');
  });

  it('works on UTF-8 and Latin-1 files without disturbing multi-byte text elsewhere on the line', () => {
    const nwr = 'NWR0000000000000000' + 'CAFÉ ÉTÉ'.padEnd(60, ' ') + 'EN' + 'W1'.padEnd(14, ' ');
    const utf8 = new Uint8Array([...new Uint8Array(Buffer.from(nwr + '\n', 'utf8'))]);
    const doc = parse(utf8);
    expect(doc.encoding).toBe('utf8');
    setField(doc, 0, 'languageCode', 'FR');
    const out = serialize(doc);
    expect(new Uint8Array(Buffer.from(nwr.replace('EN', 'FR') + '\n', 'utf8'))).toEqual(out);
    // A character the file cannot hold is refused.
    const ascii21 = parse(ascii(nwr.replace(/É/g, 'E') + '\n'));
    expect(() => setField(ascii21, 0, 'workTitle', 'CAFÉ')).toThrow(EditError);
    const latin = parse(Uint8Array.of(...ascii('NWR0000000000000000TITLE '), 0xe9, 10));
    expect(latin.encoding).toBe('latin1');
    setField(latin, 0, 'languageCode', 'EN');
    expect(Array.from(serialize(latin).subarray(0, 25))).toEqual(Array.from(ascii('NWR0000000000000000TITLE ')));
    expect(() => setField(latin, 0, 'workTitle', 'Ω')).toThrow(EditError);
  });
});

describe('setField: padding and refusals', () => {
  const fresh = (): CwrDoc => parse(generateCwr({ version: '2.1', works: 2, otherParties: true }));
  const ref = (doc: CwrDoc, type: string): number => doc.records.findIndex(r => r.type === type);

  it('numbers are right-justified and zero-filled; text is left-justified and space-padded', () => {
    const doc = fresh();
    const swr = ref(doc, 'SWR');
    setField(doc, swr, 'prOwnershipShare', '25');
    expect(getField(doc, swr, 'prOwnershipShare')).toBe('00025');
    setField(doc, swr, 'writerLastName', 'OAK');
    expect(getField(doc, swr, 'writerLastName')).toBe('OAK'.padEnd(45, ' '));
    setField(doc, swr, 'prOwnershipShare', '');
    expect(getField(doc, swr, 'prOwnershipShare')).toBe('00000');
  });

  it('refuses overflow unless asked to truncate, and always refuses a number that does not fit', () => {
    const doc = fresh();
    const swr = ref(doc, 'SWR');
    expect(() => setField(doc, swr, 'taxIdNumber', 'TOO LONG BY FAR')).toThrow(EditError);
    const r = setField(doc, swr, 'taxIdNumber', 'TOO LONG BY FAR', { overflow: 'truncate' });
    expect(r).toMatchObject({ truncated: true, after: 'TOO LONG ' });
    expect(() => setField(doc, swr, 'prOwnershipShare', '123456')).toThrow(EditError);
    expect(() => setField(doc, swr, 'prOwnershipShare', '123456', { overflow: 'truncate' })).toThrow(EditError);
    setField(doc, swr, 'prOwnershipShare', '000050'); // leading zeros are not overflow
    expect(getField(doc, swr, 'prOwnershipShare')).toBe('00050');
  });

  it('refuses non-digits in numeric fields, line breaks, unknown fields and unknown records', () => {
    const doc = fresh();
    const swr = ref(doc, 'SWR');
    expect(() => setField(doc, swr, 'prOwnershipShare', '12.5')).toThrow(/digits/);
    expect(() => setField(doc, swr, 'writerLastName', 'A\nB')).toThrow(EditError);
    expect(() => setField(doc, swr, 'noSuchField', 'X')).toThrow(EditError);
    expect(() => setField(doc, 99999, 'writerLastName', 'X')).toThrow(EditError);
    expect(doc.edits.size).toBe(0); // nothing was written by a refused edit
  });

  it('writing the value already there leaves no edit behind', () => {
    const doc = fresh();
    const swr = ref(doc, 'SWR');
    const same = getField(doc, swr, 'writerLastName')!.trim();
    const r = setField(doc, swr, 'writerLastName', same);
    expect(r.changed).toBe(false);
    expect(doc.edits.size).toBe(0);
    expect(equalBytes(serialize(doc), doc.bytes)).toBe(true);
  });

  it('forkDoc keeps the earlier state for undo', () => {
    const doc = fresh();
    const next = forkDoc(doc);
    setField(next, ref(next, 'SWR'), 'writerLastName', 'CHANGED');
    expect(doc.edits.size).toBe(0);
    expect(next.edits.size).toBe(1);
    expect(equalBytes(serialize(doc), doc.bytes)).toBe(true);
    expect(equalBytes(serialize(next), doc.bytes)).toBe(false);
  });
});

describe('renumber and the eol option', () => {
  it('restores GRT and TRL counts that were broken, to the original bytes', () => {
    const bytes = generateCwr({ version: '2.2', works: 40, otherParties: true });
    const doc = parse(bytes);
    const grt = doc.file.groups[0]!.grt!;
    const trl = doc.file.trl!;
    setField(doc, grt, 'transactionCount', '1');
    setField(doc, grt, 'recordCount', '2');
    setField(doc, trl, 'groupCount', '9');
    setField(doc, trl, 'transactionCount', '3');
    setField(doc, trl, 'recordCount', '4');
    expect(equalBytes(serialize(doc), bytes)).toBe(false);
    const changes = renumber(doc);
    expect(changes.map(c => c.field)).toEqual(['transactionCount', 'recordCount', 'groupCount', 'transactionCount', 'recordCount']);
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
    expect(renumber(doc)).toEqual([]);
  });

  it('counts a group that has a record count wrong after records are missing from the file', () => {
    const lines = generateCwr({ version: '2.1', works: 3 });
    const text = new TextDecoder().decode(lines).split('\r\n');
    // drop the last SWT of the last work (a physical record disappears)
    const at = text.lastIndexOf(text.filter(l => l.startsWith('SWT')).pop()!);
    text.splice(at, 1);
    const doc = parse(ascii(text.join('\r\n')));
    const changes = renumber(doc);
    expect(changes.map(c => [c.field, c.after])).toEqual([
      ['recordCount', '00000019'],
      ['recordCount', '00000021'],
    ]);
  });

  it('eol: crlf normalises every present ending and keeps a missing final newline', () => {
    const bytes = ascii('HDR\nGRH\rGRT\r\nTRL');
    const out = serialize(parse(bytes), { eol: 'crlf' });
    expect(Array.from(out)).toEqual(Array.from(ascii('HDR\r\nGRH\r\nGRT\r\nTRL')));
    const edited = parse(bytes);
    expect(edited.edits.size).toBe(0);
  });
});
