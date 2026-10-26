import { describe, expect, it } from 'vitest';
import { BUILTIN_REGISTRY, BUILTIN_RULES, check, createRegistry, defineRule, generateCwr, parse, serialize } from '../../src/index';
import type { CwrVersion, RuleDef } from '../../src/index';
import { equalBytes, fixture, SAMPLE } from '../helpers';
import { hitsOf } from './support';

describe('the public sample, which has planted defects', () => {
  const doc = parse(fixture(SAMPLE));
  const result = check(doc);
  const hits = hitsOf(result.problems).filter(h => h.rule !== 'FMT-Z');

  // Part 2 adds five findings. Four are consequences of the line the sample blanks out at line 18 (1-based) (an SPU turned into a line starting with
  // three blanks): the work's PR, MR and SR totals fall short (NWR-T-011, the 90% / 80% / 80% of design section 0), the SPT behind it follows
  // nothing (SPT-F-001), the next SPU is numbered 2 in a work that now has one chain (SPU-F-001), and a PWR points to the publisher that was blanked (PWR-F-001). The fifth is NWR-T-010 on the work at line 67, whose Version Type the sample sets to MOD (NWR-F-014 and -015 report the missing
  // arrangement and adaptation) while no writer is an arranger.
  it('reports the planted defects, each at its own place (0-based lines)', () => {
    expect(hits).toEqual([
      { rule: 'ENC-001', severity: 'warning', line: 0, start: 101, end: 101 },
      { rule: 'GRH-F-002', severity: 'error', line: 1, start: 6, end: 11 },
      { rule: 'FMT-M', severity: 'error', line: 2, start: 3, end: 11 },
      { rule: 'STR-LEN', severity: 'warning', line: 2, start: 208, end: 260 },
      { rule: 'STR-LEN', severity: 'warning', line: 3, start: 138, end: 183 },
      { rule: 'PFX-6', severity: 'error', line: 4, start: 11, end: 19 },
      { rule: 'STR-LEN', severity: 'warning', line: 15, start: 70, end: 118 },
      { rule: 'NWR-T-011', severity: 'error', line: 17, start: 19, end: 79 },
      { rule: 'NWR-T-011', severity: 'error', line: 17, start: 19, end: 79 },
      { rule: 'NWR-T-011', severity: 'error', line: 17, start: 19, end: 79 },
      { rule: 'STR-LEN', severity: 'warning', line: 17, start: 208, end: 260 },
      { rule: 'STR-F-001', severity: 'error', line: 18, start: 0, end: 3 },
      { rule: 'SPT-F-001', severity: 'error', line: 19, start: 0, end: 3 },
      { rule: 'FMT-N', severity: 'error', line: 19, start: 11, end: 19 },
      { rule: 'SPU-F-001', severity: 'error', line: 20, start: 19, end: 21 },
      { rule: 'STR-LEN', severity: 'warning', line: 20, start: 138, end: 183 },
      { rule: 'STR-LEN', severity: 'warning', line: 22, start: 138, end: 183 },
      { rule: 'PWR-F-001', severity: 'error', line: 29, start: 19, end: 28 },
      { rule: 'PFX-3', severity: 'error', line: 45, start: 3, end: 11 },
      { rule: 'STR-LEN', severity: 'warning', line: 45, start: 208, end: 260 },
      { rule: 'PFX-4', severity: 'error', line: 46, start: 3, end: 11 },
      { rule: 'FMT-N', severity: 'error', line: 59, start: 3, end: 11 },
      { rule: 'STR-LEN', severity: 'warning', line: 59, start: 138, end: 183 },
      { rule: 'NWR-T-010', severity: 'error', line: 66, start: 19, end: 79 },
      { rule: 'NWR-F-014', severity: 'error', line: 66, start: 148, end: 151 },
      { rule: 'NWR-F-015', severity: 'error', line: 66, start: 151, end: 154 },
      { rule: 'STR-LEN', severity: 'warning', line: 66, start: 208, end: 260 },
      { rule: 'LKP-TBL', severity: 'error', line: 81, start: 142, end: 145 },
      { rule: 'STR-LEN', severity: 'warning', line: 81, start: 208, end: 260 },
      { rule: 'STR-LEN', severity: 'warning', line: 202, start: 208, end: 260 },
      { rule: 'STR-F-001', severity: 'error', line: 1611, start: 0, end: 3 },
      { rule: 'GRT-F-002', severity: 'error', line: 1612, start: 8, end: 16 },
      { rule: 'GRT-F-003', severity: 'error', line: 1612, start: 16, end: 24 },
      { rule: 'TRL-F-001', severity: 'error', line: 1613, start: 3, end: 8 },
      { rule: 'TRL-F-002', severity: 'error', line: 1613, start: 8, end: 16 },
      { rule: 'TRL-F-003', severity: 'error', line: 1613, start: 16, end: 24 },
    ]);
  });

  it('flags the bad record types and the short records the file plants', () => {
    const unknown = result.problems.filter(p => p.ruleId === 'STR-F-001');
    expect(unknown.map(p => doc.lines[p.line]!.text.slice(0, 3))).toEqual(['   ', 'ALX']);
    const short = result.problems.filter(p => p.ruleId === 'STR-LEN');
    expect(short.map(p => doc.lines[p.line]!.text.length).sort()).toEqual([138, 138, 138, 138, 208, 208, 208, 208, 208, 208, 70]);
    expect(short.every(p => p.severity === 'warning' && p.ghost === true)).toBe(true);
  });

  it('does not touch the document', () => {
    expect(equalBytes(serialize(doc), fixture(SAMPLE))).toBe(true);
  });

  it('is deterministic', () => {
    expect(check(doc).problems).toEqual(result.problems);
  });

  it('reads as problems, never as "valid"', () => {
    expect(result.summary.text).toMatch(/^\d+ problems in [\d,]+ checks: \d+ errors, \d+ warnings$/);
    expect(result.summary.text).not.toMatch(/valid/i);
  });
});

describe('the synthetic files, which have the shape of our own export', () => {
  const files = ['synth-2.1-11works.cwr', 'synth-2.1-11works-opu-owr.cwr', 'synth-2.2-11works.cwr', 'synth-2.2-11works-opu-owr.cwr'];
  for (const name of files) {
    it(`${name}: no errors, no warnings, no notes`, () => {
      const r = check(parse(fixture(`synthetic/${name}`)));
      expect(r.problems).toEqual([]);
      expect(r.summary.text).toMatch(/^No problems found in [\d,]+ checks$/);
    });
  }

  it('the same files with LF endings, no final newline and lower case read as our export does', () => {
    const text = Array.from(fixture('synthetic/synth-2.1-11works.cwr'), c => String.fromCharCode(c))
      .join('')
      .replace(/\r\n/g, '\n')
      .replace(/\n$/, '')
      .replace('AMBER HARBOUR', 'Amber Harbour');
    const r = check(parse(Uint8Array.from(text, c => c.charCodeAt(0))));
    const ids = new Set(r.problems.map(p => p.ruleId));
    expect(ids).toEqual(new Set(['ENC-001', 'FMT-UC']));
    expect(r.problems.filter(p => p.ruleId === 'ENC-001')).toHaveLength(1);
  });
});

describe('big files', () => {
  // One 10,000-work file (2.2, the larger shape) and a 1,000-work 2.1 file. The bound is loose on purpose: this
  // machine is often loaded, and the numbers that matter are measured separately.
  const cases: Array<{ version: CwrVersion; works: number; otherParties: boolean }> = [
    { version: '2.2', works: 10000, otherParties: true },
    { version: '2.1', works: 1000, otherParties: false },
  ];
  for (const { version, works, otherParties } of cases) {
    it(`${version}, ${works} works: no problems at all, within a generous bound`, () => {
      const bytes = generateCwr({ version, works, otherParties });
      const doc = parse(bytes);
      const t0 = performance.now();
      const r = check(doc);
      const ms = performance.now() - t0;
      console.log(`${version} ${works} works: ${(bytes.length / 1e6).toFixed(1)} MB, ${doc.records.length} records | check ${ms.toFixed(0)} ms, ${r.checked.toLocaleString('en-US')} checks`);
      expect(r.problems).toEqual([]);
      expect(ms).toBeLessThan(10000);
    }, 120000);
  }
});

describe('the registry', () => {
  it('has unique ids, a citation and a message on every rule', () => {
    const ids = BUILTIN_RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of BUILTIN_RULES) {
      expect(r.source.slug, r.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(r.source.slug.startsWith('secondary/'), r.id).toBe(r.secondary === true);
      expect(r.source.quote, r.id).toBe('');
      expect(r.message.length, r.id).toBeGreaterThan(10);
      expect(r.title.length, r.id).toBeGreaterThan(3);
    }
  });

  it('never uses the word "valid" in a rule message', () => {
    for (const r of BUILTIN_RULES) expect(r.message, r.id).not.toMatch(/\bvalid/i);
  });

  it('runs a rule added from outside, and refuses a duplicate id', () => {
    const extra: RuleDef = defineRule({
      id: 'TEST-1',
      title: 'Test rule',
      severity: 'info',
      scope: 'file',
      versions: ['2.1', '2.2'],
      message: 'The file has {n} records.',
      source: { slug: 'cisac/cwr-functional-spec-2-1', quote: 'Records are variable length' },
      run(ctx) {
        ctx.report({ line: -1, params: { n: ctx.doc.records.length } });
      },
    });
    const registry = createRegistry([...BUILTIN_RULES, extra]);
    const doc = parse(generateCwr({ version: '2.1', works: 2 }));
    const r = check(doc, { registry });
    expect(r.problems.find(p => p.ruleId === 'TEST-1')).toMatchObject({ severity: 'info', line: -1, span: null, message: `The file has ${doc.records.length} records.` });
    expect(() => createRegistry([extra, extra])).toThrow(/duplicate/);
    expect(BUILTIN_REGISTRY.get('TEST-1')).toBeUndefined();
  });

  it('skips disabled rules and does not count their checks', () => {
    const doc = parse(generateCwr({ version: '2.1', works: 3, eol: '\n' })); // LF endings: ENC-001, a warning
    const all = check(doc);
    const some = check(doc, { disable: ['ENC-001', 'FMT-UC'] });
    expect(all.summary.warnings).toBeGreaterThan(0);
    expect(some.summary.warnings).toBe(0);
    expect(some.checked).toBeLessThan(all.checked);
  });

  it('checks fewer things on a smaller file', () => {
    const small = check(parse(generateCwr({ version: '2.1', works: 3 })));
    const big = check(parse(generateCwr({ version: '2.1', works: 30 })));
    expect(big.checked).toBeGreaterThan(small.checked * 5);
  });

  it('names no rule for a version it does not run on', () => {
    const r21 = new Set(BUILTIN_REGISTRY.forVersion('2.1').map(r => r.id));
    const r22 = new Set(BUILTIN_REGISTRY.forVersion('2.2').map(r => r.id));
    expect(r21.has('NWR-T-018')).toBe(true);
    expect(r21.has('NWR-T-043')).toBe(false);
    expect(r22.has('NWR-T-043')).toBe(true);
    expect(r22.has('NWR-T-018')).toBe(false);
  });
});
