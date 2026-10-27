import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  createCancelToken,
  extractWorks,
  extractWorksSteps,
  findDuplicates,
  findDuplicatesSteps,
  ownedShares,
  ownedSharesSteps,
  parse,
  serialize,
  worksCsv,
  worksCsvSteps,
} from '../../src/index';
import type { CwrDoc, ExtractResult, ExtractSuccess, Progress, ProgressTask, RecRef, RunOptions } from '../../src/index';
import { fixture, SAMPLE } from '../helpers';
import { allOf, assemble, dec, enc, lineText, record, synth, withFields } from './support';

/**
 * The four step generators (CR-T1). Each is shaped like `checkSteps`: it yields a Progress between steps and returns what the
 * one-shot function returns. These tests pin that the final value is the one-shot's, that progress is well formed, and that a
 * stopped run leaves nothing behind.
 */

const NOW = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));
const headersOf = (doc: CwrDoc): RecRef[] => doc.file.groups.flatMap(g => g.transactions.map(t => t.header));

/** Runs a generator to its end and keeps every Progress it yielded. */
function run<T>(gen: Generator<Progress, T, void>): { progress: Progress[]; value: T } {
  const progress: Progress[] = [];
  for (;;) {
    const next = gen.next();
    if (next.done) return { progress, value: next.value };
    progress.push(next.value);
  }
}

/** What every progress list has in common: the task, the stages in order, numbers that make sense, and a fraction that never goes down. */
function expectWellFormed(progress: Progress[], task: ProgressTask, stages: string[]): void {
  expect(progress.length).toBeGreaterThan(0);
  const seen: string[] = [];
  let fraction = -1;
  let doneInStage = -1;
  for (const p of progress) {
    expect(p.task).toBe(task);
    expect(Number.isInteger(p.done)).toBe(true);
    expect(p.done).toBeGreaterThanOrEqual(0);
    expect(p.done).toBeLessThanOrEqual(p.total);
    expect(p.fraction).toBeGreaterThanOrEqual(0);
    expect(p.fraction).toBeLessThanOrEqual(1);
    expect(p.fraction).toBeGreaterThanOrEqual(fraction);
    if (seen[seen.length - 1] !== p.stage) {
      expect(seen).not.toContain(p.stage); // a stage is one run, never revisited
      seen.push(p.stage);
      doneInStage = -1;
    }
    expect(p.done).toBeGreaterThanOrEqual(doneInStage);
    doneInStage = p.done;
    fraction = p.fraction;
  }
  expect(seen).toEqual(stages);
  expect(progress[0]!.fraction).toBe(0);
  expect(progress[progress.length - 1]!.fraction).toBe(1);
  const last = progress[progress.length - 1]!;
  expect(last.done).toBe(last.total);
}

/** The bytes and structure of a document, for "...". */
function snapshot(doc: CwrDoc): { bytes: Buffer; serialized: Buffer; edits: number; records: number; lines: number; file: string } {
  return {
    bytes: Buffer.from(doc.bytes),
    serialized: Buffer.from(serialize(doc)),
    edits: doc.edits.size,
    records: doc.records.length,
    lines: doc.lines.length,
    file: JSON.stringify(doc.file),
  };
}

/** A parse whose records, lines and structure refuse every write, so a tool that touches the document throws. */
function frozen(bytes: Uint8Array): CwrDoc {
  const doc = parse(bytes);
  const freeze = (o: unknown): void => {
    if (o === null || typeof o !== 'object' || ArrayBuffer.isView(o) || Object.isFrozen(o)) return;
    Object.freeze(o);
    for (const v of Object.values(o)) freeze(v);
  };
  freeze(doc.records);
  freeze(doc.lines);
  freeze(doc.file);
  freeze(doc.orphans);
  return doc;
}

const ackSource = (): Uint8Array => {
  const pool = synth('2.1', 4);
  const text = (ref: number): string => lineText(pool, pool.records[ref]!.line);
  const t0 = pool.file.groups[0]!.transactions[0]!;
  const ack = record('ACK', 0, 0, 159, [19, '20260101'], [27, '120000'], [33, '00001'], [38, '00000000'], [46, 'NWR'], [49, 'FIRST'], [109, 'N1'], [149, '20260102'], [157, 'AS']);
  const exc = record('EXC', 0, 0, 260, [19, 'OTHER TITLE']);
  return assemble(pool, [{ type: 'ACK', txns: [[ack, text(t0.header), ...t0.records.map(text), exc]] }]);
};

const sources: Array<[string, Uint8Array]> = [
  ['synthetic 2.1, 12 works', synth('2.1', 12).bytes],
  ['synthetic 2.2 with other parties, 400 works', synth('2.2', 400, true).bytes],
  ['the public sample (damaged on purpose)', fixture(SAMPLE)],
  ['duplicates planted', withFields(synth('2.1', 20), [[allOf(synth('2.1', 20), 'NWR')[3]!, 'submitterWorkNumber', 'SYN000001']]).bytes],
  ['LF endings, no final newline', enc(dec(synth('2.1', 6).bytes).replace(/\r\n/g, '\n').replace(/\n$/, ''))],
  ['an ACK that carries a work, and the EXC that continues it', ackSource()],
];

describe('findDuplicatesSteps, ownedSharesSteps and worksCsvSteps return what the one-shot functions return', () => {
  it.each(sources)('%s', (_name, bytes) => {
    const doc = parse(bytes);
    expect(run(findDuplicatesSteps(doc)).value).toEqual(findDuplicates(doc));
    expect(run(ownedSharesSteps(doc)).value).toEqual(ownedShares(doc));
    const csv = run(worksCsvSteps(doc)).value;
    expect(Buffer.from(csv).equals(Buffer.from(worksCsv(doc)))).toBe(true);
  });

  it('the one-shot functions give the same answers on a document that is edited and then stepped again', () => {
    const doc = withFields(synth('2.1', 30), [[allOf(synth('2.1', 30), 'NWR')[2]!, 'workTitle', 'EDITED TITLE']]);
    const again = run(worksCsvSteps(doc)).value;
    expect(Buffer.from(again).equals(Buffer.from(worksCsv(doc)))).toBe(true);
    expect(dec(again)).toContain('EDITED TITLE');
  });
});

describe('progress of the three read-only tools', () => {
  const doc = parse(synth('2.2', 1500, true).bytes);

  it('duplicates: works, then groups; a report every 256 transactions', () => {
    const { progress } = run(findDuplicatesSteps(doc));
    expectWellFormed(progress, 'duplicates', ['works', 'groups']);
    expect(progress.length).toBeGreaterThan(5);
    expect(progress.filter(p => p.stage === 'works')[0]!.total).toBe(1500);
  });

  it('owned shares: one stage, works', () => {
    const { progress } = run(ownedSharesSteps(doc));
    expectWellFormed(progress, 'owned-shares', ['works']);
    expect(progress.length).toBeGreaterThan(5);
    expect(progress[0]!.total).toBe(1500);
  });

  it('works CSV: reading the works, then writing the rows', () => {
    const { progress } = run(worksCsvSteps(doc));
    expectWellFormed(progress, 'works-csv', ['works', 'rows']);
    expect(progress.filter(p => p.stage === 'rows').length).toBeGreaterThan(1);
    // Reading is a share of the bar, not all of it: the first rows report starts where reading stopped.
    const lastRead = progress.filter(p => p.stage === 'works').pop()!;
    expect(lastRead.fraction).toBeLessThan(0.6 + 1e-9);
  });

  it('a small file still reports, at least its start and its end', () => {
    const small = synth('2.1', 3);
    expect(run(findDuplicatesSteps(small)).progress.length).toBeGreaterThanOrEqual(2);
    expect(run(ownedSharesSteps(small)).progress.length).toBeGreaterThanOrEqual(2);
    expect(run(worksCsvSteps(small)).progress.length).toBeGreaterThanOrEqual(2);
  });

  it('an empty document (no groups) reports and returns the empty answer', () => {
    const empty = parse(enc(''));
    const dup = run(findDuplicatesSteps(empty));
    expect(dup.value).toEqual({ severity: 'info', worksChecked: 0, groups: [] });
    expect(dup.progress[dup.progress.length - 1]!.fraction).toBe(1);
    expect(run(ownedSharesSteps(empty)).value).toEqual({ works: [] });
    expect(Buffer.from(run(worksCsvSteps(empty)).value).equals(Buffer.from(worksCsv(empty)))).toBe(true);
  });

  it('onProgress receives the objects that are yielded, in order', () => {
    const got: Progress[] = [];
    const { progress } = run(ownedSharesSteps(doc, { onProgress: p => got.push(p) }));
    expect(got).toHaveLength(progress.length);
    got.forEach((p, i) => expect(p).toBe(progress[i]));
  });
});

describe('extractWorksSteps returns what extractWorks returns', () => {
  /** What an ExtractResult holds, with the output document reduced to its bytes. */
  const flat = (r: ExtractResult): unknown => (r.ok ? { ...r, bytes: Buffer.from(r.bytes).toString('base64'), doc: Buffer.from(r.doc.bytes).toString('base64') } : r);

  it.each(sources)('%s', (_name, bytes) => {
    const doc = parse(bytes);
    const all = headersOf(doc);
    const picks = [all, all.filter((_, i) => i % 3 === 0), all.slice(0, 1), all.slice(-2)];
    for (const pick of picks) {
      for (const keepHeader of [true, false]) {
        const options = { keepHeader, now: NOW };
        const stepped = run(extractWorksSteps(doc, pick, options)).value;
        const oneShot = extractWorks(doc, pick, options);
        expect(flat(stepped)).toEqual(flat(oneShot));
        if (stepped.ok && oneShot.ok) {
          expect(Buffer.from(stepped.bytes).equals(Buffer.from(oneShot.bytes))).toBe(true);
          expect(Buffer.from(serialize(stepped.doc)).equals(Buffer.from(stepped.bytes))).toBe(true);
        }
      }
    }
  });

  it('the same with each line ending option', () => {
    const doc = parse(enc(dec(synth('2.1', 9, true).bytes).replace(/\r\n/g, '\n')));
    for (const eol of ['keep', 'crlf'] as const) {
      const stepped = run(extractWorksSteps(doc, headersOf(doc), { eol, now: NOW })).value;
      expect(flat(stepped)).toEqual(flat(extractWorks(doc, headersOf(doc), { eol, now: NOW })));
    }
  });
});

describe('progress of an extract', () => {
  const doc = parse(synth('2.2', 900, true).bytes);

  it('reports build, reparse, structure and bodies, in that order, from 0 to 1', () => {
    const { progress, value } = run(extractWorksSteps(doc, headersOf(doc), { now: NOW }));
    expect(value.ok).toBe(true);
    expectWellFormed(progress, 'extract', ['build', 'reparse', 'structure', 'bodies']);
  });

  it('counts records in build and bodies, and thousandths in reparse and structure', () => {
    const picked = headersOf(doc).filter((_, i) => i % 2 === 0);
    const { progress, value } = run(extractWorksSteps(doc, picked, { now: NOW }));
    if (!value.ok) throw new Error('extract failed');
    const records = value.stats.records;
    for (const p of progress) {
      if (p.stage === 'build') expect(p.total).toBe(3 * records); // written, encoded, joined
      if (p.stage === 'bodies') expect(p.total).toBe(records);
      if (p.stage === 'reparse' || p.stage === 'structure') expect(p.total).toBe(1000);
    }
    const by = (stage: string): Progress[] => progress.filter(p => p.stage === stage);
    expect(by('build').length).toBeGreaterThan(3);
    expect(by('reparse').length).toBeGreaterThan(1);
    expect(by('structure').length).toBeGreaterThan(1);
    expect(by('bodies').length).toBeGreaterThan(1);
    expect(by('reparse').pop()!.done).toBe(1000);
    expect(by('structure').pop()!.done).toBeGreaterThanOrEqual(999);
  });

  it('the stages share the bar: each starts where the one before stopped', () => {
    const { progress } = run(extractWorksSteps(doc, headersOf(doc), { now: NOW }));
    const edge = (stage: string): [number, number] => {
      const ps = progress.filter(p => p.stage === stage);
      return [ps[0]!.fraction, ps[ps.length - 1]!.fraction];
    };
    expect(edge('build')[0]).toBe(0);
    expect(edge('reparse')[0]).toBeGreaterThanOrEqual(edge('build')[1]);
    expect(edge('structure')[0]).toBeGreaterThanOrEqual(edge('reparse')[1]);
    expect(edge('bodies')[0]).toBeGreaterThanOrEqual(edge('structure')[1]);
    expect(edge('bodies')[1]).toBe(1);
  });

  it('reports often enough to stop quickly: no stage goes more than a few thousand records between reports', () => {
    const { progress } = run(extractWorksSteps(doc, headersOf(doc), { now: NOW }));
    for (const stage of ['build', 'bodies']) {
      const ps = progress.filter(p => p.stage === stage);
      for (let i = 1; i < ps.length; i++) expect(ps[i]!.done - ps[i - 1]!.done).toBeLessThanOrEqual(4096);
    }
  });

  it('a request refused before it starts returns its error without yielding anything', () => {
    const gen = extractWorksSteps(doc, []);
    const first = gen.next();
    expect(first.done).toBe(true);
    expect(first.value).toMatchObject({ ok: false, error: { code: 'empty-selection' } });
    const bad = extractWorksSteps(doc, [allOf(doc, 'SPU')[0]!]).next();
    expect(bad.done).toBe(true);
    expect(bad.value).toMatchObject({ ok: false, error: { code: 'not-a-transaction' } });
  });

  it('options.onProgress sees every report, and an aborted signal throws CancelledError from the generator', () => {
    const got: Progress[] = [];
    const { progress } = run(extractWorksSteps(doc, headersOf(doc), { now: NOW, onProgress: p => got.push(p) }));
    expect(got).toHaveLength(progress.length);

    const token = createCancelToken();
    const gen = extractWorksSteps(doc, headersOf(doc), { now: NOW, signal: token.signal, onProgress: p => p.stage === 'reparse' && token.cancel() });
    expect(() => run(gen)).toThrow(CancelledError);
  });
});

describe('stopping a run between steps leaves no partial state', () => {
  const bytes = synth('2.2', 1000, true).bytes;

  interface Case {
    name: string;
    gen: (doc: CwrDoc, options?: RunOptions) => Generator<Progress, unknown, void>;
    once: (doc: CwrDoc) => unknown;
    /** The result as plain data, so two results can be compared. */
    plain: (value: unknown) => unknown;
  }
  const b64 = (u: unknown): string => Buffer.from(u as Uint8Array).toString('base64');
  const cases: Case[] = [
    { name: 'duplicates', gen: (d, o) => findDuplicatesSteps(d, o), once: d => findDuplicates(d), plain: v => v },
    { name: 'owned shares', gen: (d, o) => ownedSharesSteps(d, o), once: d => ownedShares(d), plain: v => v },
    { name: 'works CSV', gen: (d, o) => worksCsvSteps(d, o), once: d => worksCsv(d), plain: b64 },
    {
      name: 'extract',
      gen: (d, o) => extractWorksSteps(d, headersOf(d), { now: NOW, ...o }),
      once: d => extractWorks(d, headersOf(d), { now: NOW }),
      plain: v => ({ ...(v as ExtractSuccess), bytes: b64((v as ExtractSuccess).bytes), doc: b64((v as ExtractSuccess).doc.bytes) }),
    },
  ];

  it.each(cases)('$name: stop after 1, 3 and half the steps; the document is untouched and a new run gives the full answer', ({ gen, once, plain }) => {
    const total = run(gen(parse(bytes))).progress.length;
    expect(total).toBeGreaterThan(4);
    const expected = plain(once(parse(bytes)));
    for (const stopAfter of [1, 3, Math.floor(total / 2)]) {
      const doc = frozen(bytes); // a write to the document would throw
      const before = snapshot(doc);
      const g = gen(doc);
      for (let i = 0; i < stopAfter; i++) expect(g.next().done).toBe(false);
      expect(g.return(undefined as never).done).toBe(true); // the host stops
      expect(g.next()).toEqual({ done: true, value: undefined }); // and nothing resumes
      const after = snapshot(doc);
      expect(after.bytes.equals(before.bytes)).toBe(true);
      expect(after.serialized.equals(before.serialized)).toBe(true);
      expect(after.edits).toBe(0);
      expect(after.records).toBe(before.records);
      expect(after.lines).toBe(before.lines);
      expect(after.file).toBe(before.file);
      // The same document, run again from the start, gives the full answer.
      expect(plain(run(gen(doc)).value)).toEqual(expected);
    }
  });

  it.each(cases)('$name: a stop through the signal throws CancelledError, leaves the document as it was, and a new run is complete', ({ gen, once, plain }) => {
    const expected = plain(once(parse(bytes)));
    for (const at of [1, 4]) {
      const doc = frozen(bytes);
      const before = snapshot(doc);
      const token = createCancelToken();
      let n = 0;
      const stopped = gen(doc, { signal: token.signal, onProgress: () => ++n === at && token.cancel() });
      expect(() => run(stopped)).toThrow(CancelledError);
      const after = snapshot(doc);
      expect(after.bytes.equals(before.bytes)).toBe(true);
      expect(after.records).toBe(before.records);
      expect(after.edits).toBe(0);
      expect(plain(run(gen(doc)).value)).toEqual(expected);
    }
  });

  it('an extract can be stopped in each of its four stages', () => {
    const doc = frozen(bytes);
    const before = snapshot(doc);
    for (const stage of ['build', 'reparse', 'structure', 'bodies']) {
      const g = extractWorksSteps(doc, headersOf(doc), { now: NOW });
      let p = g.next();
      while (!p.done && p.value.stage !== stage) p = g.next();
      expect(p.done).toBe(false);
      expect(g.return(undefined as never).done).toBe(true);
    }
    const after = snapshot(doc);
    expect(after.bytes.equals(before.bytes)).toBe(true);
    expect(after.edits).toBe(0);
  });
});
