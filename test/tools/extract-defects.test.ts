import { describe, expect, it } from 'vitest';
import { check, extractWorks, extractWorksSteps, parse, verifyExtraction } from '../../src/index';
import type { CwrDoc, ExtractFailure, ExtractResult, ExtractSuccess, RecRef } from '../../src/index';
import { fixture } from '../helpers';
import { assemble, dec, enc, expectReadsLikeSource, lineText, record, synth } from './support';
import type { ExtractOptions } from '../../src/index';

/**
 * Defects an independent review found in extractWorks: a record that names another transaction, records outside any transaction that
 * are dropped without a word, a line without a record prefix, an ACK with an EXC that continues it, a source in Latin-1 whose chosen
 * works hold UTF-8 bytes, a header cut before its dates. Each test is one of the review's inputs.
 */

const NOW = new Date(Date.UTC(2026, 9, 27, 1, 2, 3));
const EOL = '\r\n';
const headersOf = (doc: CwrDoc): RecRef[] => doc.file.groups.flatMap(g => g.transactions.map(t => t.header));
const ok = (r: ExtractResult): ExtractSuccess => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message} ${JSON.stringify(r.checks)}`);
  return r;
};
const refused = (r: ExtractResult): ExtractFailure => {
  if (r.ok) throw new Error('expected a refusal');
  return r;
};
const latin1 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'latin1'));
/** extractWorks, and for every extraction that succeeds, the bytes opened on their own (no encoding given) must not have errors the source did not have on the chosen works. */
const run = (doc: CwrDoc, pick: RecRef[], options?: ExtractOptions): ExtractResult => {
  const r = extractWorks(doc, pick, options);
  if (r.ok) expectReadsLikeSource(doc, r);
  return r;
};

/** The lines of the 11-work synthetic 2.2 file, and where each work starts. */
const synthetic = dec(fixture('synthetic/synth-2.2-11works.cwr')).split(EOL);
if (synthetic[synthetic.length - 1] === '') synthetic.pop();
const nwrAt = synthetic.map((l, i) => (l.startsWith('NWR') ? i : -1)).filter(i => i >= 0);
const source = (edit: (lines: string[]) => void = () => undefined): CwrDoc => {
  const lines = [...synthetic];
  edit(lines);
  return parse(enc(lines.join(EOL) + EOL));
};
const clean = source();

describe('E1: a record whose own transaction number names another transaction', () => {
  // The review's input: the third record of work 0 (an SWR) carries the number of work 1.
  const swr = nwrAt[0]! + 3;
  const damaged = source(l => {
    l[swr] = l[swr]!.slice(0, 3) + '00000001' + l[swr]!.slice(11);
  });

  it('the source check reports it, and extraction used to hide it', () => {
    expect(check(damaged).problems.some(p => p.ruleId === 'PFX-4' && p.line === swr)).toBe(true);
    expect(check(clean).summary.errors).toBe(0);
  });

  it('extracting the work refuses, names the line and the two numbers, and hands back no file', () => {
    const r = refused(run(damaged, [headersOf(damaged)[0]!], { now: NOW }));
    expect(r.error.code).toBe('guardrail');
    expect(r.error.cause).toBe('file');
    expect(r.checks?.ok).toBe(false);
    expect(r.checks?.structure.ok).toBe(false);
    expect(r.checks?.reparse.ok).toBe(true);
    expect(r.checks?.bodies.ok).toBe(true);
    const [first] = r.checks!.structure.problems;
    expect(first).toMatch(new RegExp(`line ${swr + 1}\\b`));
    expect(first).toMatch(/SWR/);
    expect(first).toMatch(/\b1\b/);
    expect(first).toMatch(/\b0\b/);
    expect(r.error.message).not.toMatch(/failed its own checks/);
    expect('bytes' in r).toBe(false);
  });

  it('every way in gives the same refusal: all works, the generator, and a work together with its neighbours', () => {
    const all = headersOf(damaged);
    expect(refused(run(damaged, all, { now: NOW })).error.cause).toBe('file');
    expect(refused(run(damaged, [all[0]!, all[4]!], { now: NOW })).checks?.structure.ok).toBe(false);
    const gen = extractWorksSteps(damaged, [all[0]!], { now: NOW });
    let step = gen.next();
    while (!step.done) step = gen.next();
    expect(refused(step.value).error.code).toBe('guardrail');
  });

  it('only the work that holds the record is refused: the others are extracted, and are the clean ones', () => {
    const all = headersOf(damaged);
    const others = all.filter((_, i) => i !== 0);
    const r = ok(run(damaged, others, { now: NOW }));
    expect(r.checks.ok).toBe(true);
    expect(check(r.doc).summary.errors).toBe(0);
    const cleanAll = headersOf(clean);
    const cleanOut = ok(run(clean, cleanAll.filter((_, i) => i !== 0), { now: NOW }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(cleanOut.bytes))).toBe(true);
  });

  it('a host that re-checks a download made before the fix is told too: verifyExtraction reports it', () => {
    // What the old code produced is what the clean file gives: the record renumbered into the work it sits in.
    const out = ok(run(clean, [headersOf(clean)[0]!], { now: NOW }));
    const checks = verifyExtraction(damaged, [headersOf(damaged)[0]!], out.bytes);
    expect(checks.ok).toBe(false);
    expect(checks.structure.ok).toBe(false);
    expect(checks.structure.problems[0]).toMatch(new RegExp(`line ${swr + 1}\\b`));
    // And the clean source passes with the same output.
    expect(verifyExtraction(clean, [headersOf(clean)[0]!], out.bytes).ok).toBe(true);
  });

  it('a number that is wrong on a detail record and not on its neighbours, in any record type', () => {
    for (const offset of [1, 2, 4, 5]) {
      const at = nwrAt[2]! + offset;
      const doc = source(l => {
        l[at] = l[at]!.slice(0, 3) + '00000009' + l[at]!.slice(11);
      });
      const r = refused(run(doc, [headersOf(doc)[2]!], { now: NOW }));
      expect(r.checks?.structure.problems[0], `offset ${offset}`).toMatch(new RegExp(`line ${at + 1}\\b`));
    }
  });

  it('a header that is numbered differently from its details is not silently repaired either', () => {
    const at = nwrAt[3]!;
    const doc = source(l => {
      l[at] = l[at]!.slice(0, 3) + '00000007' + l[at]!.slice(11);
    });
    expect(refused(run(doc, [headersOf(doc)[3]!], { now: NOW })).error.cause).toBe('file');
  });

  it('numbers that are consistent inside each work are still renumbered, even when they are not 0, 1, 2, ...', () => {
    // Every record of work 1 carries 5 and every record of work 2 carries 9: the numbering is off, but no record names another work.
    const doc = source(l => {
      for (let i = nwrAt[1]!; i < nwrAt[2]!; i++) l[i] = l[i]!.slice(0, 3) + '00000005' + l[i]!.slice(11);
      for (let i = nwrAt[2]!; i < nwrAt[3]!; i++) l[i] = l[i]!.slice(0, 3) + '00000009' + l[i]!.slice(11);
    });
    const r = ok(run(doc, [headersOf(doc)[1]!, headersOf(doc)[2]!], { now: NOW }));
    expect(check(r.doc).summary.errors).toBe(0);
  });

  it('does not refuse a clean file, whichever works are chosen', () => {
    const all = headersOf(clean);
    expect(ok(run(clean, all, { now: NOW })).checks.ok).toBe(true);
    for (const h of all) expect(run(clean, [h], { now: NOW }).ok).toBe(true);
  });
});

describe('E2: records outside any transaction are reported, and still not copied', () => {
  const stray = (n: number): string => record('SPU', 0, n, 138, [19, 'STRAY ' + n]);

  it('a clean file reports none', () => {
    const r = ok(run(clean, headersOf(clean).slice(0, 2), { now: NOW }));
    expect(r.stats.outsideRecords).toBe(0);
    expect(r.stats.outsideLines).toEqual([]);
  });

  it('a detail record between the group header and the first work is counted, with its line', () => {
    // The review's input: a copy of an SPU between GRH and the first NWR, with the number of work 0.
    const doc = source(l => l.splice(nwrAt[0]!, 0, l[nwrAt[0]! + 1]!));
    expect(doc.orphans).toHaveLength(1);
    const r = ok(run(doc, [headersOf(doc)[0]!], { now: NOW }));
    expect(r.stats.outsideRecords).toBe(1);
    expect(r.stats.outsideLines).toEqual([doc.records[doc.orphans[0]!]!.line]);
    expect(r.stats.outsideLines).toEqual([nwrAt[0]!]);
    // Nothing about what is copied changes: the output is what the clean file gives.
    const same = ok(run(clean, [headersOf(clean)[0]!], { now: NOW }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(same.bytes))).toBe(true);
    expect(same.stats.outsideRecords).toBe(0);
  });

  it('records before the first group, between groups and after the trailer all count; the lines are the first few, in file order', () => {
    const doc = source(l => {
      l.splice(1, 0, stray(1));
      const grt = l.findIndex(x => x.startsWith('GRT'));
      for (let i = 0; i < 25; i++) l.splice(grt + 1, 0, stray(100 + i));
      l.push(stray(2));
    });
    expect(doc.orphans).toHaveLength(27);
    const r = ok(run(doc, headersOf(doc), { now: NOW }));
    expect(r.stats.outsideRecords).toBe(27);
    expect(r.stats.outsideLines.length).toBeGreaterThan(0);
    expect(r.stats.outsideLines.length).toBeLessThanOrEqual(10);
    expect(r.stats.outsideLines).toEqual(doc.orphans.slice(0, r.stats.outsideLines.length).map(ref => doc.records[ref]!.line));
    expect(dec(r.bytes)).not.toContain('STRAY');
  });

  it('the count is of the source, whichever works are chosen', () => {
    const doc = source(l => l.splice(nwrAt[0]!, 0, stray(1)));
    expect(ok(run(doc, [headersOf(doc)[5]!], { now: NOW })).stats.outsideRecords).toBe(1);
  });
});

describe('E3: a line without a valid record prefix is copied as it is', () => {
  const note = 'this is a free text note line that someone pasted';
  const noted = source(l => l.splice(nwrAt[0]! + 2, 0, note));
  const out = ok(run(noted, [headersOf(noted)[0]!], { now: NOW }));
  const outLines = dec(out.bytes).split(EOL);

  it('the line is in the output exactly, and nothing else was written over it', () => {
    expect(outLines).toContain(note);
    expect(outLines.filter(x => x.startsWith('thi'))).toEqual([note]);
    expect(out.checks.ok).toBe(true);
  });

  it('the line keeps its place in the count: every other record is numbered by its position in the work, as before', () => {
    const txn = out.doc.file.groups[0]!.transactions[0]!;
    const refs = [txn.header, ...txn.records];
    expect(refs).toHaveLength(1 + noted.file.groups[0]!.transactions[0]!.records.length);
    refs.forEach((ref, i) => {
      const rec = out.doc.records[ref]!;
      if (rec.tseq !== undefined) expect([rec.tseq, rec.rseq], `record ${i}`).toEqual([0, i]);
      else expect(i).toBe(2);
    });
  });

  it.each([
    ['a letter in the transaction number', (x: string) => x.slice(0, 3) + '0000000X' + x.slice(11)],
    ['a letter in the record number', (x: string) => x.slice(0, 3) + x.slice(3, 11) + '0000000X' + x.slice(19)],
    ['a blank number', (x: string) => x.slice(0, 3) + '        ' + x.slice(11)],
    ['a minus sign', (x: string) => x.slice(0, 3) + '-0000001' + x.slice(11)],
  ])('a known record type with %s is copied as it is', (_name, damage) => {
    const at = nwrAt[0]! + 3;
    const doc = source(l => {
      l[at] = damage(l[at]!);
    });
    expect(doc.records[doc.recordOfLine[at]!]!.status).toBe('bad-prefix');
    const r = ok(run(doc, [headersOf(doc)[0]!], { now: NOW }));
    expect(dec(r.bytes).split(EOL)).toContain(damage(synthetic[at]!));
    expect(r.checks.ok).toBe(true);
  });

  it('a header with a malformed number is copied as it is too, and its details are numbered from the work', () => {
    const at = nwrAt[1]!;
    const doc = source(l => {
      l[at] = l[at]!.slice(0, 3) + '0000000X' + l[at]!.slice(11);
    });
    const r = ok(run(doc, [headersOf(doc)[1]!], { now: NOW }));
    expect(dec(r.bytes).split(EOL)).toContain(doc.lines[at]!.text);
    expect(r.checks.ok).toBe(true);
  });

  it('the bodies check covers such a line whole: a copy that was renumbered anyway is caught', () => {
    const renumbered = outLines.map(x => (x === note ? 'thi0000000000000002' + note.slice(19) : x)).join(EOL);
    const checks = verifyExtraction(noted, out.selected, enc(renumbered));
    expect(checks.bodies.ok).toBe(false);
    expect(checks.bodies.problems.join(' ')).toMatch(/differs from (its|the) source/);
    expect(checks.ok).toBe(false);
    // The honest copy passes.
    expect(verifyExtraction(noted, out.selected, out.bytes).ok).toBe(true);
    // A change that sits before column 19 in a line with no prefix is caught as well.
    const early = outLines.map(x => (x === note ? 'THIS' + note.slice(4) : x)).join(EOL);
    expect(verifyExtraction(noted, out.selected, enc(early)).bodies.ok).toBe(false);
  });

  it('a line too short to hold a prefix is still refused, naming the line', () => {
    const doc = source(l => l.splice(nwrAt[0]! + 2, 0, 'short note'));
    const r = refused(run(doc, [headersOf(doc)[0]!], { now: NOW }));
    expect(r.error.code).toBe('unnumberable-record');
    expect(r.error.lines).toEqual([nwrAt[0]! + 2]);
    expect(r.error.cause).toBe('file');
  });

  it('a record of an unknown type with a valid prefix is still numbered', () => {
    const doc = source(l => l.splice(nwrAt[0]! + 2, 0, 'XYZ0000000000000099SOMETHING'));
    const r = ok(run(doc, [headersOf(doc)[0]!], { now: NOW }));
    const line = dec(r.bytes).split(EOL).find(x => x.startsWith('XYZ'))!;
    expect(line.slice(19)).toBe('SOMETHING');
    expect(line.slice(3, 19)).toBe('0000000000000002');
  });
});

describe('E4: an ACK with an EXC that continues it', () => {
  const pool = synth('2.1', 4);
  const text = (ref: number): string => lineText(pool, pool.records[ref]!.line);
  const t0 = pool.file.groups[0]!.transactions[0]!;
  const t1 = pool.file.groups[0]!.transactions[1]!;
  const ack = (title: string, n: string): string => record('ACK', 0, 0, 159, [19, '20260101'], [27, '120000'], [33, '00001'], [38, '00000000'], [46, 'NWR'], [49, title], [109, n], [149, '20260102'], [157, 'AS']);
  const exc = record('EXC', 0, 0, 260, [19, 'OTHER TITLE']);
  const src = parse(
    assemble(pool, [
      {
        type: 'ACK',
        txns: [
          [ack('FIRST', 'N1'), text(t0.header), ...t0.records.map(text), exc],
          [ack('SECOND', 'N2'), text(t1.header), ...t1.records.map(text)],
        ],
      },
    ]),
  );
  const [ackA, excA, ackB] = src.file.groups[0]!.transactions;

  it('the source is an ACK that carries a work, the EXC that continues it, and another ACK', () => {
    expect(src.file.groups[0]!.transactions.map(t => src.records[t.header]!.type)).toEqual(['ACK', 'EXC', 'ACK']);
    expect(src.records[excA!.header]!.tseq).toBe(src.records[ackA!.header]!.tseq);
  });

  it.each([
    ['the EXC', () => [excA!.header]],
    ['the ACK it continues', () => [ackA!.header]],
    ['everything', () => [ackA!.header, excA!.header, ackB!.header]],
  ])('choosing %s is refused with a plain reason, naming the EXC, and no file', (_name, pick) => {
    const r = refused(run(src, pick(), { now: NOW }));
    expect(r.error.code).toBe('ack-continuation');
    expect(r.error.cause).toBeUndefined();
    expect(r.error.refs).toEqual([excA!.header]);
    expect(r.error.message).toMatch(/EXC/);
    expect(r.error.message).toMatch(/count/);
    expect('bytes' in r).toBe(false);
  });

  it('is refused before any work starts: the generator returns without a report', () => {
    const gen = extractWorksSteps(src, [excA!.header], { now: NOW });
    const first = gen.next();
    expect(first.done).toBe(true);
    expect(first.value).toMatchObject({ ok: false, error: { code: 'ack-continuation' } });
  });

  it('an ACK that carries a work and has no EXC is extracted as before, from the same file', () => {
    const r = ok(run(src, [ackB!.header], { now: NOW, keepHeader: true }));
    expect(r.addedToSelection).toEqual([]);
    expect(r.stats.transactions).toBe(1);
    expect(check(r.doc).summary.errors).toBe(0);
  });
});

describe('E5, case A: a file that mixes text encodings', () => {
  // Work 0's title holds the two bytes C3 A9 (read as Latin-1 they are two characters); work 1's holds a lone E9, which makes the file Latin-1.
  // Without that byte the new file is valid UTF-8, and a receiver that detects the encoding reads work 0's title one column narrower.
  const mixedFile = (extra?: (lines: string[]) => void): Uint8Array => {
    const lines = [...synthetic];
    lines[nwrAt[0]!] = lines[nwrAt[0]!]!.slice(0, 19) + 'CAF\u00c3\u00a9'.padEnd(60) + lines[nwrAt[0]!]!.slice(79);
    lines[nwrAt[1]!] = lines[nwrAt[1]!]!.slice(0, 19) + 'CAF\u00e9'.padEnd(60) + lines[nwrAt[1]!]!.slice(79);
    extra?.(lines);
    return latin1(lines.join(EOL) + EOL);
  };
  const mixed = parse(mixedFile());
  const [w0, w1, w2] = headersOf(mixed);
  const nwrBytes = (b: Uint8Array): number[] => {
    const raw = Buffer.from(b);
    const start = raw.indexOf('NWR00000000', 0, 'latin1');
    return [...raw.subarray(start, raw.indexOf('\r\n', start))];
  };

  it('the source is Latin-1', () => {
    expect(mixed.encoding).toBe('latin1');
  });

  it('the work with the UTF-8 bytes is refused: its file says what is wrong, and which lines', () => {
    const r = refused(run(mixed, [w0!], { now: NOW }));
    expect(r.error.code).toBe('encoding-differs');
    expect(r.error.cause).toBe('file');
    expect(r.error.lines).toEqual([nwrAt[0]]);
    expect(r.error.message).toMatch(/encodings/);
    expect('bytes' in r).toBe(false);
  });

  it('is the same through the generator, and with the work chosen together with an ASCII one', () => {
    const gen = extractWorksSteps(mixed, [w0!], { now: NOW });
    let step = gen.next();
    while (!step.done) step = gen.next();
    expect(refused(step.value).error.code).toBe('encoding-differs');
    expect(refused(run(mixed, [w0!, w2!], { now: NOW })).error.lines).toEqual([nwrAt[0]]);
  });

  it('every record that would be read differently is named, header included', () => {
    const doc = parse(
      mixedFile(l => {
        l[nwrAt[2]!] = l[nwrAt[2]!]!.slice(0, 19) + 'CAF\u00c3\u00a9'.padEnd(60) + l[nwrAt[2]!]!.slice(79);
        l[0] = l[0]!.slice(0, 20) + '\u00c3\u00a9' + l[0]!.slice(22);
      }),
    );
    const r = refused(run(doc, [headersOf(doc)[0]!, headersOf(doc)[2]!], { now: NOW }));
    expect(r.error.lines).toEqual([0, nwrAt[0], nwrAt[2]]);
  });

  it('the work with the lone E9 is extracted, its bytes are copied, and the new file is still Latin-1 when opened on its own', () => {
    const r = ok(run(mixed, [w1!], { now: NOW }));
    expect(r.checks.ok).toBe(true);
    expect(parse(r.bytes).encoding).toBe('latin1');
    expect(r.doc.encoding).toBe('latin1');
    const own = Buffer.from(mixed.bytes);
    const start = own.indexOf('NWR00000001', 0, 'latin1');
    const srcLine = [...own.subarray(start, own.indexOf('\r\n', start))];
    const raw = Buffer.from(r.bytes);
    const at = raw.indexOf('NWR00000000', 0, 'latin1');
    expect([...raw.subarray(at, raw.indexOf('\r\n', at))].slice(19)).toEqual(srcLine.slice(19));
    expect([...r.bytes]).toContain(0xe9);
  });

  it('both works are extracted when the lone E9 comes with the UTF-8 bytes: the new file is Latin-1 like the source', () => {
    const r = ok(run(mixed, [w0!, w1!], { now: NOW }));
    expect(parse(r.bytes).encoding).toBe('latin1');
    expect(nwrBytes(r.bytes).slice(19, 24)).toEqual([...Buffer.from('CAF\u00c3\u00a9', 'latin1')]);
    expect(verifyExtraction(mixed, r.selected, r.bytes).ok).toBe(true);
  });

  it('a work with no accented letter is extracted from the same file, and reads the same on its own', () => {
    const r = ok(run(mixed, [w2!], { now: NOW }));
    expect(r.checks.ok).toBe(true);
    expect(parse(r.bytes).encoding).toBe('ascii');
    expect(r.stats.outsideRecords).toBe(0);
  });

  it('a host that re-checks a file made of the first work finds the difference too: verifyExtraction reads it on its own', () => {
    // What an extraction of work 0 would write, built by hand from the source's own lines.
    const lines = (h: number): string[] => {
      const t = mixed.file.groups[0]!.transactions.find(x => x.header === h)!;
      return [t.header, ...t.records].map(ref => lineText(mixed, mixed.records[ref]!.line));
    };
    const bytes = assemble(mixed, [{ type: 'NWR', version: '02.20', txns: [lines(w0!)] }]);
    expect(parse(bytes).encoding).toBe('utf8');
    const checks = verifyExtraction(mixed, [w0!], bytes, { keepHeader: true });
    expect(checks.ok).toBe(false);
    expect(checks.bodies.ok).toBe(false);
    // The same bytes with the lone E9 of work 1 in them, as a second work, are read the way the source is.
    const both = assemble(mixed, [{ type: 'NWR', version: '02.20', txns: [lines(w0!), lines(w1!)] }]);
    expect(parse(both).encoding).toBe('latin1');
    expect(verifyExtraction(mixed, [w0!, w1!], both, { keepHeader: true }).ok).toBe(true);
  });

  it('a byte order mark changes nothing for a clean UTF-8 file, and a byte order mark over a stray byte is the same case as above', () => {
    const accented = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(dec(clean.bytes).replace('AMBER', 'CAF\u00c9 '), 'utf8')]);
    const bom = parse(accented);
    expect(bom.encoding).toBe('utf8');
    const r = ok(run(bom, [headersOf(bom)[0]!], { now: NOW }));
    expect(r.doc.bom).toBe(true);
    expect(parse(r.bytes).encoding).toBe('utf8');
    const plain = new Uint8Array([0xef, 0xbb, 0xbf, ...clean.bytes]);
    expect(parse(plain).encoding).toBe('utf8');
    expect(run(parse(plain), [headersOf(parse(plain))[0]!], { now: NOW }).ok).toBe(true);
    const stray = new Uint8Array([0xef, 0xbb, 0xbf, ...mixedFile()]);
    const strayDoc = parse(stray);
    expect(strayDoc.encoding).toBe('latin1');
    expect(refused(run(strayDoc, [headersOf(strayDoc)[0]!], { now: NOW })).error.code).toBe('encoding-differs');
    expect(run(strayDoc, [headersOf(strayDoc)[1]!], { now: NOW }).ok).toBe(true);
  });

  it('a UTF-8 file and an ASCII file are untouched: the bytes are copied, the encoding is the source\'s, and nothing is refused', () => {
    const utf8 = parse(new Uint8Array(Buffer.from(dec(clean.bytes).replace('AMBER', 'CAF\u00c9 '), 'utf8')));
    expect(utf8.encoding).toBe('utf8');
    const r = ok(run(utf8, [headersOf(utf8)[0]!], { now: NOW }));
    expect(r.doc.encoding).toBe('utf8');
    expect(r.checks.ok).toBe(true);
    expect(ok(run(clean, [headersOf(clean)[0]!], { now: NOW })).doc.encoding).toBe('ascii');
    // A UTF-8 file whose chosen works are all ASCII gives a file that reads the same as ASCII.
    const rest = ok(run(utf8, [headersOf(utf8)[3]!], { now: NOW }));
    expect(rest.checks.ok).toBe(true);
  });
});

describe('E5, case B: a header cut before its dates', () => {
  const cut = (length: number): CwrDoc => source(l => (l[0] = l[0]!.slice(0, length)));

  it('is refused with a code that says the file is the cause, and names the header line', () => {
    const doc = cut(70);
    const r = refused(run(doc, headersOf(doc).slice(0, 1), { now: NOW }));
    expect(r.error.code).toBe('short-header');
    expect(r.error.cause).toBe('file');
    expect(r.error.lines).toEqual([0]);
    expect(r.error.message).toMatch(/header/);
    expect('checks' in r).toBe(false);
  });

  it('is refused before any work starts', () => {
    const doc = cut(70);
    const first = extractWorksSteps(doc, headersOf(doc).slice(0, 1), { now: NOW }).next();
    expect(first.done).toBe(true);
  });

  it('is cut anywhere short of the last date: still refused; with keepHeader it is copied as it is', () => {
    for (const length of [3, 64, 65, 72, 85]) {
      const doc = cut(length);
      expect(refused(run(doc, headersOf(doc).slice(0, 1), { now: NOW })).error.code, `${length}`).toBe('short-header');
      expect(ok(run(doc, headersOf(doc).slice(0, 1), { now: NOW, keepHeader: true })).checks.ok, `${length}`).toBe(true);
    }
  });

  it('a header that reaches the dates is fine, even when it is shorter than the whole record', () => {
    for (const length of [86, 90, 110]) {
      const doc = cut(length);
      const r = ok(run(doc, headersOf(doc).slice(0, 1), { now: NOW }));
      expect(r.checks.ok, `${length}`).toBe(true);
    }
  });
});

describe('the cause of a refusal', () => {
  const six = synth('2.1', 6);

  it('is `file` for a missing header, a header cut short and a record too short, and absent (reads as `tool`) for the others', () => {
    const noHeader = parse(enc(six.lines.slice(1).map(l => l.text).join(EOL) + EOL));
    const shortRecord = ((): CwrDoc => {
      const lines = six.lines.map(l => l.text);
      lines[3] = lines[3]!.slice(0, 12);
      return parse(enc(lines.join(EOL) + EOL));
    })();
    expect(refused(run(six, [])).error).toMatchObject({ code: 'empty-selection' });
    expect(refused(run(six, [allSpu(six)])).error).toMatchObject({ code: 'not-a-transaction' });
    for (const e of [refused(run(six, [])).error, refused(run(six, [allSpu(six)])).error]) expect(e.cause ?? 'tool').toBe('tool');
    expect(refused(run(noHeader, headersOf(noHeader))).error).toMatchObject({ code: 'no-header', cause: 'file' });
    expect(refused(run(shortRecord, headersOf(shortRecord))).error).toMatchObject({ code: 'unnumberable-record', cause: 'file' });
  });
});

const allSpu = (doc: CwrDoc): RecRef => doc.records.findIndex(r => r.type === 'SPU');
