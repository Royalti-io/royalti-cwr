import { beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_ROWS, buildDoc } from '../../src/index';
import { bundleEntry } from '../support/bundle';
import type { Bundled } from '../support/bundle';
import { HEADER } from './support';

let build: Bundled;
let lite: Bundled;

beforeAll(async () => {
  build = await bundleEntry('build');
  lite = await bundleEntry('lite');
}, 120000);

describe('the build entry carries the builder, quote-free, and lite does not', () => {
  it('exports the same builder names as the full build', () => {
    for (const name of ['buildDoc', 'checkRows', 'checkHeader', 'parseCsv', 'readTemplateRows', 'templateCsv', 'exampleCsv', 'EXAMPLE_ROWS', 'TEMPLATE_COLUMNS', 'BuildError']) {
      expect(build.mod[name], name).toBeDefined();
      expect(lite.mod[name], name).toBeUndefined();
    }
  });

  it('carries no specification quotes', () => {
    for (const r of (build.mod.BUILTIN_RULES ?? []) as { source: { quote: string } }[]) expect(r.source.quote).toBe('');
  });

  it('builds the example into the same file as the full build, with no problems from its checker', () => {
    const full = buildDoc(EXAMPLE_ROWS, HEADER).text;
    const built = build.mod.buildDoc(build.mod.EXAMPLE_ROWS, HEADER) as { text: string; doc: unknown };
    expect(built.text).toBe(full);
    expect(build.mod.checkRows(build.mod.EXAMPLE_ROWS)).toEqual([]);
    expect(lite.mod.check(built.doc).summary.problems).toBe(0);
  });

  it('reads the example back from its CSV', () => {
    const read = build.mod.readTemplateRows(build.mod.parseCsv(build.mod.exampleCsv()));
    expect(read.rows).toEqual(EXAMPLE_ROWS);
  });
});
