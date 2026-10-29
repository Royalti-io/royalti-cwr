import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDoc, check, checkRows, getField, parse, parseCsv, readTemplateRows, rowsCsv, templateRow } from '../../src/index';
import type { CwrDoc, TemplateRow, TemplateValues } from '../../src/index';
import { HEADER } from './support';

type V = Partial<TemplateValues>;

/** Check digits of an IPI name number, from the algorithm the checker uses: weights 10 down to 2 over nine digits, modulo 101. */
function ipiOf(n: number): string {
  const body = `998${String(n).padStart(6, '0')}`;
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(body[i]) * (10 - i);
  total %= 101;
  if (total !== 0) total = (101 - total) % 100;
  return body + String(total).padStart(2, '0');
}
const IPIS = Array.from({ length: 12 }, (_, i) => ipiOf(i + 1));

const showHundredths = (h: number): string => {
  const whole = Math.floor(h / 100);
  const frac = String(h % 100).padStart(2, '0');
  return `${whole}.${frac}`;
};

// ------------------------------------------------------------------ arbitraries

const WORD_CHARS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
const SPICE = [...',"\'&-.éÜñ'];
const word = fc.tuple(fc.constantFrom(...WORD_CHARS), fc.array(fc.constantFrom(...WORD_CHARS, ...SPICE), { maxLength: 9 })).map(([a, rest]) => a + rest.join(''));
/** Words with single spaces between them: a cell that cleaning does not change. */
const phrase = (maxWords: number) => fc.array(word, { minLength: 1, maxLength: maxWords }).map(w => w.join(' '));

const roll = fc.integer({ min: 0, max: 1_000_000 });

const writerSpec = fc.record({
  name: phrase(3),
  first: fc.option(phrase(2), { nil: '' }),
  role: fc.constantFrom('C', 'A', 'CA', 'C', 'CA'),
  modifier: fc.boolean(),
  controlled: fc.boolean(),
  ipi: fc.option(fc.integer({ min: 0, max: IPIS.length - 1 }), { nil: undefined }),
  linkBy: fc.constantFrom('key', 'ipi'),
  linkMask: fc.integer({ min: 1, max: 7 }),
  territories: fc.constantFrom('', '2136', '0826', '0826;0840', '2136; 0250'),
  society: fc.constantFrom('', '021', '010'),
  collectCut: fc.constantFrom(0, 0, 0, 1, 2),
  r: roll,
});
const publisherSpec = fc.record({
  name: phrase(3),
  controlled: fc.boolean(),
  ipi: fc.integer({ min: 0, max: IPIS.length - 1 }),
  territories: fc.constantFrom('', '2136', '0826;0840', '0250'),
  collectCut: fc.constantFrom(0, 0, 0, 1),
  r: roll,
});
const workSpec = fc.record({
  title: phrase(6),
  iswc: fc.option(fc.integer({ min: 0, max: 999_999_999 }).map(n => `T${String(n).padStart(10, '0')}`), { nil: '' }),
  language: fc.constantFrom('', 'EN', 'fr', 'ES'),
  duration: fc.constantFrom('', '3:25', '0:45', '1:03:25', '12:00'),
  category: fc.constantFrom('', 'POP', 'JAZ', 'UNC', 'pop'),
  writers: fc.array(writerSpec, { minLength: 1, maxLength: 4 }),
  publishers: fc.array(publisherSpec, { minLength: 0, maxLength: 3 }),
  threeWay: fc.boolean(),
  mrWriterPart: fc.integer({ min: 0, max: 10000 }),
  srWriterPart: fc.integer({ min: 0, max: 10000 }),
  prPubPart: fc.integer({ min: 0, max: 5000 }),
  alts: fc.array(fc.record({ title: phrase(4), type: fc.constantFrom('', 'AT', 'TE', 'FT', 'OL'), language: fc.constantFrom('', 'EN', 'FR') }), { maxLength: 3 }),
  performers: fc.array(fc.record({ name: phrase(3), first: fc.option(word, { nil: '' }), ipi: fc.option(fc.integer({ min: 0, max: IPIS.length - 1 }), { nil: undefined }) }), { maxLength: 3 }),
  recordings: fc.array(
    fc.record({
      isrc: fc.tuple(fc.constantFrom('GB', 'US', 'ZZ'), fc.string({ unit: fc.constantFrom(...'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'), minLength: 3, maxLength: 3 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99999 })).map(
        ([c, reg, y, n]) => `${c}${reg}${String(y).padStart(2, '0')}${String(n).padStart(5, '0')}`,
      ),
      title: fc.option(phrase(3), { nil: '' }),
      duration: fc.constantFrom('', '3:25', '4:01'),
      date: fc.constantFrom('', '2026-03-06', '1999-12-31'),
      album: fc.option(phrase(2), { nil: '' }),
      label: fc.option(phrase(2), { nil: '' }),
    }),
    { maxLength: 3 },
  ),
});

/** `total` hundredths split into `n` parts that add up to it, parts may be zero; `positive` makes every part at least 1. */
function split(total: number, n: number, seed: number, positive: boolean, preferThirds: boolean): number[] {
  if (n === 1) return [total];
  if (preferThirds && n === 3 && total === 10000) return [3333, 3333, 3334];
  const floor = positive ? 1 : 0;
  let left = total - floor * n;
  const parts = new Array<number>(n).fill(floor);
  let s = seed + 1;
  for (let i = 0; i < n - 1; i++) {
    s = (s * 48271) % 2147483647;
    const take = s % (left + 1);
    parts[i]! += take;
    left -= take;
  }
  parts[n - 1]! += left;
  return parts;
}

/** Rows for a work, built so that the sheet is good: shares add up, every controlled writer is linked, the publisher rules hold. */
type WorkSpec = typeof workSpec extends fc.Arbitrary<infer T> ? T : never;

function rowsForWork(spec: WorkSpec, index: number): V[] {
  const number = `P${String(index + 1).padStart(4, '0')}`;
  const out: V[] = [];
  out.push({ rowType: 'WORK', workNumber: number, title: spec.title, iswc: spec.iswc, language: spec.language, duration: spec.duration, category: spec.category });

  const pubs = spec.publishers;
  const writers = spec.writers.map((w, i) => ({ ...w, role: i === 0 ? (w.modifier ? 'C' : w.role) : w.modifier && i === 1 ? 'AR' : w.role }));
  const hasModifier = writers.some(w => w.role === 'AR');
  const np = pubs.length;
  const nw = writers.length;

  // Performing right: the publishers hold at most half; with no publisher the writers hold all of it.
  const pubPr = np === 0 ? 0 : Math.max(np, Math.min(5000, spec.prPubPart));
  const writerPr = 10000 - pubPr;
  const pubPrParts = np === 0 ? [] : split(pubPr, np, spec.prPubPart, true, false);
  const writerPrParts = split(writerPr, nw, spec.writers[0]!.r, hasModifier, spec.threeWay);
  // Mechanical and synchronization: the publishers hold what the writers do not, and each controlled or not publisher holds something.
  const rightParts = (writerPart: number, seed: number): { w: number[]; p: number[] } => {
    if (np === 0) return { w: split(10000, nw, seed, false, spec.threeWay), p: [] };
    const pubTotal = Math.max(np, Math.min(10000 - 0, 10000 - writerPart));
    return { w: split(10000 - pubTotal, nw, seed, false, false), p: split(pubTotal, np, seed + 7, true, spec.threeWay) };
  };
  const mr = rightParts(spec.mrWriterPart, spec.writers[0]!.r + 1);
  const sr = rightParts(spec.srWriterPart, spec.writers[0]!.r + 2);

  const keys = pubs.map((_, i) => `K${i + 1}`);
  const usedIpis = new Set<number>();
  const pick = (want: number | undefined): string => {
    if (want === undefined) return '';
    let n = want;
    while (usedIpis.has(n)) n = (n + 1) % IPIS.length;
    usedIpis.add(n);
    return IPIS[n]!;
  };
  const controlledPubs = pubs.map((p, i) => ({ p, i })).filter(x => x.p.controlled);
  const pubIpi: string[] = pubs.map(p => pick(p.ipi));

  pubs.forEach((p, i) => {
    out.push({
      rowType: 'PUBLISHER',
      workNumber: number,
      partyKey: keys[i]!,
      controlled: p.controlled ? 'Y' : 'N',
      role: i % 2 === 0 ? 'E' : '',
      name: p.name,
      ipi: pubIpi[i]!,
      prOwned: showHundredths(pubPrParts[i]!),
      mrOwned: showHundredths(mr.p[i]!),
      srOwned: showHundredths(sr.p[i]!),
      // A publisher's performing share to collect must equal what it owns; the other two may be less.
      ...(p.controlled && p.collectCut === 1 ? { mrCollected: showHundredths(Math.floor(mr.p[i]! / 2)) } : {}),
      ...(p.controlled ? { territories: p.territories } : {}),
    });
  });
  writers.forEach((w, i) => {
    const links = controlledPubs.filter((_, k) => (w.linkMask >> k) & 1);
    const chosen = links.length > 0 ? links : controlledPubs.slice(0, 1);
    out.push({
      rowType: 'WRITER',
      workNumber: number,
      controlled: w.controlled ? 'Y' : 'N',
      role: w.role,
      name: w.name,
      firstName: w.first,
      ipi: pick(w.ipi),
      prSociety: w.society,
      prOwned: showHundredths(writerPrParts[i]!),
      mrOwned: showHundredths(mr.w[i]!),
      srOwned: showHundredths(sr.w[i]!),
      ...(w.controlled && w.collectCut > 0 ? { mrCollected: showHundredths(Math.floor(mr.w[i]! / (w.collectCut + 1))) } : {}),
      ...(w.controlled ? { territories: w.territories } : {}),
      ...(w.controlled && chosen.length > 0 ? { publisher: chosen.map(c => (w.linkBy === 'key' ? keys[c.i]! : pubIpi[c.i]!)).join('; ') } : {}),
    });
  });
  for (const a of spec.alts) {
    const language = a.type === 'OL' ? 'EN' : a.language;
    out.push({ rowType: 'ALT TITLE', workNumber: number, title: a.title, titleType: a.type, language });
  }
  for (const p of spec.performers) out.push({ rowType: 'PERFORMER', workNumber: number, name: p.name, firstName: p.first, ipi: p.ipi === undefined ? '' : IPIS[p.ipi]! });
  for (const r of spec.recordings) {
    out.push({ rowType: 'RECORDING', workNumber: number, title: r.title, isrc: r.isrc, duration: r.duration, releaseDate: r.date, album: r.album, label: r.label });
  }
  return out;
}

const sheetOf = (maxWorks: number) =>
  fc.array(workSpec, { minLength: 1, maxLength: maxWorks }).map(specs => {
    const all: V[] = specs.flatMap((s, i) => rowsForWork(s, i));
    return all.map((v, i) => templateRow(v, i + 2));
  });

const sheet = sheetOf(25);
const smallSheet = sheetOf(3);

// ------------------------------------------------------------------ reading a built file back

const f = (doc: CwrDoc, ref: number, id: string): string => (getField(doc, ref, id) ?? '').trim();

interface Back {
  number: string;
  title: string;
  writers: string[];
  publishers: string[];
  alts: string[];
  performers: string[];
  isrcs: string[];
  pwr: number;
  territories: string[];
}

function readBack(doc: CwrDoc): Back[] {
  return doc.file.groups[0]!.transactions.map(t => {
    const of = (type: string): number[] => t.records.filter(r => doc.records[r]!.type === type);
    return {
      number: f(doc, t.header, 'submitterWorkNumber'),
      title: f(doc, t.header, 'workTitle'),
      writers: [...of('SWR'), ...of('OWR')].map(r => [f(doc, r, 'writerLastName'), f(doc, r, 'writerFirstName'), f(doc, r, 'writerIpiNameNumber'), f(doc, r, 'prOwnershipShare'), f(doc, r, 'mrOwnershipShare'), f(doc, r, 'srOwnershipShare')].join('|')),
      publishers: [...of('SPU'), ...of('OPU')].map(r => [f(doc, r, 'publisherName'), f(doc, r, 'publisherIpiNameNumber'), f(doc, r, 'prOwnershipShare'), f(doc, r, 'mrOwnershipShare'), f(doc, r, 'srOwnershipShare')].join('|')),
      alts: of('ALT').map(r => f(doc, r, 'alternateTitle')),
      performers: of('PER').map(r => `${f(doc, r, 'performingArtistLastName')}|${f(doc, r, 'performingArtistFirstName')}`),
      isrcs: of('REC').map(r => f(doc, r, 'isrc')),
      pwr: of('PWR').length,
      territories: [...of('SPT'), ...of('SWT')].map(r => f(doc, r, 'tisNumericCode')),
    };
  });
}

const share = (v: string): string => String(Math.round(Number(v) * 100)).padStart(5, '0');

/** What the rows say, in the shape `readBack` gives, for the fields that must come through unchanged. */
function expectedFrom(rows: readonly TemplateRow[]): Back[] {
  const works: Array<{ w: TemplateRow; rest: TemplateRow[] }> = [];
  for (const r of rows) {
    if (r.rowType === 'WORK') works.push({ w: r, rest: [] });
    else works[works.length - 1]!.rest.push(r);
  }
  const pad = (v: string): string => v.toUpperCase();
  return works.map(({ w, rest }) => {
    const wr = (type: string, controlled?: boolean): TemplateRow[] => rest.filter(r => r.rowType === type && (controlled === undefined || (r.controlled === 'Y') === controlled));
    const writers = [...wr('WRITER', true), ...wr('WRITER', false)];
    const pubs = [...wr('PUBLISHER', true), ...wr('PUBLISHER', false)];
    const links = wr('WRITER', true).reduce((n, r) => n + r.publisher.split(';').filter(t => t.trim() !== '').length, 0);
    return {
      number: pad(w.workNumber),
      title: pad(w.title),
      writers: writers.map(r => [pad(r.name), pad(r.firstName), r.ipi, share(r.prOwned), share(r.mrOwned), share(r.srOwned)].join('|')),
      publishers: pubs.map(r => [pad(r.name), r.ipi, share(r.prOwned), share(r.mrOwned), share(r.srOwned)].join('|')),
      alts: wr('ALT TITLE').map(r => pad(r.title)),
      performers: wr('PERFORMER').map(r => `${pad(r.name)}|${pad(r.firstName)}`),
      isrcs: wr('RECORDING').map(r => r.isrc),
      pwr: links,
      territories: [],
    };
  });
}

describe('property: good rows build a file the checker finds no errors in', () => {
  it('holds for 1 to 25 works with 1 to 4 writers, 0 to 3 publishers, splits, territories, alternative titles, performers and recordings', () => {
    fc.assert(
      fc.property(sheet, rows => {
        const problems = checkRows(rows);
        expect(problems.filter(p => p.severity === 'error')).toEqual([]);

        const { doc, text } = buildDoc(rows, { ...HEADER, characterSet: 'UTF-8' });
        const result = check(doc);
        const errors = result.problems.filter(p => p.severity === 'error').map(p => `${p.ruleId} line ${p.line + 1}: ${p.message}`);
        expect(errors).toEqual([]);

        // The text is the file, and it parses to the same document.
        expect(doc.lines.every(l => l.eol === '\r\n')).toBe(true);
        const again = parse(doc.bytes, { version: '2.2' });
        expect(again.records.length).toBe(doc.records.length);
        expect(text.split('\r\n').length - 1).toBe(doc.records.length);

        // Works and people come back as they went in (upper-cased, cut to width).
        const back = readBack(doc);
        const want = expectedFrom(rows);
        expect(back.length).toBe(want.length);
        back.forEach((b, i) => {
          const e = want[i]!;
          expect({ ...b, territories: [] }).toEqual({
            ...e,
            title: e.title.slice(0, 60),
            writers: e.writers.map(x => x.split('|').map((p, k) => (k === 0 ? p.slice(0, 45) : k === 1 ? p.slice(0, 30) : p)).join('|')),
            publishers: e.publishers.map(x => x.split('|').map((p, k) => (k === 0 ? p.slice(0, 45) : p)).join('|')),
            alts: e.alts.map(x => x.slice(0, 60)),
            performers: e.performers.map(x => x.split('|').map((p, k) => (k === 0 ? p.slice(0, 45) : p.slice(0, 30))).join('|')),
          });
        });
      }),
      { numRuns: 100 },
    );
  }, 120_000);

  it('holds when the sheet goes through CSV and back', () => {
    fc.assert(
      fc.property(sheet, rows => {
        const read = readTemplateRows(parseCsv(rowsCsv(rows)));
        expect(read.problems).toEqual([]);
        expect(read.rows).toEqual(rows);
        const direct = buildDoc(rows, { ...HEADER, characterSet: 'UTF-8' }).text;
        expect(buildDoc(read.rows, { ...HEADER, characterSet: 'UTF-8' }).text).toBe(direct);
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});

// ------------------------------------------------------------------ the checks and the checker agree

const MUTABLE_COLUMNS = [
  'title', 'language', 'duration', 'category', 'partyKey', 'controlled', 'role', 'name', 'ipi', 'prSociety', 'prOwned', 'mrOwned', 'srOwned', 'prCollected',
  'mrCollected', 'srCollected', 'territories', 'publisher', 'titleType', 'isrc', 'releaseDate', 'workNumber',
] as const;
const NEW_VALUES = ['', '0', '10', '25', '33.33', '50', '66.67', '49.94', '49.93', '50.06', '0.06', '99.94', '99.93', '100', '100.06', 'Y', 'N', 'C', 'A', 'AR', 'TR', 'E', 'AM', 'K1', 'K2', 'K9', '2136', '0826', '2100', '99900000158', 'x', 'POP', 'SER', 'OL', 'EN', 'T0000000001', ';', ',', ' , ', ';;', 'K1;', '9999'];

const mutation = fc.record({
  kind: fc.constantFrom('set', 'set', 'set', 'set', 'drop', 'copy'),
  at: fc.nat(500),
  column: fc.constantFrom(...MUTABLE_COLUMNS),
  value: fc.constantFrom(...NEW_VALUES),
});

describe('property: rows the checks accept build a file the checker finds no errors in', () => {
  it('holds for good rows with one to three cells changed, a row dropped or a row copied', () => {
    let accepted = 0;
    let refused = 0;
    fc.assert(
      fc.property(smallSheet, fc.array(mutation, { minLength: 1, maxLength: 3 }), (good, mutations) => {
        let rows: TemplateRow[] = good.map(r => ({ ...r }));
        for (const m of mutations) {
          if (rows.length === 0) break;
          const i = m.at % rows.length;
          if (m.kind === 'drop') rows = rows.filter((_, k) => k !== i);
          else if (m.kind === 'copy') rows = [...rows.slice(0, i + 1), { ...rows[i]! }, ...rows.slice(i + 1)];
          else rows[i] = { ...rows[i]!, [m.column]: m.value };
        }
        rows = rows.map((r, k) => ({ ...r, rowNumber: k + 2 }));
        const errors = checkRows(rows).filter(p => p.severity === 'error');
        const header = { ...HEADER, characterSet: 'UTF-8' };
        if (errors.length > 0) {
          refused++;
          expect(() => buildDoc(rows, header)).toThrow();
          return;
        }
        accepted++;
        const { doc } = buildDoc(rows, header);
        const found = check(doc).problems.filter(p => p.severity === 'error').map(p => `${p.ruleId} line ${p.line + 1}: ${p.message}`);
        expect(found).toEqual([]);
      }),
      { numRuns: Number(process.env.CWR_MIRROR_RUNS ?? 600) },
    );
    // The test would mean little if nearly everything were refused, or nothing.
    expect(accepted).toBeGreaterThan(50);
    expect(refused).toBeGreaterThan(50);
  }, 120_000);
});
