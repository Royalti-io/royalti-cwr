import { describe, expect, it } from 'vitest';
import { formatShare, ownedShares, parse, serialize, workSummaries } from '../../src/index';
import { fixture, SAMPLE } from '../helpers';
import { allOf, enc, synth, withFields, withRawText } from './support';

describe('ownedShares', () => {
  const plain = synth('2.1', 4);
  const mixed = synth('2.2', 4, true);

  it('reports what the controlled parties own and what they collect, per right and territory', () => {
    const r = ownedShares(plain);
    expect(r.works).toHaveLength(4);
    const w = r.works[0]!;
    expect(w).toMatchObject({ recordType: 'NWR', workNumber: 'SYN000001', title: 'AMBER HARBOUR 00001' });
    // One controlled publisher with 50% of PR and all of MR and SR, one controlled writer with 50% of PR.
    expect(w.owned.pr).toEqual({ controlled: 10000, others: 0, total: 10000 });
    expect(w.owned.mr).toEqual({ controlled: 10000, others: 0, total: 10000 });
    expect(w.owned.sr).toEqual({ controlled: 10000, others: 0, total: 10000 });
    expect(w.controlledParties.map(p => [p.recordType, p.shares.pr])).toEqual([['SPU', 5000], ['SWR', 5000]]);
    expect(w.collected).toMatchObject({ territoryRecords: 2, expanded: true, unexpanded: [] });
    expect(w.collected.territories).toEqual([
      { code: '2136', world: true, collected: { pr: 10000, mr: 10000, sr: 10000 }, gap: { pr: 0, mr: 0, sr: 0 } },
    ]);
  });

  it('shows the other parties beside the controlled ones', () => {
    const w = ownedShares(mixed).works[1]!;
    expect(w.owned.pr).toEqual({ controlled: 5000, others: 5000, total: 10000 });
    expect(w.owned.mr).toEqual({ controlled: 5000, others: 5000, total: 10000 });
    expect(w.controlledParties.every(p => p.controlled)).toBe(true);
    expect(w.controlledParties).toHaveLength(2);
    // Only SPT and SWT count as collected; there are no OPT or OWT records here.
    expect(w.collected.territories[0]!.collected.pr).toBe(5000);
    expect(w.collected.territories[0]!.gap).toEqual({ pr: 0, mr: 0, sr: 0 });
  });

  it('works out the gap as owned minus collected, and lets it be negative', () => {
    const swt = allOf(plain, 'SWT')[0]!;
    const spt = allOf(plain, 'SPT')[0]!;
    const less = withFields(plain, [[swt, 'prCollectionShare', '04000']]);
    expect(ownedShares(less).works[0]!.collected.territories[0]).toMatchObject({ collected: { pr: 9000, mr: 10000, sr: 10000 }, gap: { pr: 1000, mr: 0, sr: 0 } });
    const more = withFields(plain, [[spt, 'prCollectionShare', '06000']]);
    expect(ownedShares(more).works[0]!.collected.territories[0]!.gap.pr).toBe(-1000);
  });

  it('keeps countries apart from the world point', () => {
    const swt = allOf(plain, 'SWT')[0]!;
    const spt = allOf(plain, 'SPT')[0]!;
    const doc = withFields(plain, [[spt, 'tisNumericCode', '0840'], [swt, 'tisNumericCode', '0826']]);
    const w = ownedShares(doc).works[0]!;
    expect(w.collected.territories.map(t => [t.code, t.world]).sort()).toEqual([['0826', false], ['0840', false]]);
    const us = w.collected.territories.find(t => t.code === '0840')!;
    expect(us.collected).toEqual({ pr: 5000, mr: 10000, sr: 10000 });
    expect(us.gap).toEqual({ pr: 5000, mr: 0, sr: 0 });
  });

  it('reports a group of countries as not expanded and does not guess', () => {
    const doc = withFields(plain, [[allOf(plain, 'SPT')[0]!, 'tisNumericCode', '2100']]);
    const w = ownedShares(doc).works[0]!;
    expect(w.collected.expanded).toBe(false);
    expect(w.collected.unexpanded).toEqual(['2100']);
    expect(w.collected.territories).toEqual([]);
    expect(w.collected.territoryRecords).toBe(2);
    // Owned shares are still worked out; the other works are unaffected.
    expect(w.owned.pr.total).toBe(10000);
    expect(ownedShares(doc).works[1]!.collected.expanded).toBe(true);
  });

  it('gives null where a share cannot be read, and for everything built on it', () => {
    const doc = withRawText(plain, allOf(plain, 'SWR')[0]!, 129, '5O000');
    const w = ownedShares(doc).works[0]!;
    expect(w.owned.pr).toEqual({ controlled: null, others: 0, total: null });
    expect(w.owned.mr.controlled).toBe(10000);
    expect(w.collected.territories[0]!.gap.pr).toBeNull();
    expect(w.collected.territories[0]!.gap.mr).toBe(0);
  });

  it('a work with no territory records has an empty collected list', () => {
    const lines = plain.lines.map(l => l.text).filter(t => !t.startsWith('SPT') && !t.startsWith('SWT'));
    const w = ownedShares(parse(enc(lines.join('\r\n') + '\r\n'))).works[0]!;
    expect(w.collected).toEqual({ territoryRecords: 0, expanded: true, unexpanded: [], territories: [] });
    expect(w.owned.pr.total).toBe(10000);
  });

  it('agrees with workSummaries on the total of every right, on the public sample too', () => {
    for (const doc of [plain, mixed, parse(fixture(SAMPLE))]) {
      const owned = ownedShares(doc).works;
      const summaries = workSummaries(doc);
      expect(owned.map(w => w.header)).toEqual(summaries.map(s => s.header));
      owned.forEach((w, i) => {
        for (const right of ['pr', 'mr', 'sr'] as const) expect(w.owned[right].total).toBe(summaries[i]!.totals[right].total);
      });
    }
  });

  it('is read-only', () => {
    const before = Buffer.from(serialize(mixed));
    ownedShares(mixed);
    expect(mixed.edits.size).toBe(0);
    expect(Buffer.from(serialize(mixed)).equals(before)).toBe(true);
    expect(formatShare(ownedShares(mixed).works[0]!.owned.pr.total!)).toBe('100.00%');
  });
});
