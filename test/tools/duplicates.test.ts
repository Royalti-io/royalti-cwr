import { describe, expect, it } from 'vitest';
import { findDuplicates, normalizeTitle, parse, serialize, withoutLaterDuplicates } from '../../src/index';
import type { DuplicateGroup } from '../../src/index';
import { allOf, assemble, record, synth, withFields } from './support';

const base = synth('2.1', 12, true);
const nwr = allOf(base, 'NWR');

const planted = withFields(base, [
  [nwr[2]!, 'submitterWorkNumber', 'SYN000001'], // the same number as work 0
  [nwr[1]!, 'iswc', 'T0345246801'],
  [nwr[5]!, 'iswc', 't0345246801'], // the same ISWC, written in lower case
  [nwr[3]!, 'iswc', 'T0000000000'],
  [nwr[4]!, 'iswc', 'T0000000000'], // zeros are not an ISWC
  [nwr[8]!, 'workTitle', 'Amber  Harbour, 00001!'], // work 0's title, with other case, spacing and punctuation, and the same writers
]);

const byReason = (groups: DuplicateGroup[], reason: string): DuplicateGroup[] => groups.filter(g => g.reason === reason);
const headers = (g: DuplicateGroup): number[] => g.members.map(m => m.header);

describe('findDuplicates', () => {
  it('finds nothing in a clean synthetic file', () => {
    const r = findDuplicates(base);
    expect(r.worksChecked).toBe(12);
    expect(r.groups).toEqual([]);
    expect(r.severity).toBe('info');
  });

  it('groups by Submitter Work #, by ISWC and by title and writers, and says why', () => {
    const r = findDuplicates(planted);
    expect(r.worksChecked).toBe(12);
    const number = byReason(r.groups, 'work-number');
    expect(number).toHaveLength(1);
    expect(headers(number[0]!)).toEqual([nwr[0], nwr[2]]);
    expect(number[0]!.key).toBe('SYN000001');

    const iswc = byReason(r.groups, 'iswc');
    expect(iswc).toHaveLength(1);
    expect(headers(iswc[0]!)).toEqual([nwr[1], nwr[5]]);
    expect(iswc[0]!.key).toBe('T0345246801');

    const title = byReason(r.groups, 'title-and-writers');
    expect(title).toHaveLength(1);
    expect(headers(title[0]!)).toEqual([nwr[0], nwr[8]]);
    expect(title[0]!.key).toBe('AMBER HARBOUR 00001');

    expect(r.groups).toHaveLength(3);
    for (const g of r.groups) {
      expect(g.severity).toBe('info');
      expect(g.explanation.length).toBeGreaterThan(10);
      expect(g.members.length).toBeGreaterThanOrEqual(2);
    }
    // Groups come in file order of their first member.
    const lines = r.groups.map(g => g.members[0]!.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it('lists each member with its line, record type, title, numbers and group', () => {
    const g = byReason(findDuplicates(planted).groups, 'work-number')[0]!;
    expect(g.members[0]).toMatchObject({ header: nwr[0], recordType: 'NWR', workNumber: 'SYN000001', group: 0, line: planted.records[nwr[0]!]!.line });
    expect(g.members[1]).toMatchObject({ header: nwr[2], title: expect.stringContaining('00003') });
  });

  it('does not group a title match when the works have no writer, and ignores blank numbers', () => {
    const line = (title: string, number: string): string => record('NWR', 0, 0, 260, [19, title], [81, number]);
    const bytes = assemble(base, [{ type: 'NWR', txns: [[line('SAME TITLE', '')], [line('SAME TITLE', '')], [line('OTHER', 'A1')], [line('THIRD', 'A1')]] }]);
    const r = findDuplicates(parse(bytes));
    expect(r.groups.map(g => g.reason)).toEqual(['work-number']);
    expect(r.groups[0]!.key).toBe('A1');
  });

  it('counts an NWR and the REV that revises it as a pair, but labels it informational', () => {
    const line = (type: string): string => record(type, 0, 0, 260, [19, 'A TITLE'], [81, 'N1']);
    const doc = parse(assemble(base, [{ type: 'NWR', txns: [[line('NWR')]] }, { type: 'REV', txns: [[line('REV')]] }]));
    const r = findDuplicates(doc);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.members.map(m => [m.recordType, m.group])).toEqual([['NWR', 0], ['REV', 1]]);
    expect(r.groups[0]!.severity).toBe('info');
  });

  it('is read-only and gives the same answer twice', () => {
    const before = Buffer.from(serialize(planted));
    const a = findDuplicates(planted);
    const b = findDuplicates(planted);
    expect(b).toEqual(a);
    expect(planted.edits.size).toBe(0);
    expect(Buffer.from(serialize(planted)).equals(before)).toBe(true);
  });

  it('normalises titles', () => {
    expect(normalizeTitle('  Café  del  Mar!! ')).toBe('CAFE DEL MAR');
    expect(normalizeTitle("Don't Stop (Live)")).toBe('DON T STOP LIVE');
    expect(normalizeTitle('...')).toBe('');
  });
});

describe('withoutLaterDuplicates', () => {
  it('keeps the first work of each group and every transaction that is not a duplicate', () => {
    const report = findDuplicates(planted);
    const keep = withoutLaterDuplicates(planted, report);
    const all = planted.file.groups.flatMap(g => g.transactions.map(t => t.header));
    const dropped = all.filter(h => !keep.includes(h));
    expect(dropped.sort((a, b) => a - b)).toEqual([nwr[2], nwr[5], nwr[8]].sort((a, b) => a! - b!));
    expect(keep.every(h => all.includes(h))).toBe(true);
  });
});
