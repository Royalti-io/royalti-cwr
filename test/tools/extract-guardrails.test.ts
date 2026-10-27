import { describe, expect, it } from 'vitest';
import { extractWorks, parse, verifyExtraction } from '../../src/index';
import type { CwrDoc, ExtractChecks, ExtractSuccess } from '../../src/index';
import { assemble, dec, enc, record, synth } from './support';

/**
 * The three guardrails of extractWorks, each shown to FAIL on an output that was deliberately damaged. Every test starts from a
 * good output, checks that it passes, damages it in one way, and checks which guardrail notices.
 */

const NOW = new Date(Date.UTC(2026, 9, 26, 14, 5, 9));
const src = synth('2.1', 8, true);
const picks = src.file.groups[0]!.transactions.filter((_, i) => [2, 3, 5].includes(i)).map(t => t.header);
const good = extractWorks(src, picks, { now: NOW }) as ExtractSuccess;
const eol = '\r\n';

/** Applies a change to the lines of the good output and returns the bytes. */
function damage(edit: (lines: string[]) => void): Uint8Array {
  const lines = dec(good.bytes).split(eol);
  edit(lines);
  return enc(lines.join(eol));
}
const verify = (bytes: Uint8Array, source: CwrDoc = src, selected = good.selected, keepHeader = false): ExtractChecks => verifyExtraction(source, selected, bytes, { keepHeader });
const lineOf = (lines: string[], type: string, nth = 0): number => {
  let seen = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i]!.startsWith(type) && ++seen === nth) return i;
  throw new Error(`no ${type} #${nth}`);
};
const only = (c: ExtractChecks): string => [c.reparse.ok ? '' : 'reparse', c.structure.ok ? '' : 'structure', c.bodies.ok ? '' : 'bodies'].filter(Boolean).join('+');

describe('the good output', () => {
  it('passes all three guardrails', () => {
    expect(good.ok).toBe(true);
    expect(verify(good.bytes).ok).toBe(true);
  });
});

describe('guardrail 1, re-parse: the output must have the shape that was asked for', () => {
  it.each([
    ['a record is missing', (l: string[]) => l.splice(lineOf(l, 'PWR', 1), 1)],
    ['the trailer is missing', (l: string[]) => l.splice(lineOf(l, 'TRL'), 1)],
    ['a transaction is repeated', (l: string[]) => l.splice(lineOf(l, 'NWR', 1), 6, ...l.slice(lineOf(l, 'NWR', 1), lineOf(l, 'NWR', 1) + 6), ...l.slice(lineOf(l, 'NWR', 1), lineOf(l, 'NWR', 1) + 6))],
    ['two records are swapped', (l: string[]) => {
      const i = lineOf(l, 'SWR', 0);
      [l[i], l[i + 1]] = [l[i + 1]!, l[i]!];
    }],
    ['a stray record is added', (l: string[]) => l.splice(lineOf(l, 'GRT'), 0, record('ALX', 9, 9, 40))],
    ['the group header is missing', (l: string[]) => l.splice(lineOf(l, 'GRH'), 1)],
    ['the file header is missing', (l: string[]) => l.splice(0, 1)],
  ])('%s', (_name, edit) => {
    const c = verify(damage(edit));
    expect(c.reparse.ok).toBe(false);
    expect(c.reparse.problems.length).toBeGreaterThan(0);
    expect(c.ok).toBe(false);
    // The other two cannot be compared when the output does not line up, and say so.
    expect(c.structure.ok).toBe(false);
    expect(c.bodies.ok).toBe(false);
  });

  it('says "an SWR record", not "a SWR record", when a record of another type stands where an SWR should', () => {
    const c = verify(damage(l => {
      const i = lineOf(l, 'SWR', 0);
      [l[i], l[i + 1]] = [l[i + 1]!, l[i]!];
    }));
    const wrongType = c.reparse.problems.filter(m => m.includes('expected'));
    expect(wrongType.length).toBeGreaterThan(0);
    expect(wrongType.some(m => /expected an SWR record, found /.test(m))).toBe(true);
    for (const m of c.reparse.problems) expect(m).not.toMatch(/expected a [AEFHILMNOSX][A-Z]{2} record/);
  });

  it('an output that is not even a CWR file', () => {
    const c = verify(enc('nothing like it\r\n'));
    expect(c.reparse.ok).toBe(false);
    expect(c.ok).toBe(false);
  });
});

describe('guardrail 2, structure: what this tool writes must be right, and what the records say must not change', () => {
  const prefix = (tseq: number | null, rseq: number | null) => (l: string, add: [number, number]) =>
    l.slice(0, 3) + (tseq === null ? l.slice(3, 11) : String(add[0]).padStart(8, '0')) + (rseq === null ? l.slice(11, 19) : String(add[1]).padStart(8, '0')) + l.slice(19);

  it.each([
    ['a record number is wrong', 'PFX-6', (l: string[]) => (l[lineOf(l, 'SWR', 1)] = prefix(null, 0)(l[lineOf(l, 'SWR', 1)]!, [0, 40]))],
    ['a transaction number is wrong', 'PFX-3', (l: string[]) => (l[lineOf(l, 'NWR', 1)] = prefix(1, null)(l[lineOf(l, 'NWR', 1)]!, [7, 0]))],
    ['a detail record has another transaction number', 'PFX-4', (l: string[]) => (l[lineOf(l, 'SPT', 2)] = prefix(1, null)(l[lineOf(l, 'SPT', 2)]!, [0, 0]))],
    ['the group transaction count is wrong', 'GRT-F-002', (l: string[]) => (l[lineOf(l, 'GRT')] = l[lineOf(l, 'GRT')]!.slice(0, 8) + '00000009' + l[lineOf(l, 'GRT')]!.slice(16))],
    ['the group record count is wrong', 'GRT-F-003', (l: string[]) => (l[lineOf(l, 'GRT')] = l[lineOf(l, 'GRT')]!.slice(0, 16) + '00000001' + l[lineOf(l, 'GRT')]!.slice(24))],
    ['the file record count is wrong', 'TRL-F-003', (l: string[]) => (l[lineOf(l, 'TRL')] = l[lineOf(l, 'TRL')]!.slice(0, 16) + '00000001')],
    ['the file transaction count is wrong', 'TRL-F-002', (l: string[]) => (l[lineOf(l, 'TRL')] = l[lineOf(l, 'TRL')]!.slice(0, 8) + '00000009' + l[lineOf(l, 'TRL')]!.slice(16))],
    ['the group id is wrong', 'GRH-F-002', (l: string[]) => (l[lineOf(l, 'GRH')] = l[lineOf(l, 'GRH')]!.slice(0, 6) + '00007' + l[lineOf(l, 'GRH')]!.slice(11))],
  ])('%s', (_name, rule, edit) => {
    const c = verify(damage(edit));
    expect(only(c)).toBe('structure');
    expect(c.structure.problems.join(' ')).toContain(rule);
  });

  it('a finding that the source does not have appears in the output, at a record whose text was changed', () => {
    // An ACK with no work behind it is fine when it answers a problem with the HDR; it is a finding when it answers an NWR.
    const make = (answered: string): CwrDoc => parse(assemble(src, [{ type: 'ACK', txns: [[record('ACK', 0, 0, 159, [19, '20260101'], [46, answered], [157, 'AS'])]] }]));
    const doc = make('HDR');
    const out = extractWorks(doc, [doc.file.groups[0]!.transactions[0]!.header], { keepHeader: true }) as ExtractSuccess;
    expect(out.ok).toBe(true);
    const changed = enc(dec(out.bytes).split(eol).map(l => (l.startsWith('ACK') ? l.slice(0, 46) + 'NWR' + l.slice(49) : l)).join(eol));
    const c = verifyExtraction(doc, out.selected, changed, { keepHeader: true });
    expect(c.structure.ok).toBe(false);
    expect(c.structure.problems.join(' ')).toContain('ACK-T-002');
    expect(c.structure.problems.join(' ')).toContain('does not have');
  });

  it('a finding that the source has disappears from the output', () => {
    const doc = parse(assemble(src, [{ type: 'ACK', txns: [[record('ACK', 0, 0, 159, [19, '20260101'], [46, 'NWR'], [157, 'AS'])]] }]));
    const out = extractWorks(doc, [doc.file.groups[0]!.transactions[0]!.header], { keepHeader: true }) as ExtractSuccess;
    expect(out.ok).toBe(true);
    // The extraction itself keeps the finding, which is what the guardrail asks for.
    expect(out.checks.structure.ok).toBe(true);
    const changed = enc(dec(out.bytes).split(eol).map(l => (l.startsWith('ACK') ? l.slice(0, 46) + 'HDR' + l.slice(49) : l)).join(eol));
    const c = verifyExtraction(doc, out.selected, changed, { keepHeader: true });
    expect(c.structure.ok).toBe(false);
    expect(c.structure.problems.join(' ')).toContain('no longer shows');
  });
});

describe('guardrail 3, bodies: every record must match its source after the prefix', () => {
  it.each([
    ['a letter in a name changes', (l: string[]) => (l[lineOf(l, 'SPU', 1)] = l[lineOf(l, 'SPU', 1)]!.slice(0, 40) + 'Q' + l[lineOf(l, 'SPU', 1)]!.slice(41))],
    ['a record loses its last character', (l: string[]) => (l[lineOf(l, 'SWT', 0)] = l[lineOf(l, 'SWT', 0)]!.slice(0, -1))],
    ['a record gains a trailing character', (l: string[]) => (l[lineOf(l, 'PWR', 2)] = l[lineOf(l, 'PWR', 2)] + 'X')],
    ['a share changes', (l: string[]) => (l[lineOf(l, 'SWR', 2)] = l[lineOf(l, 'SWR', 2)]!.slice(0, 130) + '99' + l[lineOf(l, 'SWR', 2)]!.slice(132))],
    ['a title changes', (l: string[]) => (l[lineOf(l, 'NWR', 0)] = l[lineOf(l, 'NWR', 0)]!.slice(0, 19) + 'X' + l[lineOf(l, 'NWR', 0)]!.slice(20))],
    ['the group header changes beyond its id', (l: string[]) => (l[lineOf(l, 'GRH')] = l[lineOf(l, 'GRH')]!.slice(0, 11) + '02.99' + l[lineOf(l, 'GRH')]!.slice(16))],
    ['the file header changes beyond its dates', (l: string[]) => (l[0] = l[0]!.slice(0, 14) + 'XX' + l[0]!.slice(16))],
  ])('%s', (_name, edit) => {
    const c = verify(damage(edit));
    expect(c.bodies.ok).toBe(false);
    expect(c.bodies.problems.length).toBeGreaterThan(0);
    expect(c.ok).toBe(false);
    // The shape is right, so the first guardrail does not notice a changed letter.
    if (_name === 'a letter in a name changes' || _name === 'a share changes' || _name === 'a title changes') expect(only(c)).toBe('bodies');
  });

  it('allows the header dates and time to change, and only when the header was not kept', () => {
    const redated = damage(l => (l[0] = l[0]!.slice(0, 64) + '20300101' + '000000' + '20300101' + l[0]!.slice(86)));
    expect(verify(redated, src, good.selected, false).ok).toBe(true);
    const kept = verify(redated, src, good.selected, true);
    expect(kept.bodies.ok).toBe(false);
    expect(kept.bodies.problems.join(' ')).toContain('HDR');
  });
});

describe('the guardrails notice a selection that does not match the output', () => {
  it('another selection', () => {
    const other = src.file.groups[0]!.transactions.slice(0, 2).map(t => t.header);
    const c = verify(good.bytes, src, other);
    expect(c.ok).toBe(false);
    expect(c.reparse.ok).toBe(false);
  });

  it('a selection that is not made of transaction headers', () => {
    const c = verify(good.bytes, src, [1, 2, 3]);
    expect(c.ok).toBe(false);
    expect(c.reparse.problems[0]).toContain('not the header of a transaction');
  });

  it('every message is capped at twenty, with a count of the rest', () => {
    const bytes = damage(l => {
      for (let i = 0; i < l.length; i++) if (/^[A-Z]{3}\d{16}/.test(l[i]!)) l[i] = l[i]!.slice(0, 40) + 'Q' + l[i]!.slice(41);
    });
    const c = verify(bytes);
    expect(c.bodies.problems.length).toBeLessThanOrEqual(20);
    expect(c.bodies.problems.length + c.bodies.more).toBeGreaterThan(20);
  });
});
