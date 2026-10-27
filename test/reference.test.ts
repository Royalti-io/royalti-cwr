import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as full from '../src/index';
import * as ref from '../src/reference/index';
import { allFields } from '../src/spec/index';
import { fixture, SAMPLE } from './helpers';
import { bundleEntry } from './support/bundle';

// The reference module of this package holds no quotations from the specifications: every quote is an empty string and no lookup table has labels.
// What it holds is which document each rule, field and edit rests on.
describe('reference data', () => {
  it('gives every rule its source slugs and an empty quote', () => {
    for (const r of full.BUILTIN_RULES) {
      const c = ref.ruleCitations(r.id)!;
      expect(c.source).toEqual({ slug: r.source.slug, quote: '' });
      expect(c.alsoSource).toEqual((r.alsoSource ?? []).map(x => ({ slug: x.slug, quote: '' })));
    }
    expect(ref.ruleCitations('NOPE-1')).toBeUndefined();
    expect(ref.ruleCitations('constructor')).toBeUndefined();
  });

  it('gives every spec field its slug, for both versions, and resolves aliases', () => {
    for (const v of ['2.1', '2.2'] as const) {
      for (const f of allFields(v)) {
        const c = ref.fieldCitation(v, f.record, f.id)!;
        expect(c.slug).toBe(f.source.slug);
        expect(c.quote).toBe('');
        expect(c.impliedQuote).toBeUndefined();
        expect(c.notes).toBeUndefined();
      }
    }
    expect(ref.fieldCitation('2.1', 'REV', 'workTitle')).toEqual(ref.fieldCitation('2.1', 'NWR', 'workTitle'));
    expect(ref.fieldCitation('2.2', 'OPT', 'tisNumericCode')).toBeDefined();
    expect(ref.fieldCitation('2.1', 'NWR', 'nope')).toBeUndefined();
  });

  it('gives every FR edit its key, with an empty quote', () => {
    for (const e of full.FIELD_EDITS) {
      expect(ref.editCitation('2.1', e.layout, e.fieldId)).toEqual({ edit: e.edit, citation: { slug: 'cisac/cwr-functional-spec-2-1', quote: '' } });
      expect(ref.editCitation('2.2', e.layout, e.fieldId)!.citation.quote).toBe('');
    }
    expect(ref.editCitation('2.1', 'NWR', 'workTitle')).toBeUndefined();
  });

  it('has no lookup labels, apart from the name of the world territory', () => {
    expect(ref.lookupLabel('tis', '2136')).toBe('World');
    expect(ref.lookupLabel('titleType', 'AT')).toBeUndefined();
    expect(ref.lookupRow('titleType', 'AT')).toBeUndefined();
    expect(ref.lookupLabel('constructor', 'AT')).toBeUndefined();
  });

  it('names every document the engine cites, with an address', () => {
    const slugs = new Set<string>();
    for (const r of full.BUILTIN_RULES) for (const c of [r.source, ...(r.alsoSource ?? [])]) slugs.add(c.slug);
    for (const v of ['2.1', '2.2'] as const) for (const f of allFields(v)) slugs.add(f.source.slug);
    for (const s of slugs) expect(ref.sourceInfo(s)?.title, s).toBeTruthy();
    expect(ref.sourceInfo('cisac/cwr-functional-spec-2-1')).toMatchObject({ title: 'CWR 2.1 functional specification', access: 'members' });
    expect(ref.sourceInfo('cisac/cwr-functional-spec-2-1')?.url).toMatch(/^https:\/\//);
    expect(ref.sourceInfo('cisac/cwr-functional-spec-2-2')).toMatchObject({ title: 'CWR 2.2 functional specification', access: 'members' });
    expect(ref.sourceInfo('hasOwnProperty')).toBeUndefined();
  });

  it('explains a real problem: its rule, its field row and its FR edit key', () => {
    const doc = full.parse(fixture(SAMPLE));
    const r = full.check(doc);
    const withField = r.problems.find(p => p.fieldId !== undefined && p.record !== undefined)!;
    const c = ref.citationsFor(withField, doc);
    expect(c.rule?.source.slug).toMatch(/^[a-z0-9-]+\//);
    expect(c.rule?.source.quote).toBe('');
    expect(c.field?.slug).toMatch(/^cisac\/cwr-functional-spec-2-[12]$/);
    const wholeFile = ref.citationsFor({ ruleId: r.problems[0]!.ruleId }, doc);
    expect(wholeFile.field).toBeUndefined();
  });

  it('does not pull the engine in: its bundle is data and small functions', async () => {
    const b = await bundleEntry('reference');
    expect(b.code).not.toContain('UnsupportedVersionError');
    expect(b.code).not.toContain('serialize');
    expect(Object.keys(b.mod).sort()).toEqual(
      ['SOURCES', 'citationsFor', 'editCitation', 'fieldCitation', 'lookupLabel', 'lookupRow', 'ruleCitations', 'sourceInfo'].sort(),
    );
  });
});

describe('package.json', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

  it('exports the full, lite and reference builds with types for both module systems', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './lite', './package.json', './reference']);
    for (const [key, name] of [['.', 'index'], ['./lite', 'lite'], ['./reference', 'reference']] as const) {
      expect(pkg.exports[key]).toEqual({
        import: { types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` },
        require: { types: `./dist/${name}.d.cts`, default: `./dist/${name}.cjs` },
      });
    }
  });

  it('is public version 0.3.1 with its repository set, ships dist, the licence and the readme, and has no dependencies', () => {
    expect(pkg.name).toBe('@royalti/cwr');
    expect(pkg.version).toBe('0.3.1');
    expect(pkg.private).toBeUndefined();
    expect(pkg.repository).toEqual({ type: 'git', url: 'https://github.com/Royalti-io/royalti-cwr' });
    expect(pkg.license).toBe('MIT');
    expect(pkg.files).toEqual(['dist', 'LICENSE', 'README.md']);
    expect(pkg.dependencies).toBeUndefined();
  });
});
