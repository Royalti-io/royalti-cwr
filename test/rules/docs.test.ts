import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, FIELD_EDITS } from '../../src/index';

// docs/RULES.md has the rule table. It is generated from the registry when the package is exported, so this keeps the two from drifting.
describe('docs/RULES.md', () => {
  const doc = readFileSync(fileURLToPath(new URL('../../docs/RULES.md', import.meta.url)), 'utf8');
  const rows = new Map<string, string[]>();
  for (const line of doc.split('\n')) {
    const m = /^\| `([A-Z0-9-]+)` \|(.*)\|\s*$/.exec(line);
    if (m) rows.set(m[1]!, m[2]!.split('|').map(c => c.trim()));
  }

  it('lists every rule exactly once with its severity, scope, versions and source', () => {
    expect([...rows.keys()].sort()).toEqual(BUILTIN_RULES.map(r => r.id).sort());
    for (const r of BUILTIN_RULES) {
      const [severity, scope, versions, , source] = rows.get(r.id)!;
      expect(severity!.split(' ')[0], r.id).toBe(r.severity);
      expect(scope, r.id).toBe(r.scope);
      expect(versions, r.id).toBe(r.versions.join(', '));
      expect(source, r.id).toBe('`' + r.source.slug + '`');
    }
  });

  it('states the rule count and the FR table size it is built on', () => {
    expect(doc).toContain(`The ${BUILTIN_RULES.length} rules`);
    expect(doc).toContain(`${FIELD_EDITS.length} fields`);
  });
});
