import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIELD_REFS } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { fieldsOf } from '../../src/spec/index';

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

describe('field ids the model code references exist in the generated spec', () => {
  for (const version of VERSIONS) {
    for (const [name, ref] of Object.entries(FIELD_REFS)) {
      it(`${version}: ${name} is ${ref.record}.${ref.id}`, () => {
        const field = fieldsOf(version, ref.record).find(f => f.id === ref.id);
        expect(field, `${ref.record}.${ref.id}`).toBeDefined();
        expect(field!.status).not.toBe('aggregate');
      });
    }
  }

  it('src/model and src/write name no field by a string literal outside FIELD_REFS', () => {
    // A literal id in getField/setField/fieldSpan/findField/write(...) would escape the check above.
    const call = /\b(getField|setField|fieldSpan|findField)\(\s*[^,()]+(?:\([^()]*\))?[^,()]*,\s*(?:[^,()]+,\s*)?'([A-Za-z0-9]+)'/g;
    const found: string[] = [];
    for (const dir of ['../../src/model/', '../../src/write/']) {
      const base = fileURLToPath(new URL(dir, import.meta.url));
      for (const file of readdirSync(base).filter(f => f.endsWith('.ts'))) {
        const text = readFileSync(base + file, 'utf8');
        for (const m of text.matchAll(call)) found.push(`${file}: ${m[1]}(..., '${m[2]}')`);
        for (const m of text.matchAll(/\bwrite\([^,]+,\s*'([A-Za-z0-9]+)'/g)) found.push(`${file}: write(..., '${m[1]}')`);
      }
    }
    expect(found).toEqual([]);
  });
});
