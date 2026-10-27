import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractWorks,
  extractWorksSteps,
  findDuplicates,
  findDuplicatesSteps,
  generateCwr,
  ownedShares,
  ownedSharesSteps,
  parse,
  worksCsv,
  worksCsvSteps,
} from '../../src/index';
import { fixture, SAMPLE } from '../helpers';

/**
 * The tools gave these answers before they became wrappers around their step generators (commit 39f3194, the one-shot code that
 * had no generators). The digests were taken from that code. A generator that equals its one-shot function proves nothing when the
 * one-shot function is the generator, so these pin both to what the tools did before.
 *
 * The two synthetic files still have the digests of that old code. The public sample does not: it is a damaged file, and since the
 * review's fixes (E1, E3) extract refuses its two transactions that hold records numbered for other transactions, and copies whole the
 * three records whose number is not a number (lines 3, 20 and 60 of the sample) instead of numbering them. Its digests are those of the code of that
 * change, over the 98 other transactions. A one-off comparison of the old and the new code over every fixture (170 results) found no
 * other difference: the three lines are the only bytes of the sample's 98 transactions that differ, and the digest of the stats, the
 * selection and the checks is the old one.
 */

const sha = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex').slice(0, 16);
const NOW = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));

type Digests = { extractAll: string; extractThird: string; csv: string; dups: string; owned: string };
const golden: Array<[string, Uint8Array, Digests]> = [
  [
    'the public sample',
    fixture(SAMPLE),
    { extractAll: '99ab5f4a3445d95e/ec74bd9018cce892', extractThird: '6ac68b4b8b94cb79/c24eba9fcdaf35be', csv: '765b2e368fbe5ef1', dups: '16371945b1295587', owned: 'e1dde7acef75f80d' },
  ],
  [
    'synthetic 2.2, 400 works, other parties',
    generateCwr({ version: '2.2', works: 400, otherParties: true, seed: 1 }),
    { extractAll: 'bc3ceb73349ec9e9/da74f42a82afa3ec', extractThird: '27851e10f0673057/24ebd790fb4a54ad', csv: 'c11934a869211a92', dups: 'a37f0f09d3f8a306', owned: '9fcecf7b319d4744' },
  ],
  [
    'synthetic 2.1, 25 works',
    generateCwr({ version: '2.1', works: 25, seed: 1 }),
    { extractAll: '9ee4fedf53e27477/8ebc9276210c8fd6', extractThird: 'da45f55e063ad2cb/58d821f5fefc53fa', csv: '863c546764216fbb', dups: 'd934eee018202500', owned: '05e6b793b9e46d5d' },
  ],
];

type Extract = typeof extractWorks;
const extractDigest = (run: Extract, bytes: Uint8Array, which: 'all' | 'third'): string => {
  const doc = parse(bytes);
  // A transaction that holds a record numbered for another transaction is refused since 0.3.1 (the review's finding E1); the sample has two,
  // and the other files none, so for them nothing is left out.
  const named = (t: { header: number; records: number[] }): boolean => t.records.some(r => doc.records[r]!.tseq !== undefined && doc.records[t.header]!.tseq !== undefined && doc.records[r]!.tseq !== doc.records[t.header]!.tseq);
  const all = doc.file.groups.flatMap(g => g.transactions.filter(t => !named(t)).map(t => t.header));
  const pick = which === 'all' ? all : all.filter((_, i) => i % 3 === 0);
  const r = run(doc, pick, which === 'all' ? { now: NOW } : { now: NOW, keepHeader: true });
  if (!r.ok) throw new Error(r.error.code);
  // The digests were taken before `stats` counted the records outside any transaction; those two fields are left out so the rest still has to match.
  const { outsideRecords: _count, outsideLines: _lines, ...before } = r.stats;
  return `${sha(r.bytes)}/${sha(JSON.stringify([before, r.selected, r.addedToSelection, r.checks]))}`;
};
const drain = <T>(gen: Generator<unknown, T, void>): T => {
  for (;;) {
    const next = gen.next();
    if (next.done) return next.value;
  }
};
const stepsExtract: Extract = (doc, selection, options) => drain(extractWorksSteps(doc, selection, options));

describe.each(golden)('%s: the answers are those of the tools before the generators', (_name, bytes, want) => {
  it('extract, every work and a third of them', () => {
    for (const run of [extractWorks, stepsExtract]) {
      expect(extractDigest(run, bytes, 'all')).toBe(want.extractAll);
      expect(extractDigest(run, bytes, 'third')).toBe(want.extractThird);
    }
  });

  it('works CSV, duplicates and owned shares', () => {
    const doc = parse(bytes);
    expect(sha(worksCsv(doc))).toBe(want.csv);
    expect(sha(drain(worksCsvSteps(doc)))).toBe(want.csv);
    expect(sha(JSON.stringify(findDuplicates(doc)))).toBe(want.dups);
    expect(sha(JSON.stringify(drain(findDuplicatesSteps(doc))))).toBe(want.dups);
    expect(sha(JSON.stringify(ownedShares(doc)))).toBe(want.owned);
    expect(sha(JSON.stringify(drain(ownedSharesSteps(doc))))).toBe(want.owned);
  });
});
