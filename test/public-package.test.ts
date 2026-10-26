import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, FIELD_EDITS } from '../src/index';
import { allFields } from '../src/spec/index';
import { LOOKUPS } from '../src/spec/lookups/index';

// What makes this the public package: it carries rules, positions and codes, and no passages or quotations from the CISAC specifications.
describe('the public package holds no quotations from the specifications in its data', () => {
  it('every rule keeps its source slug and has an empty quote', () => {
    expect(BUILTIN_RULES.length).toBeGreaterThan(150);
    for (const r of BUILTIN_RULES) {
      expect(r.source.slug, r.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(r.source.quote, r.id).toBe('');
      for (const c of r.alsoSource ?? []) {
        expect(c.slug, r.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
        expect(c.quote, r.id).toBe('');
      }
    }
  });

  it('every spec field row keeps its name, position and slug, and has no quote or note', () => {
    let n = 0;
    for (const v of ['2.1', '2.2'] as const) {
      for (const f of allFields(v)) {
        n++;
        expect(f.name.length, f.id).toBeGreaterThan(0);
        expect(f.source.slug, f.id).toMatch(/^cisac\//);
        expect(f.source.quote, f.id).toBe('');
        expect(f.source.impliedQuote ?? '', f.id).toBe('');
        expect(f.notes ?? '', f.id).toBe('');
      }
    }
    expect(n).toBeGreaterThan(700);
  });

  it('the FR edit table has no quotes', () => {
    expect(FIELD_EDITS.length).toBeGreaterThan(30);
    for (const e of FIELD_EDITS) {
      expect(e.quote, `${e.layout}.${e.fieldId}`).toBe('');
      expect(e.quote22 ?? '', `${e.layout}.${e.fieldId}`).toBe('');
    }
  });

  it('lookup tables keep codes, scope and status; descriptions only for society names; details only for the TIS flags', () => {
    let rows = 0;
    for (const [id, table] of Object.entries(LOOKUPS)) {
      for (const row of table.rows) {
        rows++;
        expect(row.code.length, id).toBeGreaterThan(0);
        expect(row.scope, id).toBeTruthy();
        if (id !== 'societyCode') expect(row.description, `${id} ${row.code}`).toBe('');
        else expect(row.description.length, row.code).toBeLessThan(40);
        if (id === 'tis') expect(row.detail ?? '', row.code).toMatch(/^(?:type GROUP;|TIS-A [A-Z]{2};)?$/);
        else expect(row.detail, `${id} ${row.code}`).toBeUndefined();
      }
    }
    expect(rows).toBeGreaterThan(2000);
  });
});
