import { beforeAll, describe, expect, it } from 'vitest';
import * as full from '../src/index';
import { fixture, SAMPLE } from './helpers';
import { bundleEntry } from './support/bundle';
import type { Bundled } from './support/bundle';

let lite: Bundled;

beforeAll(async () => {
  lite = await bundleEntry('lite');
}, 60000);

// In this package the lite entry and the full entry carry the same data (neither has specification text). The lite entry stays so
// a page can keep importing `@royalti/cwr/lite` in a worker; these tests keep it equal to the full entry.
describe('the lite entry', () => {
  it('exports the full API except the lookup label functions', () => {
    const fullKeys = Object.keys(full).sort();
    const liteKeys = Object.keys(lite.mod).sort();
    expect(fullKeys.filter(k => !liteKeys.includes(k))).toEqual(['lookupLabel', 'lookupRow']);
    expect(liteKeys.filter(k => !fullKeys.includes(k))).toEqual([]);
  });

  it('keeps every rule: same ids, titles, severities, slugs and empty quotes', () => {
    const a = full.BUILTIN_RULES.map(r => [r.id, r.title, r.severity, r.scope, r.source.slug, (r.alsoSource ?? []).map(c => c.slug), r.specAction, r.cisac]);
    const b = (lite.mod.BUILTIN_RULES as typeof full.BUILTIN_RULES).map(r => [r.id, r.title, r.severity, r.scope, r.source.slug, (r.alsoSource ?? []).map(c => c.slug), r.specAction, r.cisac]);
    expect(b).toEqual(a);
    for (const r of lite.mod.BUILTIN_RULES as typeof full.BUILTIN_RULES) {
      expect(r.source.quote).toBe('');
      for (const c of r.alsoSource ?? []) expect(c.quote).toBe('');
    }
  });

  it('keeps field names and slugs for tooltips', () => {
    expect(lite.mod.fieldInfo('2.2', 'SWR', 'prOwnershipShare')).toEqual(full.fieldInfo('2.2', 'SWR', 'prOwnershipShare'));
    expect(lite.mod.fieldInfos('2.1', 'NWR')).toEqual(full.fieldInfos('2.1', 'NWR'));
  });

  /** A deterministic scramble: replaces characters at pseudo-random places so many rules fire. */
  function scramble(bytes: Uint8Array, seed: number, count: number): Uint8Array {
    const out = bytes.slice();
    let x = seed;
    const next = (): number => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
    const pool = [...'0123456789 ABXYZ*-.,'].map(c => c.charCodeAt(0));
    for (let i = 0; i < count; i++) {
      const at = next() % out.length;
      if (out[at] === 10 || out[at] === 13) continue;
      out[at] = pool[next() % pool.length]!;
    }
    return out;
  }

  it('finds exactly the same problems as the full entry on damaged files', () => {
    const inputs = [
      fixture(SAMPLE),
      scramble(fixture(SAMPLE), 7, 400),
      scramble(full.generateCwr({ version: '2.1', works: 30, otherParties: true }), 11, 600),
      scramble(full.generateCwr({ version: '2.2', works: 30, otherParties: true }), 13, 600),
      scramble(full.generateCwr({ version: '2.2', works: 30 }), 17, 900),
    ];
    const seenRules = new Set<string>();
    for (const bytes of inputs) {
      let a: full.CheckResult;
      let b: full.CheckResult;
      try {
        a = full.check(full.parse(bytes));
        b = lite.mod.check(lite.mod.parse(bytes));
      } catch (e) {
        // A scramble can turn the version into 3.x; both entries then throw the same error.
        expect(String(e)).toContain('CWR 3.x');
        continue;
      }
      expect(b).toEqual(a);
      for (const p of a.problems) seenRules.add(p.ruleId);
    }
    expect(seenRules.size).toBeGreaterThan(30);
  });
});
