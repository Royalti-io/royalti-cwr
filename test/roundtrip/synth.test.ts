import { describe, expect, it } from 'vitest';
import { generateCwr, getWorkView, parse, renumber, serialize, SYNTH_IPIS } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { equalBytes, expectSound, fixture } from '../helpers';

const combos: Array<{ version: CwrVersion; otherParties: boolean }> = [
  { version: '2.1', otherParties: false },
  { version: '2.1', otherParties: true },
  { version: '2.2', otherParties: false },
  { version: '2.2', otherParties: true },
];

function ipiOk(ipi: string): boolean {
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(ipi[i]) * (10 - i);
  total %= 101;
  if (total !== 0) total = (101 - total) % 100;
  return String(total).padStart(2, '0') === ipi.slice(9);
}

describe('synthetic generator', () => {
  it('uses fake IPIs that pass the checksum and are all distinct', () => {
    expect(SYNTH_IPIS.length).toBe(20);
    expect(new Set(SYNTH_IPIS).size).toBe(20);
    for (const ipi of SYNTH_IPIS) {
      expect(ipi).toMatch(/^999\d{8}$/);
      expect(ipiOk(ipi)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const a = generateCwr({ version: '2.1', works: 25, otherParties: true });
    const b = generateCwr({ version: '2.1', works: 25, otherParties: true });
    expect(equalBytes(a, b)).toBe(true);
  });

  for (const { version, otherParties } of combos) {
    for (const works of [11, 1000]) {
      it(`${version} ${otherParties ? 'with' : 'without'} OPU/OWR, ${works} works: round-trips and is well-formed`, () => {
        const bytes = generateCwr({ version, works, otherParties });
        const doc = parse(bytes);
        expect(equalBytes(serialize(doc), bytes)).toBe(true);
        expectSound(doc);
        expect(doc.version.version).toBe(version);
        expect(doc.records.every(r => r.status === 'ok')).toBe(true);
        expect(doc.orphans).toEqual([]);
        expect(doc.file.groups.length).toBe(1);
        expect(doc.file.groups[0]!.transactions.length).toBe(works);
        // Counts in GRT and TRL are right by construction: renumber changes nothing.
        expect(renumber(doc)).toEqual([]);
        // Every work has the expected parties.
        const view = getWorkView(doc, doc.file.groups[0]!.transactions[0]!)!;
        expect(view.chains.length).toBe(otherParties ? 2 : 1);
        expect(view.writers.length).toBe(otherParties ? 2 : 1);
        expect(view.writers[0]!.pwr.length).toBe(1);
      });
    }
  }

  it('round-trips with LF, no final newline, and 10,000 works', () => {
    const bytes = generateCwr({ version: '2.2', works: 10000, otherParties: true, eol: '\n', finalNewline: false });
    const doc = parse(bytes);
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
    expect(doc.lines[doc.lines.length - 1]!.eol).toBe('');
  });

  for (const { version, otherParties } of combos) {
    const name = `synthetic/synth-${version}-11works${otherParties ? '-opu-owr' : ''}.cwr`;
    it(`committed fixture ${name} is exactly the generator output and round-trips`, () => {
      const committed = fixture(name);
      expect(equalBytes(committed, generateCwr({ version, works: 11, otherParties }))).toBe(true);
      expect(equalBytes(serialize(parse(committed)), committed)).toBe(true);
    });
  }
});
