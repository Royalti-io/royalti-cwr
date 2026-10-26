import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  FIELD_FORMAT_NAMES,
  HEADLINE_MAX,
  UnsupportedVersionError,
  BUILTIN_RULES,
  check,
  checkSteps,
  createCancelToken,
  createRegistry,
  defineRule,
  fieldInfo,
  fieldInfos,
  formatShare,
  generateCwr,
  headlineOf,
  lookupLabel,
  lookupRow,
  parse,
  parseSteps,
  sniff,
  workSummaries,
  workSummary,
} from '../src/index';
import type { Progress } from '../src/index';
import { ascii, fixture, SAMPLE } from './helpers';

const synth = (works: number, version: '2.1' | '2.2' = '2.2', otherParties = false): Uint8Array => generateCwr({ version, works, otherParties });

describe('digit grouping in the summary sentence (CR-6)', () => {
  // A file rule that reports one error per call, so the count is exact and the test does not depend on the fixtures.
  const many = (n: number, severity: 'error' | 'warning') =>
    defineRule({
      id: `X-${severity}`,
      title: 'x',
      severity,
      scope: 'file',
      versions: ['2.1', '2.2'],
      message: 'x',
      source: { slug: 'a', quote: 'b' },
      run(ctx) {
        for (let i = 0; i < n; i++) ctx.report({ line: -1 });
      },
    });

  it('groups the error and warning counts like the problem and check counts', () => {
    const registry = createRegistry([many(290000, 'error'), many(20001, 'warning')]);
    const r = check(parse(new Uint8Array(0)), { registry, maxPerRule: 5 });
    expect(r.summary.text).toBe('310,001 problems in 2 checks: 290,000 errors, 20,001 warnings');
    expect(r.summary.errors).toBe(290000);
  });

  it('leaves small counts and the singular forms alone', () => {
    const registry = createRegistry([many(1, 'error'), many(999, 'warning')]);
    expect(check(parse(new Uint8Array(0)), { registry }).summary.text).toBe('1,000 problems in 2 checks: 1 error, 999 warnings');
  });
});

describe('progress and cancel (CR-5)', () => {
  const bytes = synth(1200, '2.2', true);

  it('check reports increasing progress between 0 and 1 and returns the same result as without callbacks', () => {
    const doc = parse(bytes);
    const seen: Progress[] = [];
    const withCb = check(doc, { onProgress: p => seen.push({ ...p }) });
    expect(seen.length).toBeGreaterThan(2);
    let last = 0;
    for (const p of seen) {
      expect(p.task).toBe('check');
      expect(p.fraction).toBeGreaterThanOrEqual(last);
      expect(p.fraction).toBeLessThanOrEqual(1);
      last = p.fraction;
    }
    expect(seen[seen.length - 1]!.fraction).toBe(1);
    expect(withCb).toEqual(check(doc));
  });

  it('parse reports progress and returns the same document as without callbacks', () => {
    const seen: Progress[] = [];
    const a = parse(bytes, { onProgress: p => seen.push({ ...p }) });
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.every(p => p.task === 'parse')).toBe(true);
    expect(seen.map(p => p.fraction)).toEqual([...seen.map(p => p.fraction)].sort((x, y) => x - y));
    expect(seen[seen.length - 1]!.stage).toBe('structure');
    const b = parse(bytes);
    expect(a.lines.length).toBe(b.lines.length);
    expect(a.records).toEqual(b.records);
    expect(a.file).toEqual(b.file);
  });

  it('a signal that is already aborted stops both before any work', () => {
    const token = createCancelToken();
    token.cancel();
    expect(() => parse(bytes, { signal: token.signal })).toThrow(CancelledError);
    const doc = parse(bytes);
    expect(() => check(doc, { signal: token.signal })).toThrow(CancelledError);
  });

  it('cancelling from inside onProgress stops the run at the next step', () => {
    const doc = parse(bytes);
    const token = createCancelToken();
    let calls = 0;
    expect(() =>
      check(doc, {
        signal: token.signal,
        onProgress: () => {
          if (++calls === 2) token.cancel();
        },
      }),
    ).toThrow(CancelledError);
    expect(calls).toBe(2);
    const t2 = createCancelToken();
    let pcalls = 0;
    expect(() =>
      parse(bytes, {
        signal: t2.signal,
        onProgress: () => {
          if (++pcalls === 1) t2.cancel();
        },
      }),
    ).toThrow(CancelledError);
  });

  it('an AbortSignal-shaped object works (anything with a boolean aborted)', () => {
    let aborted = false;
    const signal = {
      get aborted() {
        return aborted;
      },
    };
    const doc = parse(bytes);
    expect(() => check(doc, { signal, onProgress: () => (aborted = true) })).toThrow(CancelledError);
  });

  it('CancelledError is an Error with a code', () => {
    const e = new CancelledError();
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('CANCELLED');
  });

  it('the step generators yield between steps, and stopping early leaves nothing running', () => {
    const steps = parseSteps(bytes);
    let n = 0;
    let r = steps.next();
    while (!r.done) {
      n++;
      r = steps.next();
    }
    expect(n).toBeGreaterThan(2);
    const doc = r.value;
    const gen = checkSteps(doc);
    expect(gen.next().done).toBe(false);
    gen.return(undefined as never); // the host stops: no result, no throw
    const full = checkSteps(doc);
    let res = full.next();
    while (!res.done) res = full.next();
    expect(res.value).toEqual(check(doc));
  });

  it('works on the public sample too', () => {
    const doc = parse(fixture(SAMPLE));
    const seen: number[] = [];
    const r = check(doc, { onProgress: p => seen.push(p.fraction) });
    expect(seen.length).toBeGreaterThan(0);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});

describe('sniff (CR-7)', () => {
  it('recognises CWR 2.1 and 2.2 by their records, with the version', () => {
    expect(sniff(synth(3, '2.1'))).toMatchObject({ kind: 'cwr2', reason: 'records', version: '2.1' });
    expect(sniff(synth(3, '2.2'))).toMatchObject({ kind: 'cwr2', reason: 'records', version: '2.2' });
    const s = sniff(fixture(SAMPLE));
    expect(s.kind).toBe('cwr2');
    expect(s.recordsSeen).toBeGreaterThan(5);
    expect(s.firstLine.startsWith('HDR')).toBe(true);
  });

  it('still calls a damaged CWR file CWR when its records are recognisable', () => {
    const text = new TextDecoder().decode(synth(2)).replace(/NWR0000000000000000/g, 'NWR');
    expect(sniff(ascii(text)).kind).toBe('cwr2');
  });

  it('recognises binary files by signature, with the reason and the first characters', () => {
    expect(sniff(ascii('%PDF-1.7\n1 0 obj'))).toMatchObject({ kind: 'binary', reason: 'pdf', firstLine: '%PDF-1.7' });
    expect(sniff(Uint8Array.from([0x50, 0x4b, 3, 4, 20, 0, 6, 0]))).toMatchObject({ kind: 'binary', reason: 'zip' });
    expect(sniff(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toMatchObject({ kind: 'binary', reason: 'ole' });
    expect(sniff(Uint8Array.from([0x1f, 0x8b, 8, 0]))).toMatchObject({ kind: 'binary', reason: 'gzip' });
    expect(sniff(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10]))).toMatchObject({ kind: 'binary', reason: 'image' });
  });

  it('calls NUL bytes in the first 4 KB binary, but not a NUL after that', () => {
    expect(sniff(Uint8Array.from([72, 68, 82, 0, 1, 2]))).toMatchObject({ kind: 'binary', reason: 'nul-bytes' });
    const late = new Uint8Array(5000).fill(32);
    late.set(synth(1).subarray(0, 300));
    late[4500] = 0;
    expect(sniff(late).kind).toBe('cwr2');
  });

  it('says unknown for text that is not CWR, empty input and markup', () => {
    expect(sniff(ascii('Name,Title,Share\nA,B,50\n'))).toMatchObject({ kind: 'unknown', reason: 'no-records' });
    expect(sniff(new Uint8Array(0))).toMatchObject({ kind: 'unknown', reason: 'empty' });
    expect(sniff(ascii('  \n\n \t\n'))).toMatchObject({ kind: 'unknown', reason: 'empty' });
    expect(sniff(ascii('<?xml version="1.0"?><cwr/>'))).toMatchObject({ kind: 'unknown', reason: 'markup' });
  });

  it('does not take a word that starts like a record type for a record', () => {
    expect(sniff(ascii('PERSONAL NOTES\nNEW WORK REGISTRATIONS\nHDRS\n')).kind).toBe('unknown');
  });

  it('finds CWR 3.x by the version fields or the file name', () => {
    const v22 = new TextDecoder().decode(synth(1, '2.2'));
    const hdr = v22.split('\r\n')[0]!;
    const cwr3 = [hdr.slice(0, 101) + '3.0' + hdr.slice(104), ...v22.split('\r\n').slice(1)].join('\r\n');
    expect(sniff(ascii(cwr3))).toMatchObject({ kind: 'cwr3', reason: 'cwr3-version', detected: '3.0' });
    expect(() => parse(ascii(cwr3))).toThrow(UnsupportedVersionError);
    expect(sniff(synth(1), { fileName: 'CW250001ABC_000.V30' })).toMatchObject({ kind: 'cwr3', reason: 'cwr3-file-name' });
  });

  it('shows only printable ASCII in firstLine, at most 40 characters', () => {
    const s = sniff(Uint8Array.from([...ascii('x'.repeat(60)), 10]));
    expect(s.firstLine).toBe('x'.repeat(40));
    expect(sniff(Uint8Array.from([0xff, 0xfe, 65, 66])).firstLine).toBe('..AB');
  });

  it('reads at most the head of a large file', () => {
    const big = new Uint8Array(3_000_000).fill(65);
    big.set(synth(1).subarray(0, 400));
    const t = performance.now();
    sniff(big);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('headlines (CR-8)', () => {
  it('is the first sentence, without its full stop', () => {
    expect(headlineOf('SWR is 200 characters; its layout is 280. The characters after 200 are missing.')).toBe('SWR is 200 characters; its layout is 280');
  });

  it('does not stop at a decimal point or an abbreviation', () => {
    expect(headlineOf('Version 2.1 files do not carry this field (e.g. in an ACK). It is new in 2.2.')).toBe('Version 2.1 files do not carry this field (e.g. in an ACK)');
  });

  it('does not end a sentence at a field-name abbreviation followed by a quoted value', () => {
    expect(headlineOf('USA License Ind. "." is not in the Usa License Indicator table. Edit SWR-F-024 ends in (FR).')).toBe('USA License Ind. "." is not in the Usa License Indicator table');
  });

  it('cuts a long first sentence at a clause and adds an ellipsis, within the limit', () => {
    const long = 'PR ownership shares of all writers and publishers total 94.00% (writers 50.00%, publishers 44.00%) and the specification wants each right to total 100%';
    const h = headlineOf(long);
    expect(h.length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(h.endsWith('…')).toBe(true);
    expect(long.startsWith(h.slice(0, -1).trimEnd())).toBe(true);
  });

  it('cuts at a word when there is no clause break, and never splits one', () => {
    const h = headlineOf('Alpha '.repeat(40));
    expect(h.length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(h).toMatch(/Alpha…$/);
  });

  it('leaves a short message whole and survives odd input', () => {
    expect(headlineOf('Short.')).toBe('Short');
    expect(headlineOf('No full stop')).toBe('No full stop');
    expect(headlineOf('')).toBe('');
    expect(headlineOf('x'.repeat(300)).length).toBeLessThanOrEqual(HEADLINE_MAX);
  });

  it('every problem of every built-in rule on the sample has a non-empty headline of at most 80 characters', () => {
    const r = check(parse(fixture(SAMPLE)));
    expect(r.problems.length).toBeGreaterThan(20);
    for (const p of r.problems) {
      expect(p.headline.length).toBeGreaterThan(0);
      expect(p.headline.length).toBeLessThanOrEqual(HEADLINE_MAX);
    }
  });

  it('a rule can give its own headline template, and a report can override it', () => {
    const rule = defineRule({
      id: 'H-1',
      title: 't',
      severity: 'warning',
      scope: 'file',
      versions: ['2.1', '2.2'],
      message: 'The long message with {n} items. And more words after it that nobody reads in a list row.',
      headline: '{n} items found',
      source: { slug: 'a', quote: 'b' },
      run(ctx) {
        ctx.report({ line: -1, params: { n: 3 } });
        ctx.report({ line: -1, params: { n: 4 }, message: 'Other text. Second.' });
        ctx.report({ line: -1, params: { n: 5 }, headline: 'five' });
      },
    });
    const r = check(parse(new Uint8Array(0)), { registry: createRegistry([rule]) });
    expect(r.problems.map(p => p.headline)).toEqual(['3 items found', 'Other text', 'five']);
  });
});

describe('work summary (CR-4)', () => {
  const doc = parse(synth(5, '2.2', true));

  it('gives title, work number, parties in file order and totals per right', () => {
    const all = workSummaries(doc);
    expect(all).toHaveLength(5);
    const w = all[0]!;
    expect(w.recordType).toBe('NWR');
    expect(w.title.length).toBeGreaterThan(0);
    expect(w.workNumber.length).toBeGreaterThan(0);
    expect(w.parties.length).toBeGreaterThanOrEqual(4);
    expect(w.parties.map(p => p.ref)).toEqual([...w.parties.map(p => p.ref)].sort((a, b) => a - b));
    expect(w.parties.some(p => p.kind === 'publisher' && p.controlled)).toBe(true);
    expect(w.parties.some(p => p.kind === 'writer' && !p.controlled)).toBe(true); // OWR
    for (const right of ['pr', 'mr', 'sr'] as const) {
      const t = w.totals[right];
      expect(t.total).toBe((t.writers ?? 0) + (t.publishers ?? 0));
      const byParties = w.parties.reduce((sum, p) => sum + (p.shares[right] ?? 0), 0);
      expect(byParties).toBe(t.total);
      expect(t.balanced).toBe(true);
    }
    expect(w.parties.find(p => p.kind === 'writer')!.firstName).toBeDefined();
    expect(w.parties.find(p => p.kind === 'publisher')!.name.length).toBeGreaterThan(0);
  });

  it('matches the share totals the NWR-T-011 rule works from (PR 50 + 50 = 100)', () => {
    const w = workSummaries(doc)[0]!;
    expect(w.totals.pr.total).toBe(10000);
    expect(formatShare(w.totals.pr.total!)).toBe('100.00%');
    expect(formatShare(5)).toBe('0.05%');
  });

  it('workSummary on one transaction equals the matching entry of workSummaries', () => {
    const txn = doc.file.groups[0]!.transactions[2]!;
    expect(workSummary(doc, txn)).toEqual(workSummaries(doc)[2]);
  });

  it('marks a total as null (not computed) when a share cannot be read, and reports the unbalanced total', () => {
    const text = new TextDecoder().decode(synth(1, '2.2')).split('\r\n');
    const swr = text.findIndex(l => l.startsWith('SWR'));
    // Writer PR ownership share is at spec position 117, five characters (check with fieldInfo).
    const f = fieldInfo('2.2', 'SWR', 'prOwnershipShare')!;
    text[swr] = text[swr]!.slice(0, f.start - 1) + '12X45' + text[swr]!.slice(f.start - 1 + f.size);
    const w = workSummaries(parse(ascii(text.join('\r\n'))))[0]!;
    expect(w.totals.pr.total).toBeNull();
    expect(w.totals.pr.balanced).toBeNull();
    expect(w.totals.mr.total).not.toBeNull();
    expect(w.parties.find(p => p.ref === w.parties.find(x => x.kind === 'writer')!.ref)!.shares.pr).toBeNull();

    text[swr] = text[swr]!.slice(0, f.start - 1) + '00000' + text[swr]!.slice(f.start - 1 + f.size);
    const w2 = workSummaries(parse(ascii(text.join('\r\n'))))[0]!;
    expect(w2.totals.pr.total).toBeLessThan(10000);
    expect(w2.totals.pr.balanced).toBe(false);
  });

  it('gives an empty list for a file with no works', () => {
    expect(workSummaries(parse(ascii('garbage\n')))).toEqual([]);
  });
});

describe('field info and lookup labels (CR-2, CR-3)', () => {
  it('gives the spec name, size, format, requirement and source of a field', () => {
    expect(fieldInfo('2.2', 'SWR', 'prOwnershipShare')).toMatchObject({
      record: 'SWR',
      id: 'prOwnershipShare',
      name: 'PR Ownership Share',
      size: 5,
      format: 'N',
      implied: '999v99',
      slug: 'cisac/cwr-functional-spec-2-2',
    });
    expect(fieldInfo('2.1', 'NWR', 'workTitle')).toMatchObject({ name: 'Work Title', size: 60, req: 'M', start: 20 });
  });

  it('resolves aliases to the shared layout and says undefined for unknown names', () => {
    expect(fieldInfo('2.1', 'REV', 'workTitle')?.record).toBe('NWR');
    expect(fieldInfo('2.1', 'OPU', 'publisherName')?.record).toBe('SPU');
    expect(fieldInfo('2.1', 'NWR', 'nope')).toBeUndefined();
    expect(fieldInfo('2.1', 'ZZZ', 'workTitle')).toBeUndefined();
  });

  it('names the lookup table of a lookup field', () => {
    expect(fieldInfo('2.1', 'ALT', 'titleType')?.lookup).toBe('titleType');
  });

  it('lists every field of a record in spec order, and nothing for an unknown type', () => {
    const list = fieldInfos('2.1', 'NWR');
    expect(list[0]!.id).toBe('recordType');
    expect(list.map(f => f.start)).toEqual([...list.map(f => f.start)].sort((a, b) => a - b));
    expect(fieldInfos('2.1', 'ZZZ')).toEqual([]);
    expect(FIELD_FORMAT_NAMES.N).toBe('numeric');
  });

  it('labels lookup codes', () => {
    expect(lookupLabel('titleType', 'AT')).toBeUndefined(); // this package carries no lookup labels
    expect(lookupLabel('tis', '2136')).toBe('World');
    expect(lookupLabel('tis', '0840')).toBeUndefined(); // the source prints no name
    expect(lookupLabel('titleType', 'ZZ')).toBeUndefined();
    expect(lookupLabel('noSuchTable', 'AT')).toBeUndefined();
    expect(lookupRow('titleType', 'AT')).toMatchObject({ code: 'AT', description: '' });
    expect(lookupLabel('societyCode', '010')).toBe('ASCAP');
    expect(lookupRow('tis', '2136')?.detail).toContain('type GROUP');
  });
});

describe('the rules carry their citation slugs', () => {
  it('every built-in rule has a source slug and an empty quote', () => {
    for (const r of BUILTIN_RULES) expect(r.source.quote).toBe('');
  });
});
