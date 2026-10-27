import { beforeEach, describe, expect, it, vi } from 'vitest';

// extractWorks({ eol }) must hand back the bytes its guardrails checked. To see what the guardrails are given, this file wraps the
// parser and the checker that extract.ts calls and records their arguments. Nothing else in the engine is changed, and calls from
// the tests themselves (which reach the parser through `parse`, inside its own module) are not recorded.
const seen = vi.hoisted(() => ({ parsed: [] as Uint8Array[], checked: [] as unknown[] }));

vi.mock('../../src/model/parse', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/model/parse')>();
  return {
    ...original,
    parseSteps: (bytes: Uint8Array, options?: unknown) => {
      seen.parsed.push(bytes);
      return original.parseSteps(bytes, options as never);
    },
  };
});
vi.mock('../../src/rules/check', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/rules/check')>();
  return {
    ...original,
    checkSteps: (doc: unknown, options?: unknown) => {
      seen.checked.push(doc);
      return original.checkSteps(doc as never, options as never);
    },
  };
});

import { cleanIdentifiers, extractWorks, findReplace, generateCwr, parse, serialize, verifyExtraction } from '../../src/index';
import type { CwrDoc, ExtractSuccess, RecRef } from '../../src/index';
import { allOf, dec, diffRuns, enc, lineText, synth } from './support';

const NOW = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));
const headersOf = (doc: CwrDoc): RecRef[] => doc.file.groups.flatMap(g => g.transactions.map(t => t.header));
const ok = (r: ReturnType<typeof extractWorks>): ExtractSuccess => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message} ${JSON.stringify(r.checks)}`);
  return r;
};
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');
const fromLatin1 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'latin1'));
/** Every line ending (CR LF, LF or a lone CR) written as CR LF, done on the bytes read one to a character. Independent of the engine. */
const withCrlf = (bytes: Uint8Array): Uint8Array => fromLatin1(latin1(bytes).replace(/\r\n|\n|\r/g, '\r\n'));
/** Every ending of a source, in order. */
const endingsOf = (bytes: Uint8Array): string[] => latin1(bytes).match(/\r\n|\n|\r/g) ?? [];

// The same twelve works, written in different ways. The text is plain CR LF to begin with.
const crlfText = dec(synth('2.1', 12, true).bytes);
const alternate = (text: string): string => {
  let n = 0;
  return text.replace(/\r\n/g, () => (n++ % 2 === 0 ? '\n' : '\r\n'));
};
const utf8Bom = (text: string): Uint8Array => {
  const named = text.replace('AMBER HARBOUR 00001', 'Café Harbour 00001'.padEnd(19, ' ')).replace('CALM SIGNAL 00002', 'Señal calma 00002'.padEnd(17, ' '));
  return new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(named)]);
};
const latin1File = (text: string): Uint8Array => {
  const bytes = fromLatin1(text);
  bytes[latin1(bytes).indexOf('AMBER') + 1] = 0xe9; // an accented letter, one byte
  bytes[latin1(bytes).indexOf('CALM') + 3] = 0xf1;
  return bytes;
};

const sources: Array<[string, Uint8Array]> = [
  ['CR LF endings', enc(crlfText)],
  ['LF endings', enc(crlfText.replace(/\r\n/g, '\n'))],
  ['lone CR endings', enc(crlfText.replace(/\r\n/g, '\r'))],
  ['mixed endings, LF first', enc(alternate(crlfText))],
  ['mixed endings, CR LF first', enc(alternate(crlfText).replace(/^([^\r\n]*)\n/, '$1\r\n'))],
  ['LF endings and no final ending', enc(crlfText.replace(/\r\n/g, '\n').replace(/\n$/, ''))],
  ['CR LF endings and no final ending', enc(crlfText.replace(/\r\n$/, ''))],
  ['UTF-8 with a byte order mark, accented names, LF endings', utf8Bom(crlfText.replace(/\r\n/g, '\n'))],
  ['UTF-8 with a byte order mark, accented names, CR LF endings', utf8Bom(crlfText)],
  ['Latin-1 accented names, mixed endings', latin1File(alternate(crlfText))],
  ['lower-case titles and names, LF endings', enc(crlfText.replace(/\r\n/g, '\n').replace('AMBER HARBOUR 00001', 'amber harbour 00001').replace('CALM SIGNAL 00002', 'Calm Signal 00002'))],
];

beforeEach(() => {
  seen.parsed.length = 0;
  seen.checked.length = 0;
});

describe('the sources are what their names say', () => {
  it('encodings, byte order marks and endings', () => {
    const by = Object.fromEntries(sources.map(([name, bytes]) => [name, parse(bytes)]));
    expect(by['UTF-8 with a byte order mark, accented names, LF endings']).toMatchObject({ encoding: 'utf8', bom: true });
    expect(by['UTF-8 with a byte order mark, accented names, CR LF endings']).toMatchObject({ encoding: 'utf8', bom: true });
    expect(by['Latin-1 accented names, mixed endings']).toMatchObject({ encoding: 'latin1', bom: false });
    expect(by['CR LF endings']).toMatchObject({ encoding: 'ascii', bom: false });
    expect(new Set(by['CR LF endings']!.lines.map(l => l.eol))).toEqual(new Set(['\r\n']));
    expect(new Set(by['LF endings']!.lines.map(l => l.eol))).toEqual(new Set(['\n']));
    expect(new Set(by['lone CR endings']!.lines.map(l => l.eol))).toEqual(new Set(['\r']));
    expect(new Set(by['mixed endings, LF first']!.lines.map(l => l.eol))).toEqual(new Set(['\n', '\r\n']));
    expect(by['mixed endings, LF first']!.lines[0]!.eol).toBe('\n');
    expect(by['mixed endings, CR LF first']!.lines[0]!.eol).toBe('\r\n');
    expect(by['LF endings and no final ending']!.lines.at(-1)!.eol).toBe('');
    expect(by['CR LF endings and no final ending']!.lines.at(-1)!.eol).toBe('');
    expect(by['lower-case titles and names, LF endings']!.records.length).toBeGreaterThan(10);
  });
});

describe('extractWorks eol: the bytes the guardrails check are the bytes that are returned', () => {
  const picks: Array<[string, (doc: CwrDoc) => RecRef[]]> = [
    ['every work', headersOf],
    ['some works', doc => headersOf(doc).filter((_, i) => i % 3 !== 1)],
  ];

  describe.each(sources)('%s', (_name, bytes) => {
    const source = parse(bytes);
    const firstEnding = endingsOf(bytes)[0] ?? '\r\n';
    const lastEnded = /[\r\n]$/.test(latin1(bytes));

    it.each(picks)('%s: the parser and the checker are given the returned bytes, in either mode', (_label, pick) => {
      for (const eol of ['keep', 'crlf'] as const) {
        seen.parsed.length = 0;
        seen.checked.length = 0;
        const r = ok(extractWorks(source, pick(source), { eol, now: NOW }));
        // The output is read back once, from the very array that is returned, and the checker looks at that document and at the source.
        expect(seen.parsed).toHaveLength(1);
        expect(seen.parsed[0]).toBe(r.bytes);
        expect(seen.checked).toHaveLength(2);
        expect(seen.checked[0]).toBe(r.doc);
        expect(seen.checked[1]).toBe(source);
        expect(r.doc.bytes).toBe(r.bytes);
        // And the same guardrails, run again on the returned bytes, say the same thing.
        expect(verifyExtraction(source, r.selected, r.bytes)).toEqual(r.checks);
        expect(r.checks.ok).toBe(true);
      }
    });

    it.each(picks)('%s: "keep" writes one ending, the first the source uses (CR LF when it has none), and no final ending when the source had none', (_label, pick) => {
      const r = ok(extractWorks(source, pick(source), { now: NOW }));
      const ends = endingsOf(r.bytes);
      expect(ends.length).toBeGreaterThan(5);
      expect(new Set(ends)).toEqual(new Set([firstEnding]));
      expect(/[\r\n]$/.test(latin1(r.bytes))).toBe(lastEnded);
      // Asking for "keep" is the same as asking for nothing.
      expect(Buffer.from(ok(extractWorks(source, pick(source), { eol: 'keep', now: NOW })).bytes).equals(Buffer.from(r.bytes))).toBe(true);
    });

    it.each(picks)('%s: "crlf" writes CR LF for every ending, and nothing else differs from "keep"', (_label, pick) => {
      const keep = ok(extractWorks(source, pick(source), { eol: 'keep', now: NOW }));
      const crlf = ok(extractWorks(source, pick(source), { eol: 'crlf', now: NOW }));
      expect(new Set(endingsOf(crlf.bytes))).toEqual(new Set(['\r\n']));
      expect(endingsOf(crlf.bytes)).toHaveLength(endingsOf(keep.bytes).length);
      expect(/[\r\n]$/.test(latin1(crlf.bytes))).toBe(lastEnded);
      // Independent of the engine: "keep" with every ending turned into CR LF is exactly "crlf".
      expect(Buffer.from(crlf.bytes).equals(Buffer.from(withCrlf(keep.bytes)))).toBe(true);
      // So the only bytes that differ are line endings, and the text, the byte order mark and the encoding are the same.
      expect(crlf.doc.encoding).toBe(keep.doc.encoding);
      expect(crlf.doc.bom).toBe(keep.doc.bom);
      expect(crlf.doc.lines.map(l => l.text)).toEqual(keep.doc.lines.map(l => l.text));
      expect(crlf.stats).toEqual(keep.stats);
      expect(crlf.selected).toEqual(keep.selected);
      expect(crlf.addedToSelection).toEqual(keep.addedToSelection);
      expect(crlf.headerChanged).toBe(keep.headerChanged);
      expect(crlf.checks).toEqual(keep.checks);
      // What the page did before (extract, then serialize with CR LF) gave these bytes too; now they are the checked ones.
      expect(Buffer.from(serialize(keep.doc, { eol: 'crlf' })).equals(Buffer.from(crlf.bytes))).toBe(true);
      // The output parses back to what was written, in either mode.
      expect(Buffer.from(serialize(parse(crlf.bytes))).equals(Buffer.from(crlf.bytes))).toBe(true);
    });
  });
});

describe('extractWorks eol: with every work and the header kept, "crlf" is the source with CR LF endings', () => {
  it.each(sources)('%s', (_name, bytes) => {
    const source = parse(bytes);
    const r = ok(extractWorks(source, headersOf(source), { eol: 'crlf', keepHeader: true }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(withCrlf(source.bytes)))).toBe(true);
    // Only line endings differ from the source, wherever they are.
    const lf = latin1(r.bytes).replace(/\r\n/g, '\n');
    const src = latin1(source.bytes).replace(/\r\n|\r/g, '\n');
    expect(lf).toBe(src);
  });
});

describe('extractWorks eol: other things stay as they were', () => {
  const source = parse(enc(crlfText.replace(/\r\n/g, '\n')));

  it('the same call without eol gives the same bytes as before the option existed (the source ending)', () => {
    const r = ok(extractWorks(source, headersOf(source), { keepHeader: true }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(source.bytes))).toBe(true);
  });

  it('in a copy of every record, a new header is the only difference from the source besides endings', () => {
    const keep = ok(extractWorks(source, headersOf(source), { now: NOW }));
    const crlf = ok(extractWorks(source, headersOf(source), { now: NOW, eol: 'crlf' }));
    const kept = ok(extractWorks(source, headersOf(source), { keepHeader: true, eol: 'crlf' }));
    expect(crlf.bytes.length).toBe(keep.bytes.length + keep.doc.lines.length);
    // The two files with the header changed agree everywhere but their endings; against the header-kept file only the header differs.
    const runs = diffRuns(kept.bytes, crlf.bytes);
    const hdr = kept.doc.lines[0]!;
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every(([s, e]) => s >= hdr.byteStart && e <= hdr.byteEnd)).toBe(true);
  });

  it('a source with edits that have not been saved: the edited text is what is written, in CR LF too', () => {
    const edited = cleanIdentifiers(findReplace(source, { fields: ['workTitle'], find: 'HARBOUR', replace: 'QUAY', mode: 'substring', apply: true }).doc!, { apply: true }).doc!;
    expect(edited.edits.size).toBeGreaterThan(0);
    const r = ok(extractWorks(edited, headersOf(edited), { keepHeader: true, eol: 'crlf' }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(withCrlf(serialize(edited))))).toBe(true);
    expect(dec(r.bytes)).toContain('AMBER QUAY 00001');
    expect(r.doc.bytes).toBe(r.bytes);
  });

  it('an empty-looking edge: a source of one work, with no ending after the last line', () => {
    const one = parse(enc(dec(generateCwr({ version: '2.2', works: 1 })).replace(/\r\n/g, '\n').replace(/\n$/, '')));
    const r = ok(extractWorks(one, headersOf(one), { keepHeader: true, eol: 'crlf' }));
    expect(latin1(r.bytes).endsWith('\r\n')).toBe(false);
    expect(latin1(r.bytes).split('\r\n')).toHaveLength(one.lines.length);
    const lines = r.doc.lines.map(l => l.text);
    expect(lines).toEqual(one.lines.map((_l, i) => lineText(one, i)));
    expect(allOf(r.doc, 'NWR')).toHaveLength(1);
  });
});
