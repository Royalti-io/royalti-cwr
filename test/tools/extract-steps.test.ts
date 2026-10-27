import { describe, expect, it } from 'vitest';
import { check, extractWorks, extractWorksSteps, getField, parse, specLayouts, verifyExtraction } from '../../src/index';
import type { CwrDoc, ExtractResult, ExtractSuccess, LayoutProvider, Progress, RecRef } from '../../src/index';
import { allOf, assemble, dec, enc, lineText, record, synth } from './support';

/**
 * extractWorksSteps on the requests extract has to refuse, and on the structure it has to rebuild: every error code, records
 * outside any transaction, groups that disappear, and the counts in the group and file trailers. Each case goes through the
 * generator and through the one-shot function, and the two must agree.
 */

const NOW = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));
const headersOf = (doc: CwrDoc): RecRef[] => doc.file.groups.flatMap(g => g.transactions.map(t => t.header));

function run(gen: Generator<Progress, ExtractResult, void>): { progress: Progress[]; value: ExtractResult } {
  const progress: Progress[] = [];
  for (;;) {
    const next = gen.next();
    if (next.done) return { progress, value: next.value };
    progress.push(next.value);
  }
}
const ok = (r: ExtractResult): ExtractSuccess => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message} ${JSON.stringify(r.checks)}`);
  return r;
};
const field = (doc: CwrDoc, ref: RecRef | undefined, id: string): string => getField(doc, ref!, id) ?? '';

describe('every refusal extractWorks has, through the generator', () => {
  const src = synth('2.1', 6);

  // A source whose group transaction count field is one digit wide: six transactions fit, twelve would not. (Fits: the count is written as 6.)
  const narrow: LayoutProvider = {
    getLayout: (version, type) => {
      const layout = specLayouts.getLayout(version, type);
      return layout && type === 'GRT' ? { ...layout, fields: layout.fields.map(f => (f.id === 'transactionCount' ? { ...f, end: f.start + 1 } : f)) } : layout;
    },
    isRecordType: (version, type) => specLayouts.isRecordType(version, type),
  };
  const overflowing = parse(synth('2.1', 12).bytes, { layouts: narrow });

  // An ASCII file with a pending edit that ASCII cannot hold.
  const unencodable = parse(src.bytes);
  const nwr = allOf(unencodable, 'NWR')[1]!;
  const nwrLine = unencodable.records[nwr]!.line;
  unencodable.edits.set(nwrLine, lineText(unencodable, nwrLine).slice(0, 22) + '☃' + lineText(unencodable, nwrLine).slice(23));

  const shortRecord = ((): CwrDoc => {
    const lines = src.lines.map(l => l.text);
    lines[3] = lines[3]!.slice(0, 12);
    return parse(enc(lines.join('\r\n') + '\r\n'));
  })();
  const noHeader = parse(enc(src.lines.slice(1).map(l => l.text).join('\r\n') + '\r\n'));

  const cases: Array<{ code: string; doc: CwrDoc; selection: RecRef[]; yields: boolean; check?: (r: ExtractResult) => void }> = [
    { code: 'empty-selection', doc: src, selection: [], yields: false },
    { code: 'not-a-transaction', doc: src, selection: [headersOf(src)[0]!, allOf(src, 'SPU')[0]!], yields: false, check: r => expect(!r.ok && r.error.refs).toEqual([allOf(src, 'SPU')[0]]) },
    { code: 'no-header', doc: noHeader, selection: headersOf(noHeader), yields: false },
    { code: 'unnumberable-record', doc: shortRecord, selection: headersOf(shortRecord), yields: false, check: r => expect(!r.ok && r.error.lines).toEqual([3]) },
    { code: 'count-overflow', doc: overflowing, selection: headersOf(overflowing), yields: true },
    { code: 'not-encodable', doc: unencodable, selection: headersOf(unencodable), yields: true },
  ];

  it.each(cases)('$code: the same answer as the one-shot function, $yields reports before it', ({ code, doc, selection, yields, check: more }) => {
    const { progress, value } = run(extractWorksSteps(doc, selection, { now: NOW }));
    expect(value.ok).toBe(false);
    if (value.ok) return;
    expect(value.error.code).toBe(code);
    expect(extractWorks(doc, selection, { now: NOW })).toEqual(value);
    expect(progress.length > 0).toBe(yields);
    more?.(value);
  });

  it('count-overflow is only the count that does not fit; the same source with fewer transactions is extracted', () => {
    const fewer = headersOf(overflowing).slice(0, 5);
    expect(ok(extractWorks(overflowing, fewer, { now: NOW })).stats.transactions).toBe(5);
  });

  it('none of them touches the source', () => {
    for (const { doc, selection } of cases) {
      const before = Buffer.from(doc.bytes);
      const edits = doc.edits.size;
      run(extractWorksSteps(doc, selection));
      expect(doc.edits.size).toBe(edits);
      expect(Buffer.from(doc.bytes).equals(before)).toBe(true);
    }
  });
});

describe('records outside any transaction', () => {
  const clean = synth('2.1', 6, true);
  const stray = (n: number): string => record('SWR', n, n, 200, [19, 'STRAY']);
  // A stray record before the first group and another between two groups, in a file whose counts are therefore wrong.
  const lines = clean.lines.map(l => l.text);
  const firstGrt = lines.findIndex(l => l.startsWith('GRT'));
  const withStrays = ((): string[] => {
    const out = [...lines];
    out.splice(firstGrt + 1, 0, stray(77));
    out.splice(1, 0, stray(88));
    return out;
  })();
  const src = parse(enc(withStrays.join('\r\n') + '\r\n'));

  it('the source has the stray records outside every transaction', () => {
    expect(src.orphans.length).toBeGreaterThanOrEqual(2);
  });

  it('extracting everything drops them, rewrites the counts, and gives the clean file back', () => {
    const { value } = run(extractWorksSteps(src, headersOf(src), { keepHeader: true }));
    const r = ok(value);
    expect(r.doc.orphans).toEqual([]);
    expect(dec(r.bytes)).not.toContain('STRAY');
    expect(Buffer.from(r.bytes).equals(Buffer.from(clean.bytes))).toBe(true);
    expect(check(r.doc).summary.errors).toBe(0);
    expect(r.checks.ok).toBe(true);
  });

  it('extracting some works drops them too, and the record count in the file trailer is the output', () => {
    const picked = headersOf(src).filter((_, i) => i % 2 === 0);
    const r = ok(run(extractWorksSteps(src, picked, { keepHeader: true })).value);
    expect(r.doc.orphans).toEqual([]);
    expect(field(r.doc, r.doc.file.trl, 'recordCount')).toBe(String(r.doc.records.length).padStart(8, '0'));
    expect(verifyExtraction(src, r.selected, r.bytes, { keepHeader: true })).toEqual(r.checks);
  });

  it('choosing the EXC that carries on an ACK is refused before any work starts, naming the EXC', () => {
    const pool = synth('2.1', 2);
    const text = (ref: number): string => lineText(pool, pool.records[ref]!.line);
    const t0 = pool.file.groups[0]!.transactions[0]!;
    const ack = record('ACK', 0, 0, 159, [19, '20260101'], [27, '120000'], [33, '00001'], [38, '00000000'], [46, 'NWR'], [49, 'FIRST'], [109, 'N1'], [149, '20260102'], [157, 'AS']);
    const exc = record('EXC', 0, 0, 260, [19, 'OTHER TITLE']);
    const doc = parse(assemble(pool, [{ type: 'ACK', txns: [[ack, text(t0.header), ...t0.records.map(text), exc]] }]));
    const [, excTxn] = doc.file.groups[0]!.transactions;
    const { progress, value } = run(extractWorksSteps(doc, [excTxn!.header], { keepHeader: true }));
    expect(value.ok).toBe(false);
    if (!value.ok) expect(value.error).toMatchObject({ code: 'ack-continuation', refs: [excTxn!.header] });
    expect(progress).toEqual([]);
  });
});

describe('groups that change and the counts in the trailers', () => {
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
  const recordsOf = (doc: CwrDoc, gi: number): number => doc.file.groups[gi]!.grt! - doc.file.groups[gi]!.grh + 1;

  it('losing a group changes the group count, the group ids, the transaction count and the record counts', () => {
    const r = ok(run(extractWorksSteps(src, [g(0, 2), g(2, 0), g(2, 1)], { keepHeader: true })).value);
    const doc = r.doc;
    expect(doc.file.groups.map(x => x.type)).toEqual(['NWR', 'ISW']);
    expect(doc.file.groups.map(x => field(doc, x.grh, 'groupId'))).toEqual(['00001', '00002']);
    expect(doc.file.groups.map(x => field(doc, x.grt, 'groupId'))).toEqual(['00001', '00002']);
    expect(doc.file.groups.map(x => field(doc, x.grt, 'transactionCount'))).toEqual(['00000001', '00000002']);
    expect(doc.file.groups.map(x => field(doc, x.grt, 'recordCount'))).toEqual([0, 1].map(i => String(recordsOf(doc, i)).padStart(8, '0')));
    expect(field(doc, doc.file.trl, 'groupCount')).toBe('00002');
    expect(field(doc, doc.file.trl, 'transactionCount')).toBe('00000003');
    expect(field(doc, doc.file.trl, 'recordCount')).toBe(String(doc.records.length).padStart(8, '0'));
    expect(r.stats.droppedGroups).toBe(1);
    expect(r.checks.structure.ok).toBe(true);
  });

  it('the source counts were right for the source and are wrong for any smaller file: they are recomputed, never copied', () => {
    const r = ok(run(extractWorksSteps(src, [g(1, 0)], { keepHeader: true })).value);
    expect(field(src, src.file.trl, 'groupCount')).toBe('00003');
    expect(field(r.doc, r.doc.file.trl, 'groupCount')).toBe('00001');
    expect(field(src, src.file.trl, 'transactionCount')).toBe('00000008');
    expect(field(r.doc, r.doc.file.trl, 'transactionCount')).toBe('00000001');
    expect(field(src, src.file.trl, 'recordCount')).not.toBe(field(r.doc, r.doc.file.trl, 'recordCount'));
  });

  it('a stale count in the source does not get into the output', () => {
    const lines = dec(src.bytes).split('\r\n');
    const i = lines.findIndex(l => l.startsWith('TRL'));
    lines[i] = lines[i]!.slice(0, 8) + '00000099' + lines[i]!.slice(16);
    const j = lines.findIndex(l => l.startsWith('GRT'));
    lines[j] = lines[j]!.slice(0, 8) + '00000099' + lines[j]!.slice(16);
    const stale = parse(enc(lines.join('\r\n')));
    const r = ok(run(extractWorksSteps(stale, headersOf(stale), { keepHeader: true })).value);
    expect(Buffer.from(r.bytes).equals(Buffer.from(src.bytes))).toBe(true);
    expect(check(r.doc).summary.errors).toBe(0);
  });

  it('the generator and the one-shot function give the same bytes for every choice of one work from each group', () => {
    for (const a of [0, 1, 2]) for (const b of [0, 1]) for (const c of [0, 1, 2]) {
      const pick = [g(0, a), g(1, b), g(2, c)];
      const stepped = ok(run(extractWorksSteps(src, pick, { now: NOW })).value);
      expect(Buffer.from(stepped.bytes).equals(Buffer.from(ok(extractWorks(src, pick, { now: NOW })).bytes))).toBe(true);
      expect(stepped.stats).toMatchObject({ groups: 3, transactions: 3, droppedGroups: 0 });
    }
  });
});
