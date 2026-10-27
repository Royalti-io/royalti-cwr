import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  check,
  cleanIdentifiers,
  extractWorks,
  findDuplicates,
  findReplace,
  getField,
  parse,
  serialize,
  verifyExtraction,
  withoutLaterDuplicates,
  workSummaries,
} from '../../src/index';
import type { CwrDoc, ExtractSuccess, RecRef } from '../../src/index';
import { fixture, SAMPLE } from '../helpers';
import { allOf, assemble, dec, diffRuns, enc, expectReadsLikeSource, lineText, record, synth, withFields } from './support';

const NOW = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));

/** extractWorks; every extraction that succeeds is also opened on its own (no encoding given), as a receiver does, and must not show errors on a chosen work that the source did not have there. */
const extract = (doc: CwrDoc, pick: ReadonlyArray<RecRef> | ReadonlySet<RecRef>, options?: Parameters<typeof extractWorks>[2]): ReturnType<typeof extractWorks> => {
  const r = extractWorks(doc, pick, options);
  if (r.ok) expectReadsLikeSource(doc, r);
  return r;
};

const headersOf = (doc: CwrDoc): RecRef[] => doc.file.groups.flatMap(g => g.transactions.map(t => t.header));
const ok = (r: ReturnType<typeof extractWorks>): ExtractSuccess => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message} ${JSON.stringify(r.checks)}`);
  return r;
};
const bodies = (doc: CwrDoc, headers: RecRef[]): string[][] => {
  const set = new Set(headers);
  return doc.file.groups.flatMap(g =>
    g.transactions.filter(t => set.has(t.header)).map(t => [t.header, ...t.records].map(r => lineText(doc, doc.records[r]!.line).slice(19))),
  );
};
const problemKinds = (doc: CwrDoc): string[] => [...new Set(check(doc).problems.map(p => p.ruleId))].sort();

describe('extractWorks: a subset of a clean file', () => {
  const src = synth('2.1', 12, true);
  const picked = allOf(src, 'NWR').filter((_, i) => [1, 4, 5, 9].includes(i));
  const r = ok(extract(src, picked, { now: NOW }));

  it('builds a new file with the chosen works only, in file order', () => {
    expect(r.stats).toEqual({ groups: 1, transactions: 4, records: r.doc.records.length, droppedGroups: 0, outsideRecords: 0, outsideLines: [] });
    expect(r.selected).toEqual(picked);
    expect(r.addedToSelection).toEqual([]);
    expect(r.doc.file.groups).toHaveLength(1);
    expect(workSummaries(r.doc).map(w => w.title)).toEqual(workSummaries(src).filter(w => picked.includes(w.header)).map(w => w.title));
    expect(bodies(r.doc, headersOf(r.doc))).toEqual(bodies(src, picked));
  });

  it('numbers transactions from 0 and records from 0 in each transaction', () => {
    const txns = r.doc.file.groups[0]!.transactions;
    txns.forEach((t, i) => {
      const recs = [t.header, ...t.records].map(ref => r.doc.records[ref]!);
      expect(recs.map(x => x.tseq)).toEqual(recs.map(() => i));
      expect(recs.map(x => x.rseq)).toEqual(recs.map((_, k) => k));
    });
  });

  it('recomputes the group and file counts, and the structure checks find nothing', () => {
    const grt = r.doc.file.groups[0]!.grt!;
    const trl = r.doc.file.trl!;
    expect(getField(r.doc, grt, 'transactionCount')).toBe('00000004');
    expect(getField(r.doc, grt, 'recordCount')).toBe(String(r.doc.file.groups[0]!.grt! - r.doc.file.groups[0]!.grh + 1).padStart(8, '0'));
    expect(getField(r.doc, trl, 'groupCount')).toBe('00001');
    expect(getField(r.doc, trl, 'transactionCount')).toBe('00000004');
    expect(getField(r.doc, trl, 'recordCount')).toBe(String(r.doc.records.length).padStart(8, '0'));
    expect(check(r.doc).summary.errors).toBe(0);
    expect(problemKinds(r.doc)).toEqual(problemKinds(src));
  });

  it('sets the creation and transmission dates and the creation time, and nothing else in the header', () => {
    expect(r.headerChanged).toBe(true);
    const hdr = r.doc.file.hdr!;
    expect(getField(r.doc, hdr, 'creationDate')).toBe('20261026');
    expect(getField(r.doc, hdr, 'creationTime')).toBe('140509');
    expect(getField(r.doc, hdr, 'transmissionDate')).toBe('20261026');
    const a = enc(lineText(src, src.records[src.file.hdr!]!.line));
    const b = enc(lineText(r.doc, r.doc.records[hdr]!.line));
    expect(a.length).toBe(b.length);
    // 0-based character spans: date 64-72, time 72-78, transmission date 78-86.
    expect(diffRuns(a, b).every(([s, e]) => (s >= 64 && e <= 72) || (s >= 72 && e <= 78) || (s >= 78 && e <= 86))).toBe(true);
  });

  it('leaves the header as it is with keepHeader, and keeps the source untouched', () => {
    const before = Buffer.from(serialize(src));
    const kept = ok(extract(src, picked, { keepHeader: true }));
    expect(kept.headerChanged).toBe(false);
    expect(lineText(kept.doc, kept.doc.records[kept.doc.file.hdr!]!.line)).toBe(lineText(src, src.records[src.file.hdr!]!.line));
    expect(src.edits.size).toBe(0);
    expect(Buffer.from(serialize(src)).equals(before)).toBe(true);
  });

  it('writes bytes that parse and serialise to themselves, and record bodies identical byte for byte', () => {
    expect(Buffer.from(serialize(parse(r.bytes))).equals(Buffer.from(r.bytes))).toBe(true);
    const outTxns = r.doc.file.groups[0]!.transactions;
    picked.forEach((header, i) => {
      const s = src.file.groups[0]!.transactions.find(t => t.header === header)!;
      const srcRefs = [s.header, ...s.records];
      const outRefs = [outTxns[i]!.header, ...outTxns[i]!.records];
      expect(outRefs).toHaveLength(srcRefs.length);
      srcRefs.forEach((sr, k) => {
        const a = src.lines[src.records[sr]!.line]!;
        const b = r.doc.lines[r.doc.records[outRefs[k]!]!.line]!;
        const aBody = src.bytes.subarray(a.byteStart + 19, a.byteEnd - a.eol.length);
        const bBody = r.doc.bytes.subarray(b.byteStart + 19, b.byteEnd - b.eol.length);
        expect(Buffer.from(bBody).equals(Buffer.from(aBody))).toBe(true);
      });
    });
  });

  it('passes all three guardrails and can be re-verified from the bytes', () => {
    expect(r.checks).toEqual({ ok: true, reparse: { ok: true, problems: [], more: 0 }, structure: { ok: true, problems: [], more: 0 }, bodies: { ok: true, problems: [], more: 0 } });
    expect(verifyExtraction(src, r.selected, r.bytes).ok).toBe(true);
  });
});

describe('extractWorks: everything, header kept, is the source again', () => {
  const sources: Array<[string, CwrDoc]> = [
    ...(['2.1', '2.2'] as const).flatMap(v => [false, true].map(o => [`synthetic ${v}${o ? ' with other parties' : ''}`, synth(v, 11, o)] as [string, CwrDoc])),
    ['LF endings, no final newline', parse(enc(dec(synth('2.1', 6).bytes).replace(/\r\n/g, '\n').replace(/\n$/, '')))],
    ['200 works', synth('2.2', 200, true)],
  ];

  it.each(sources)('%s', (_name, doc) => {
    const r = ok(extract(doc, headersOf(doc), { keepHeader: true }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(doc.bytes))).toBe(true);
    expect(r.stats.droppedGroups).toBe(0);
  });
});

describe('extractWorks: several groups', () => {
  const pool = synth('2.1', 9, true);
  const work = (i: number, type = 'NWR'): string[] => {
    const t = pool.file.groups[0]!.transactions[i]!;
    return [t.header, ...t.records].map((r, k) => (k === 0 ? type + lineText(pool, pool.records[r]!.line).slice(3) : lineText(pool, pool.records[r]!.line)));
  };
  const src = parse(
    assemble(pool, [
      { type: 'NWR', txns: [work(0), work(1), work(2)] },
      { type: 'REV', txns: [work(3, 'REV'), work(4, 'REV')] },
      { type: 'ISW', txns: [work(5, 'ISW'), work(6, 'ISW'), work(7, 'ISW')] },
    ]),
  );
  const g = (gi: number, ti: number): RecRef => src.file.groups[gi]!.transactions[ti]!.header;

  it('the source is a clean three-group file', () => {
    expect(src.file.groups.map(x => [x.type, x.transactions.length])).toEqual([['NWR', 3], ['REV', 2], ['ISW', 3]]);
    expect(check(src).summary.errors).toBe(0);
  });

  it('drops a group with nothing chosen, renumbers the group ids and restarts transaction numbers', () => {
    const r = ok(extract(src, [g(0, 1), g(2, 0), g(2, 2)], { keepHeader: true }));
    expect(r.stats).toMatchObject({ groups: 2, transactions: 3, droppedGroups: 1 });
    expect(r.doc.file.groups.map(x => [x.type, x.transactions.length])).toEqual([['NWR', 1], ['ISW', 2]]);
    expect(r.doc.file.groups.map(x => getField(r.doc, x.grh, 'groupId'))).toEqual(['00001', '00002']);
    expect(r.doc.file.groups.map(x => getField(r.doc, x.grt!, 'groupId'))).toEqual(['00001', '00002']);
    expect(r.doc.file.groups.map(x => getField(r.doc, x.grt!, 'transactionCount'))).toEqual(['00000001', '00000002']);
    expect(r.doc.file.groups[1]!.transactions.map(t => r.doc.records[t.header]!.tseq)).toEqual([0, 1]);
    expect(getField(r.doc, r.doc.file.trl!, 'groupCount')).toBe('00002');
    expect(getField(r.doc, r.doc.file.trl!, 'transactionCount')).toBe('00000003');
    expect(check(r.doc).summary.errors).toBe(0);
  });

  it('choosing from one group only gives one group, numbered 1', () => {
    const r = ok(extract(src, [g(1, 0), g(1, 1)], { keepHeader: true }));
    expect(r.doc.file.groups).toHaveLength(1);
    expect(r.doc.file.groups[0]!.type).toBe('REV');
    expect(getField(r.doc, r.doc.file.groups[0]!.grh, 'groupId')).toBe('00001');
    expect(r.stats.droppedGroups).toBe(2);
    expect(check(r.doc).summary.errors).toBe(0);
  });

  it('keeps the source order whatever order the selection is in, and ignores repeats', () => {
    const r = ok(extract(src, new Set([g(2, 2), g(0, 0), g(0, 0), g(1, 1)]), { keepHeader: true }));
    expect(r.selected).toEqual([g(0, 0), g(1, 1), g(2, 2)]);
    expect(r.doc.file.groups.map(x => x.type)).toEqual(['NWR', 'REV', 'ISW']);
  });
});

describe('extractWorks: a damaged source', () => {
  const doc = parse(fixture(SAMPLE));
  /** The transactions of the sample that hold a record numbered for another transaction than the one it sits in. */
  const numberedForOthers = doc.file.groups.flatMap(g => g.transactions).filter(t => doc.records[t.header]!.tseq !== undefined && t.records.some(r => doc.records[r]!.tseq !== undefined && doc.records[r]!.tseq !== doc.records[t.header]!.tseq));
  const sound = headersOf(doc).filter(h => !numberedForOthers.some(t => t.header === h));

  it('the sample has two transactions that hold records numbered for other transactions, and no other kind of that fault', () => {
    expect(numberedForOthers.map(t => doc.records[t.header]!.line + 1)).toEqual([46, 1593]);
    expect(sound).toHaveLength(98);
  });

  it('renumbers and recounts the sample except for the transactions that hold such records, and keeps the findings that belong to the records', () => {
    const all = ok(extract(doc, sound, { now: NOW }));
    expect(all.stats.transactions).toBe(98);
    expect(all.checks.ok).toBe(true);
    // The sample has bad sequence numbers and wrong counts; the output has none of those.
    const framing = ['PFX-2', 'PFX-3', 'PFX-4', 'PFX-5', 'PFX-6', 'GRT-F-002', 'GRT-F-003', 'TRL-F-002', 'TRL-F-003'];
    expect(problemKinds(doc).some(k => framing.includes(k))).toBe(true);
    expect(problemKinds(all.doc).filter(k => framing.includes(k))).toEqual([]);
    // Findings inside records survive: the unknown record types are still there.
    const inChosen = new Set(sound.flatMap(h => [h, ...doc.file.groups.flatMap(g => g.transactions).find(t => t.header === h)!.records].map(r => doc.records[r]!.line)));
    expect(check(all.doc).problems.filter(p => p.ruleId === 'STR-F-001')).toHaveLength(check(doc).problems.filter(p => p.ruleId === 'STR-F-001' && inChosen.has(p.line)).length);
    // The bodies are the source's, but for the record whose own number is not a number: that one is copied whole, so its number stays.
    const want = bodies(doc, sound);
    const got = bodies(all.doc, headersOf(all.doc));
    expect(got).toHaveLength(want.length);
    got.forEach((txn, i) => expect(txn, `transaction ${i}`).toEqual(want[i]));
  });

  it('refuses the transactions that hold a record numbered for another transaction, and names where', () => {
    for (const pick of [headersOf(doc), numberedForOthers.map(t => t.header), [numberedForOthers[0]!.header, sound[0]!]]) {
      const r = extract(doc, pick, { keepHeader: true });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error).toMatchObject({ code: 'guardrail', cause: 'file' });
      expect(r.checks?.structure.problems[0]).toMatch(/^Source line 47: /);
    }
  });

  it('extracts any slice of the sample that avoids them without a guardrail firing', () => {
    for (const pick of [sound.slice(0, 1), sound.slice(40, 60), sound.filter((_, i) => i % 3 === 0), sound.slice(-5)]) {
      const r = extract(doc, pick, { keepHeader: true });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
  });

  it('drops blank lines inside a transaction and records outside any', () => {
    const clean = synth('2.1', 3);
    const lines = clean.lines.map(l => l.text);
    lines.splice(4, 0, '   ', '');
    const doc = parse(enc(lines.join('\r\n') + '\r\n'));
    expect(doc.lines.length).toBe(clean.lines.length + 2);
    const r = ok(extract(doc, headersOf(doc), { keepHeader: true }));
    expect(r.doc.lines.length).toBe(clean.lines.length);
    expect(Buffer.from(r.bytes).equals(Buffer.from(clean.bytes))).toBe(true);
  });
});

describe('extractWorks: ACK transactions', () => {
  const pool = synth('2.1', 4);
  const text = (ref: number): string => lineText(pool, pool.records[ref]!.line);
  const t0 = pool.file.groups[0]!.transactions[0]!;
  const t1 = pool.file.groups[0]!.transactions[1]!;
  const ack = (title: string, n: string): string => record('ACK', 0, 0, 159, [19, '20260101'], [27, '120000'], [33, '00001'], [38, '00000000'], [46, 'NWR'], [49, title], [109, n], [149, '20260102'], [157, 'AS']);
  const msg = record('MSG', 0, 1, 185, [19, 'E'], [20, '00000002'], [28, 'NWR'], [31, 'T'], [32, '001'], [35, 'A MESSAGE']);
  const exc = record('EXC', 0, 0, 260, [19, 'OTHER TITLE']);
  const src = parse(
    assemble(pool, [
      {
        type: 'ACK',
        txns: [
          [ack('FIRST', 'N1'), msg, text(t0.header), ...t0.records.map(text), exc],
          [ack('SECOND', 'N2'), text(t1.header), ...t1.records.map(text)],
        ],
      },
    ]),
  );

  it('the source is read as an ACK that carries a work and an EXC that continues it', () => {
    const txns = src.file.groups[0]!.transactions;
    expect(txns.map(t => src.records[t.header]!.type)).toEqual(['ACK', 'EXC', 'ACK']);
    expect(txns[0]!.inner).toHaveLength(1);
  });

  it('an EXC that continues an ACK is refused, and so is the ACK it continues: the count for the pair is not settled', () => {
    const [ackA, excA] = src.file.groups[0]!.transactions;
    for (const pick of [[excA!.header], [ackA!.header], headersOf(src)]) {
      const r = extract(src, pick, { keepHeader: true });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: 'ack-continuation', refs: [excA!.header] });
    }
  });

  it('an ACK that carries a work and has no EXC is extracted, numbered from 0 like any transaction', () => {
    const [, , ackB] = src.file.groups[0]!.transactions;
    const second = ok(extract(src, [ackB!.header], { keepHeader: true }));
    expect(second.addedToSelection).toEqual([]);
    expect(second.doc.records[second.doc.file.groups[0]!.transactions[0]!.header]!.tseq).toBe(0);
    expect(check(second.doc).summary.errors).toBe(0);
  });

  it('a file of ACKs that carry works, with no EXC, comes back byte for byte when everything is extracted', () => {
    const plain = parse(
      assemble(pool, [{ type: 'ACK', txns: [[ack('FIRST', 'N1'), text(t0.header), ...t0.records.map(text)], [ack('SECOND', 'N2'), msg, text(t1.header), ...t1.records.map(text)]] }]),
    );
    const r = ok(extract(plain, headersOf(plain), { keepHeader: true }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(plain.bytes))).toBe(true);
    // And the result is a fixed point.
    const again = ok(extract(r.doc, headersOf(r.doc), { keepHeader: true }));
    expect(Buffer.from(again.bytes).equals(Buffer.from(r.bytes))).toBe(true);
  });
});

describe('extractWorks: requests it refuses', () => {
  const src = synth('2.1', 4);

  it('an empty selection', () => {
    const r = extract(src, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('empty-selection');
  });

  it('a record that is not the header of a transaction, or that does not exist', () => {
    const spu = allOf(src, 'SPU')[0]!;
    for (const bad of [spu, 9999, -1]) {
      const r = extract(src, [headersOf(src)[0]!, bad]);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('not-a-transaction');
        expect(r.error.refs).toEqual([bad]);
      }
    }
  });

  it('a file with no header record', () => {
    const doc = parse(enc(src.lines.slice(1).map(l => l.text).join('\r\n') + '\r\n'));
    const r = extract(doc, headersOf(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no-header');
  });

  it('a record too short to carry a sequence prefix, naming the line', () => {
    const lines = src.lines.map(l => l.text);
    lines[3] = lines[3]!.slice(0, 12);
    const doc = parse(enc(lines.join('\r\n') + '\r\n'));
    const r = extract(doc, headersOf(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('unnumberable-record');
      expect(r.error.lines).toEqual([3]);
    }
    // A transaction without the short record is fine.
    expect(extract(doc, [headersOf(doc)[1]!]).ok).toBe(true);
  });

  it('does not touch the source when it refuses', () => {
    extract(src, []);
    expect(src.edits.size).toBe(0);
  });
});

describe('extractWorks: encodings and edits', () => {
  it('keeps UTF-8 text and the byte order mark', () => {
    const doc0 = synth('2.1', 3);
    const utf8Text = dec(doc0.bytes).replace('AMBER HARBOUR 00001', 'CAFÉ HARBOUR 00001'.padEnd(19, ' '));
    const body = new TextEncoder().encode(utf8Text);
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    const doc = parse(bytes);
    expect(doc.encoding).toBe('utf8');
    const r = ok(extract(doc, headersOf(doc), { keepHeader: true }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(bytes))).toBe(true);
    const one = ok(extract(doc, [headersOf(doc)[0]!], { keepHeader: true }));
    expect(Array.from(one.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(one.bytes)).toContain('CAFÉ HARBOUR 00001');
  });

  it('keeps Latin-1 bytes', () => {
    const doc0 = synth('2.1', 3);
    const bytes = doc0.bytes.slice();
    const at = dec(bytes).indexOf('AMBER');
    bytes[at + 1] = 0xe9;
    const doc = parse(bytes);
    expect(doc.encoding).toBe('latin1');
    const r = ok(extract(doc, [headersOf(doc)[0]!, headersOf(doc)[2]!], { keepHeader: true }));
    expect(r.bytes.includes(0xe9)).toBe(true);
    expect(r.doc.encoding).toBe('latin1');
  });

  it('extracts the text as it now stands, pending edits included', () => {
    const messy = withFields(synth('2.1', 6), [[allOf(synth('2.1', 6), 'SPU')[1]!, 'publisherIpiNameNumber', '123471']]);
    const renamed = findReplace(messy, { fields: ['workTitle'], find: 'HARBOUR', replace: 'QUAY', mode: 'substring', apply: true }).doc!;
    const cleaned = cleanIdentifiers(renamed, { apply: true }).doc!;
    expect(cleaned.edits.size).toBeGreaterThan(1);
    const r = ok(extract(cleaned, headersOf(cleaned), { keepHeader: true }));
    expect(Buffer.from(r.bytes).equals(Buffer.from(serialize(cleaned)))).toBe(true);
    expect(dec(r.bytes)).toContain('AMBER QUAY 00001');
    expect(dec(r.bytes)).toContain('00000123471');
    expect(dec(messy.bytes)).not.toContain('QUAY');
  });
});

describe('extractWorks: random selections keep every promise', () => {
  const pool = synth('2.2', 14, true);
  const work = (i: number, type: string): string[] => {
    const t = pool.file.groups[0]!.transactions[i]!;
    return [t.header, ...t.records].map((r, k) => (k === 0 ? type + lineText(pool, pool.records[r]!.line).slice(3) : lineText(pool, pool.records[r]!.line)));
  };
  const src = parse(
    assemble(
      pool,
      [
        { type: 'NWR', version: '02.20', txns: [0, 1, 2, 3, 4].map(i => work(i, 'NWR')) },
        { type: 'REV', version: '02.20', txns: [5, 6, 7, 8].map(i => work(i, 'REV')) },
        { type: 'ISW', version: '02.20', txns: [9, 10, 11, 12, 13].map(i => work(i, 'ISW')) },
      ],
      '\n',
    ),
  );
  const hs = headersOf(src);

  it('for any non-empty selection: guardrails pass, order and bodies are kept, counts and numbers are right', () => {
    fc.assert(
      fc.property(fc.subarray(hs, { minLength: 1 }), fc.boolean(), picked => {
        const keepHeader = picked.length % 2 === 0;
        const r = extractWorks(src, picked, { keepHeader, now: NOW });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.selected).toEqual([...picked].sort((a, b) => a - b));
        expect(bodies(r.doc, headersOf(r.doc))).toEqual(bodies(src, r.selected));
        expect(r.doc.orphans).toEqual([]);
        expect(r.doc.file.groups.map(g => g.transactions.length).reduce((a, b) => a + b, 0)).toBe(picked.length);
        expect(check(r.doc).summary.errors).toBe(0);
        expect(verifyExtraction(src, r.selected, r.bytes, { keepHeader }).ok).toBe(true);
        expect(Buffer.from(serialize(parse(r.bytes))).equals(Buffer.from(r.bytes))).toBe(true);
        // Selecting what was extracted, from the output, gives the output again (the operation is stable).
        const again = extractWorks(r.doc, headersOf(r.doc), { keepHeader: true });
        expect(again.ok && Buffer.from(again.bytes).equals(Buffer.from(r.bytes))).toBe(true);
      }),
      { numRuns: 60, seed: 20261026 },
    );
  });

  it('is the same as extracting after removing duplicates', () => {
    const dup = withFields(synth('2.1', 6), [[allOf(synth('2.1', 6), 'NWR')[3]!, 'submitterWorkNumber', 'SYN000001']]);
    const keep = withoutLaterDuplicates(dup);
    const r = ok(extractWorks(dup, keep, { keepHeader: true }));
    expect(r.stats.transactions).toBe(5);
    expect(findDuplicates(r.doc).groups).toEqual([]);
  });
});
