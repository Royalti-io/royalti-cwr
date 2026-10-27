import { check, generateCwr, generateCwrText, getField, lineText, parse, serialize, setField } from '../../src/index';
import type { CwrDoc, CwrVersion, ExtractSuccess, RecRef } from '../../src/index';

export const enc = (s: string): Uint8Array => Uint8Array.from(s, c => c.charCodeAt(0));
export const dec = (b: Uint8Array): string => String.fromCharCode(...b);

export function synth(version: CwrVersion, works: number, otherParties = false, seed = 1): CwrDoc {
  return parse(generateCwr({ version, works, otherParties, seed }));
}

/** First record of a type at or after a record ref. */
export function firstOf(doc: CwrDoc, type: string, from = 0): RecRef {
  const ref = doc.records.findIndex((r, i) => i >= from && r.type === type);
  if (ref < 0) throw new Error(`no ${type} record`);
  return ref;
}

/** All record refs of a type. */
export function allOf(doc: CwrDoc, type: string): RecRef[] {
  const out: RecRef[] = [];
  doc.records.forEach((r, i) => {
    if (r.type === type) out.push(i);
  });
  return out;
}

/** Writes values into fields and returns a fresh document parsed from the result, so later steps start from clean bytes. */
export function withFields(doc: CwrDoc, edits: Array<[RecRef, string, string]>): CwrDoc {
  const copy = parse(doc.bytes);
  for (const [ref, field, value] of edits) setField(copy, ref, field, value, { overflow: 'truncate' });
  return parse(serialize(copy));
}

/** Writes characters straight into a record's line, with no checks, and returns a fresh document: for values `setField` would refuse. */
export function withRawText(doc: CwrDoc, ref: RecRef, start: number, text: string): CwrDoc {
  const target = doc.records[ref]!.line;
  const lines = doc.lines.map(l => (l.index === target ? l.text.slice(0, start) + text + l.text.slice(start + text.length) : l.text));
  return parse(enc(lines.join('\r\n') + '\r\n'));
}

/** A line of the given length: spaces, with each (0-based start, text) written in. */
export function place(length: number, ...parts: Array<[number, string]>): string {
  const chars = new Array<string>(length).fill(' ');
  for (const [start, text] of parts) for (let i = 0; i < text.length; i++) chars[start + i] = text[i]!;
  return chars.join('');
}

/** A record line: the type, an 8-digit transaction number, an 8-digit record number, then the rest. */
export function record(type: string, tseq: number, rseq: number, length: number, ...parts: Array<[number, string]>): string {
  return place(length, [0, type + String(tseq).padStart(8, '0') + String(rseq).padStart(8, '0')], ...parts);
}

/** Maximal runs of differing bytes between two buffers of the same length, as [start, end). */
export function diffRuns(a: Uint8Array, b: Uint8Array): Array<[number, number]> {
  if (a.length !== b.length) throw new Error(`length differs: ${a.length} vs ${b.length}`);
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, a.length]);
  return runs;
}

/** Absolute byte spans of edits on an ASCII document (character offset equals byte offset). */
export function spansOf(doc: CwrDoc, changes: ReadonlyArray<{ line: number; start: number; end: number }>): Array<[number, number]> {
  return changes.map(c => [doc.lines[c.line]!.byteStart + c.start, doc.lines[c.line]!.byteStart + c.end] as [number, number]);
}

/** True when every differing byte of `after` lies inside one of the spans. */
export function onlyWithin(before: Uint8Array, after: Uint8Array, spans: ReadonlyArray<[number, number]>): boolean {
  return diffRuns(before, after).every(([s, e]) => spans.some(([a, b]) => s >= a && e <= b));
}

/** A small RFC 4180 reader for the tests. Expects a document with a trailing line ending. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The text of a record's field with padding trimmed. */
export const fieldText = (doc: CwrDoc, ref: RecRef, id: string): string => (getField(doc, ref, id) ?? '').trim();

export { generateCwr, generateCwrText, lineText };

/**
 * Builds a file from groups of transactions, each transaction a list of record lines that start with their type. Numbering
 * and counts are written here, independently of `extractWorks`, so tests can build multi-group sources.
 */
export function assemble(base: CwrDoc, groups: Array<{ type: string; version?: string; txns: string[][] }>, eol = '\r\n'): Uint8Array {
  const hdr = lineText(base, base.records[base.file.hdr!]!.line);
  const lines: string[] = [hdr];
  let txnTotal = 0;
  groups.forEach((g, gi) => {
    lines.push(`GRH${g.type}${String(gi + 1).padStart(5, '0')}${g.version ?? '02.10'}0000000000`);
    let count = 2;
    g.txns.forEach((txn, ti) => {
      txn.forEach((line, ri) => {
        lines.push(line.slice(0, 3) + String(ti).padStart(8, '0') + String(ri).padStart(8, '0') + line.slice(19));
        count++;
      });
    });
    txnTotal += g.txns.length;
    lines.push(`GRT${String(gi + 1).padStart(5, '0')}${String(g.txns.length).padStart(8, '0')}${String(count).padStart(8, '0')}`);
  });
  lines.push(`TRL${String(groups.length).padStart(5, '0')}${String(txnTotal).padStart(8, '0')}${String(lines.length + 1).padStart(8, '0')}`);
  return enc(lines.join(eol) + eol);
}

/** The text lines of each work transaction of a document, as records are written (edits applied). */
export function txnLines(doc: CwrDoc): string[][] {
  return doc.file.groups.flatMap(g => g.transactions.map(t => [t.header, ...t.records].map(r => lineText(doc, doc.records[r]!.line))));
}

/**
 * Opens the bytes an extraction returned the way a receiver does, with no encoding given, and checks that no chosen work has an error
 * rule it did not have in the source. The work is matched by its place: the nth transaction of the output is the nth chosen one.
 */
export function expectReadsLikeSource(source: CwrDoc, result: ExtractSuccess): void {
  const out = parse(result.bytes);
  const outTxns = out.file.groups.flatMap(g => g.transactions);
  const srcTxns = result.selected.map(h => source.file.groups.flatMap(g => g.transactions).find(t => t.header === h)!);
  if (outTxns.length !== srcTxns.length) throw new Error(`${outTxns.length} transactions in the output, ${srcTxns.length} chosen`);
  const rulesOn = (doc: CwrDoc, problems: ReturnType<typeof check>['problems'], t: { header: RecRef; records: RecRef[] }): Set<string> => {
    const lines = new Set([t.header, ...t.records].map(r => doc.records[r]!.line));
    return new Set(problems.filter(p => p.severity === 'error' && lines.has(p.line)).map(p => p.ruleId));
  };
  const before = check(source).problems;
  const after = check(out).problems;
  outTxns.forEach((t, i) => {
    const had = rulesOn(source, before, srcTxns[i]!);
    const added = [...rulesOn(out, after, t)].filter(rule => !had.has(rule));
    if (added.length > 0) throw new Error(`chosen work ${i} (source line ${source.records[srcTxns[i]!.header]!.line + 1}) has errors in the output it did not have in the source: ${added.join(', ')}`);
  });
}
