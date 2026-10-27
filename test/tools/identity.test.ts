import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cleanIdentifiers,
  extractWorks,
  findDuplicates,
  findReplace,
  ownedShares,
  parse,
  serialize,
  worksCsv,
} from '../../src/index';
import { equalBytes, fixture, SAMPLE } from '../helpers';
import { onlyWithin, spansOf, synth } from './support';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** Every fixture file: the public sample, the synthetic files, and the generated ones that are small enough to parse here quickly. */
function fixtures(): Array<[string, Uint8Array]> {
  const out: Array<[string, Uint8Array]> = [];
  for (const dir of ['public', 'synthetic', 'generated']) {
    const path = join(root, dir);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name);
      if (!statSync(file).isFile() || /\.(md|txt)$/i.test(name) || name === 'LICENSE') continue;
      if (statSync(file).size > 3_000_000) continue;
      out.push([`${dir}/${name}`, new Uint8Array(readFileSync(file))]);
    }
  }
  return out;
}

describe('identity: serialize(parse(bytes)) is bytes, for every fixture, before and after the read-only tools run', () => {
  const all = fixtures();
  it('finds the fixtures', () => {
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.map(([n]) => n)).toContain('public/CW190001MPC_000.V21');
  });

  it.each(all.map(([n, b]) => [n, b] as const))('%s', (_name, bytes) => {
    const doc = parse(bytes);
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
    // Reading tools, and previews of the editing tools, leave the document exactly as it was.
    findDuplicates(doc);
    ownedShares(doc);
    worksCsv(doc);
    cleanIdentifiers(doc);
    findReplace(doc, { fields: ['workTitle', 'publisherName'], find: 'A', replace: 'B', mode: 'substring' });
    expect(doc.edits.size).toBe(0);
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
    // Taking every transaction out with the header kept writes a file that is itself stable.
    const hs = doc.file.groups.flatMap(g => g.transactions.map(t => t.header));
    if (hs.length > 0 && doc.file.hdr !== undefined) {
      const r = extractWorks(doc, hs, { keepHeader: true });
      if (r.ok) expect(equalBytes(serialize(parse(r.bytes)), r.bytes)).toBe(true);
    }
  });
});

describe('edit locality: after a tool edits fields, the output differs only inside those fields', () => {
  it('on the public sample, mixed line endings and no final newline included', () => {
    const text = new TextDecoder().decode(fixture(SAMPLE)).replace(/\n$/, '').split('\n');
    const eols = ['\n', '\r\n', '\r'];
    const mixed = Uint8Array.from(text.map((l, i) => l + (i === text.length - 1 ? '' : eols[i % 3])).join(''), c => c.charCodeAt(0));
    const doc = parse(mixed);

    const replaced = findReplace(doc, { fields: ['workTitle', 'writerLastName', 'publisherName'], find: 'A', replace: 'B', mode: 'substring', apply: true });
    expect(replaced.ok).toBe(true);
    expect(replaced.changes.length).toBeGreaterThan(50);
    const out = serialize(replaced.doc!);
    expect(out.length).toBe(mixed.length);
    expect(onlyWithin(mixed, out, spansOf(doc, replaced.changes))).toBe(true);

    const cleaned = cleanIdentifiers(replaced.doc!, { apply: true });
    const out2 = serialize(cleaned.doc!);
    expect(out2.length).toBe(out.length);
    expect(onlyWithin(out, out2, spansOf(replaced.doc!, cleaned.changes))).toBe(true);
    // And both together differ from the original only inside the union of the spans.
    expect(onlyWithin(mixed, out2, [...spansOf(doc, replaced.changes), ...spansOf(doc, cleaned.changes)])).toBe(true);
  });

  it('on a synthetic file, for each tool in turn, including the second tool working on the first one\'s result', () => {
    const doc = synth('2.2', 20, true);
    const first = findReplace(doc, { fields: ['workTitle'], find: 'HARBOUR', replace: 'QUAY', mode: 'substring', apply: true });
    const second = findReplace(first.doc!, { fields: ['publisherName'], find: 'SONGS', replace: 'TUNES', mode: 'substring', apply: true });
    const spans = [...spansOf(doc, first.changes), ...spansOf(doc, second.changes)];
    expect(first.changes.length).toBeGreaterThan(0);
    expect(second.changes.length).toBeGreaterThan(0);
    expect(onlyWithin(doc.bytes, serialize(second.doc!), spans)).toBe(true);
  });
});
