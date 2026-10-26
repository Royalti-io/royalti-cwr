import { describe, expect, it } from 'vitest';
import { forkDoc, parse, renumber, serialize } from '../../src/index';
import { equalBytes, expectSound, fixture, SAMPLE } from '../helpers';

describe('public sample (CW190001MPC_000.V21)', () => {
  const bytes = fixture(SAMPLE);
  const doc = parse(bytes);

  it('serialises to exactly its input', () => {
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
  });

  it('is sound: lines tile the bytes, every record is placed once', () => {
    expectSound(doc);
  });

  it('reads as 2.1, ASCII, LF, no BOM, every line kept', () => {
    expect(doc.version.version).toBe('2.1');
    expect(doc.version.source).toBe('grh');
    expect(doc.encoding).toBe('ascii');
    expect(doc.bom).toBe(false);
    expect(doc.lines.length).toBe(1614);
    expect(doc.lines.every(l => l.eol === '\n')).toBe(true);
    expect(doc.records.length).toBe(1614);
  });

  it('keeps and flags the planted defects instead of dropping them', () => {
    const unknown = doc.records.filter(r => r.status === 'unknown-type').map(r => r.type);
    expect(unknown.sort()).toEqual(['   ', 'ALX']);
    // Planted prefix defects (a blank tseq on an NWR, an X in an SPU and an SPT sequence) report as
    // bad-prefix, which takes precedence over short in the single status value.
    const count = (type: string, status: string) => doc.records.filter(r => r.type === type && r.status === status).length;
    expect(count('NWR', 'short')).toBe(5);
    expect(count('NWR', 'bad-prefix')).toBe(1);
    expect(count('SPU', 'short')).toBe(3);
    expect(count('SPU', 'bad-prefix')).toBe(1);
    expect(count('SPT', 'bad-prefix')).toBe(1);
    // Together they are six NWR records of 208 characters and four SPU records of 138, plus the blank-typed 138-character line.
    const short = doc.records.filter(r => r.status === 'short' || r.status === 'bad-prefix');
    expect(short.filter(r => r.type === 'NWR').map(r => r.length)).toEqual([208, 208, 208, 208, 208, 208]);
    expect(short.filter(r => r.type === 'SPU').map(r => r.length)).toEqual([138, 138, 138, 138]);
    expect(doc.records.filter(r => r.type === '   ').map(r => r.length)).toEqual([138]);
  });

  it('groups into one NWR group of 100 transactions', () => {
    expect(doc.file.hdr).toBe(0);
    expect(doc.file.trl).toBe(doc.records.length - 1);
    expect(doc.file.groups.length).toBe(1);
    const group = doc.file.groups[0]!;
    expect(group.type).toBe('NWR');
    expect(group.grt).toBeDefined();
    expect(group.transactions.length).toBe(100);
  });

  it('renumber is idempotent and leaves a re-parsed file consistent', () => {
    const copy = forkDoc(doc);
    renumber(copy);
    const once = serialize(copy);
    const again = parse(once);
    expect(renumber(again)).toEqual([]);
    expect(equalBytes(serialize(again), once)).toBe(true);
  });
});
