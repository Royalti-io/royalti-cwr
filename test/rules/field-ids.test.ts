import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CwrVersion } from '../../src/index';
import { allFields } from '../../src/spec/index';
import { FIELD_EDITS } from '../../src/rules/fieldEdits';
import { layoutFor } from '../../src/spec/index';

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

function sources(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (dirUrl: URL): void => {
    for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts')) out.push({ file: entry.name, text: readFileSync(fileURLToPath(child), 'utf8') });
    }
  };
  walk(new URL('../../src/rules/', import.meta.url));
  return out;
}

describe('field ids named in the rule code exist in the generated spec', () => {
  // A literal id in these calls would otherwise only fail at run time, as a silently skipped check.
  const call = /\b(?:fld|getField|spanOf|findField|completeField)\([^()'"]*(?:\([^()]*\))?[^()'"]*,\s*'([A-Za-z0-9]+)'/g;
  // Part 2 names ids in other ways too: onField(ctx, rec, 'id'), fieldRel(ctx, rec, 'id', ...), fieldOfType(doc, 'REC', 'id'),
  // a filter `ids: ['a', 'b']`, and OWN_ID / COL_ID tables. All of them are scanned.
  const call2 = /\b(?:onField|fieldRel|reaches)\([^()'"]*(?:\([^()]*\))?[^()'"]*,\s*'([A-Za-z0-9]+)'/g;
  const call3 = /\bfieldOfType\([^()'"]*,\s*'[A-Z]{3}',\s*'([A-Za-z0-9]+)'/g;
  const arrays = /\bids:\s*\[([^\]]*)\]/g;
  const found = new Map<string, string>();
  for (const { file, text } of sources()) {
    for (const m of text.matchAll(call)) found.set(m[1]!, file);
    for (const m of text.matchAll(call2)) found.set(m[1]!, file);
    for (const m of text.matchAll(call3)) found.set(m[1]!, file);
    for (const m of text.matchAll(arrays)) for (const id of m[1]!.matchAll(/'([A-Za-z0-9]+)'/g)) found.set(id[1]!, file);
  }
  // Fields that exist in CWR 2.2 only: the HDR Version and Revision, and the XRF Identifier Type. Not expected in 2.1.
  const only22 = new Set(['version', 'revision', 'identifierType']);

  it('finds the ids it should (the scan is not empty)', () => {
    expect(found.size).toBeGreaterThan(30);
    expect(found.has('workTitle')).toBe(true);
  });

  for (const version of VERSIONS) {
    it(`${version}: every named id is a field of some record`, () => {
      const ids = new Set(allFields(version).map(f => f.id));
      const missing = [...found].filter(([id]) => !ids.has(id) && !(version === '2.1' && only22.has(id))).map(([id, file]) => `${file}: ${id}`);
      expect(missing).toEqual([]);
    });

    it(`${version}: every FR field edit names a real field of its layout, and a layout that exists`, () => {
      const bad: string[] = [];
      for (const e of FIELD_EDITS) {
        if (!e.versions.includes(version)) continue;
        const layout = layoutFor(version, e.layout);
        const f = allFields(version).find(x => x.record === layout && x.id === e.fieldId);
        if (!layout || !f) bad.push(`${e.layout}.${e.fieldId}`);
        else if (f.format === 'A') bad.push(`${e.layout}.${e.fieldId} is alphabetic, so no format or table rule can use an FR edit on it`);
      }
      expect(bad).toEqual([]);
    });
  }
});
