import { describe, expect, it } from 'vitest';
import type { CwrVersion } from '../../src/index';
import { clean, cleanTwoGroups } from './support';

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

describe('baselines used by the planted-defect tests', () => {
  for (const version of VERSIONS) {
    it(`${version}: the one-group baseline has no problems`, () => {
      const r = clean(version).run();
      expect(r.problems).toEqual([]);
      expect(r.summary.text).toMatch(/^No problems found in [\d,]+ checks$/);
    });
    it(`${version}: the two-group baseline has no problems`, () => {
      const r = cleanTwoGroups(version).run();
      expect(r.problems).toEqual([]);
    });
  }
});
