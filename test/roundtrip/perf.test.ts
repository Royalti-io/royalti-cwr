import { describe, expect, it } from 'vitest';
import { generateCwr, getWorkView, parse, serialize } from '../../src/index';
import { equalBytes } from '../helpers';

// A rough proxy for the browser target (10 MB parsed in under 3 s). The bound is deliberately loose
// so a busy CI machine does not flake; real timings depend on the machine.
describe('10,000-work file', () => {
  it('parses, groups and serialises within a generous bound', () => {
    const bytes = generateCwr({ version: '2.2', works: 10000, otherParties: true });
    const t0 = performance.now();
    const doc = parse(bytes);
    const t1 = performance.now();
    const out = serialize(doc);
    const t2 = performance.now();
    let view = 0;
    for (const txn of doc.file.groups[0]!.transactions) view += getWorkView(doc, txn)!.writers.length;
    const t3 = performance.now();
    console.log(
      `10k works: ${(bytes.length / 1e6).toFixed(1)} MB, ${doc.lines.length} lines | parse ${(t1 - t0).toFixed(0)} ms, serialize ${(t2 - t1).toFixed(0)} ms, work views ${(t3 - t2).toFixed(0)} ms`,
    );
    expect(equalBytes(out, bytes)).toBe(true);
    expect(view).toBe(20000);
    expect(t1 - t0).toBeLessThan(5000);
  });
});
