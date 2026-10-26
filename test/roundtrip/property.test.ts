import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateCwrText, parse, serialize, UnsupportedVersionError } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { equalBytes, expectSound } from '../helpers';

const RUNS = 1000;

// Realistic lines to mutate: records of both versions, with and without OPU/OWR.
const pool: string[] = [];
for (const version of ['2.1', '2.2'] as CwrVersion[]) {
  for (const otherParties of [false, true]) {
    pool.push(...generateCwrText({ version, works: 3, otherParties, eol: '\n', finalNewline: false }).split('\n'));
  }
}

const TYPES = ['HDR', 'GRH', 'GRT', 'TRL', 'NWR', 'REV', 'ACK', 'SPU', 'OPU', 'SPT', 'SWR', 'OWR', 'SWT', 'PWR', 'ALT', 'PER', 'REC', 'ORN', 'MSG', 'XRF', 'OPT', 'ALX', '   ', 'NW', ''];

const printable = fc.array(fc.integer({ min: 32, max: 126 }), { maxLength: 300 });
const high = fc.array(fc.integer({ min: 0x80, max: 0xff }), { maxLength: 4 });

/** One line as bytes (no EOL). */
const lineArb: fc.Arbitrary<number[]> = fc.oneof(
  // a pool line, kept whole
  fc.constantFrom(...pool).map(s => Array.from(s, c => c.charCodeAt(0))),
  // a pool line cut short (short record)
  fc.tuple(fc.constantFrom(...pool), fc.nat(300)).map(([s, cut]) => Array.from(s.slice(0, cut), c => c.charCodeAt(0))),
  // a pool line with extra characters (record longer than its layout)
  fc.tuple(fc.constantFrom(...pool), printable).map(([s, extra]) => [...Array.from(s, c => c.charCodeAt(0)), ...extra]),
  // a type, a possibly broken prefix and a random body
  fc
    .tuple(fc.constantFrom(...TYPES), fc.boolean(), fc.nat(99999999), fc.nat(99999999), printable)
    .map(([type, good, t, r, body]) => [
      ...Array.from(type + (good ? String(t).padStart(8, '0') + String(r).padStart(8, '0') : 'XX 1'), c => c.charCodeAt(0)),
      ...body,
    ]),
  // blank-ish lines
  fc.array(fc.constantFrom(32, 9), { maxLength: 5 }),
  // anything, high (Latin-1) bytes included, without line-break bytes
  fc.tuple(printable, high, printable).map(([x, y, z]) => [...x, ...y, ...z]),
);

const eolArb = fc.constantFrom('\n', '\r\n', '\r');

const fileArb = fc
  .tuple(
    fc.array(fc.tuple(lineArb, eolArb), { maxLength: 40 }),
    fc.constantFrom('', '\n', '\r\n', '\r'), // what ends the last line: nothing is the "no final newline" case
    fc.boolean(), // BOM
  )
  .map(([lines, last, bom]) => {
    const out: number[] = bom ? [0xef, 0xbb, 0xbf] : [];
    lines.forEach(([bytes, eol], i) => {
      out.push(...bytes);
      const e = i === lines.length - 1 ? last : eol;
      for (const c of e) out.push(c.charCodeAt(0));
    });
    return Uint8Array.from(out);
  });

/** Parse, tolerating only the one typed refusal (a random GRH can spell 03.x). */
function tryParse(bytes: Uint8Array, version?: CwrVersion) {
  try {
    return parse(bytes, version ? { version } : {});
  } catch (e) {
    if (e instanceof UnsupportedVersionError) return null;
    throw e;
  }
}

describe('round-trip property tests', () => {
  it(`structured inputs (mixed EOLs, no final newline, BOM, blanks, unknown, short and long records): ${RUNS} runs`, () => {
    let refused = 0;
    fc.assert(
      fc.property(fileArb, bytes => {
        for (const version of [undefined, '2.1', '2.2'] as const) {
          const doc = tryParse(bytes, version);
          if (!doc) {
            refused++;
            continue;
          }
          expect(equalBytes(serialize(doc), bytes)).toBe(true);
          expectSound(doc);
        }
      }),
      { numRuns: RUNS },
    );
    expect(refused).toBeLessThan(RUNS); // the refusal path is rare, not the norm
  });

  it(`arbitrary bytes, including the empty file and CR/LF soup: ${RUNS} runs`, () => {
    const soup = fc.uint8Array({ maxLength: 400 });
    const crlfSoup = fc
      .array(fc.constantFrom(10, 13, 32, 65, 0xe9, 0xc3, 0xa9, 0), { maxLength: 200 })
      .map(a => Uint8Array.from(a));
    fc.assert(
      fc.property(fc.oneof(soup, crlfSoup), bytes => {
        const doc = tryParse(bytes);
        if (!doc) return;
        expect(equalBytes(serialize(doc), bytes)).toBe(true);
        expectSound(doc);
      }),
      { numRuns: RUNS },
    );
  });

  it('hand-picked edge files', () => {
    const cases: Record<string, string> = {
      empty: '',
      'one newline': '\n',
      'only a CR': '\r',
      'CR then LF then CR': '\r\n\r',
      'blank lines only': '\n\n  \n\t\n',
      'no final newline': 'HDR',
      'garbage': 'hello world\nHDR\r\nGRH\n',
    };
    for (const [name, text] of Object.entries(cases)) {
      const bytes = Uint8Array.from(text, c => c.charCodeAt(0));
      const doc = parse(bytes);
      expect(equalBytes(serialize(doc), bytes), name).toBe(true);
      expectSound(doc);
    }
    expect(parse(new Uint8Array(0)).lines).toEqual([]);
    expect(parse(Uint8Array.of(0xef, 0xbb, 0xbf)).bom).toBe(true);
  });
});
