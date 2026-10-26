import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { CwrDoc } from '../src/index';

export const fixture = (rel: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url))));

export const SAMPLE = 'public/CW190001MPC_000.V21';

export const ascii = (s: string): Uint8Array => Uint8Array.from(s, c => c.charCodeAt(0));

export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** The structural invariants every parse must meet, whatever the input. */
export function expectSound(doc: CwrDoc): void {
  // Lines tile the bytes after the BOM, in order, with no gap.
  let at = doc.bom ? 3 : 0;
  for (const line of doc.lines) {
    expect(line.byteStart).toBe(at);
    expect(line.byteEnd).toBeGreaterThanOrEqual(line.byteStart);
    at = line.byteEnd;
  }
  expect(at).toBe(doc.bytes.length);

  // Every record appears exactly once at the top level of the structure: nothing dropped, nothing doubled.
  const seen = new Array<number>(doc.records.length).fill(0);
  const mark = (ref: number | undefined): void => {
    if (ref !== undefined) seen[ref] = (seen[ref] ?? 0) + 1;
  };
  mark(doc.file.hdr);
  mark(doc.file.trl);
  for (const g of doc.file.groups) {
    mark(g.grh);
    mark(g.grt);
    for (const t of g.transactions) {
      mark(t.header);
      t.records.forEach(mark);
    }
  }
  doc.orphans.forEach(mark);
  // ACK-carried headers are listed in both `records` and `inner`; `inner` is not counted above.
  expect(seen.every(c => c === 1)).toBe(true);

  // Records and lines agree.
  doc.records.forEach((rec, ref) => expect(doc.recordOfLine[rec.line]).toBe(ref));
}
