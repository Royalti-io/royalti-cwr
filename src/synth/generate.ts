import type { CwrVersion } from '../model/types';

/**
 * Synthetic CWR generator. Everything it writes is invented: a FIXED list of fictional surnames,
 * generic first names, made-up publisher names and IPI name numbers built on the 999000xxx range with
 * valid check digits. No real name, IPI or title from any customer file is, or may be, used here.
 *
 * The files are well-formed by construction (field widths, prefixes, counts, share arithmetic), so a
 * checker should report no errors on them. Deterministic: the same options give the same bytes.
 */

export interface SynthOptions {
  version: CwrVersion;
  works: number;
  /** Add a non-controlled publisher chain (OPU) and a non-controlled writer (OWR) to every work. */
  otherParties?: boolean;
  /** Default `\r\n`, as the spec says. */
  eol?: '\n' | '\r\n';
  /** Default true. */
  finalNewline?: boolean;
  /** Varies durations and name rotation. Default 1. */
  seed?: number;
}

const SURNAMES = [
  'QUILLFEATHER',
  'MARBLEHAVEN',
  'NIGHTORCHARD',
  'TINDERWICK',
  'FERNBRIDGE',
  'COPPERLARK',
  'WILLOWMERE',
  'ASHVENTRY',
  'BRAMBLEFORD',
  'CINDERPOOL',
  'DUSKHOLLOW',
  'EMBERLEIGH',
];
const FIRST_NAMES = ['ANA', 'BEN', 'CARA', 'DEV', 'ELI', 'FAY', 'GUS', 'HANA', 'IVO', 'JUNE', 'KAI', 'LEO'];
const PUBLISHERS = [
  'SYNTHETIC SONGS ONE',
  'FIXTURE MUSIC PUBLISHING',
  'TESTBED TUNES',
  'PLACEHOLDER PRESS',
  'DUMMY DITTIES LTD',
  'SAMPLE SCORES CO',
  'MOCKINGBIRD MUSIC TEST',
  'NOT A REAL PUBLISHER',
];
const ADJECTIVES = ['AMBER', 'BRISK', 'CALM', 'DUSTY', 'EVEN', 'FAINT', 'GLASS', 'HOLLOW', 'IDLE', 'JADE'];
const NOUNS = ['HARBOUR', 'LANTERN', 'MEADOW', 'ORCHARD', 'RIVER', 'SIGNAL', 'TIMBER', 'VALLEY', 'WINDOW'];
const SOCIETIES = ['021', '022', '052'];

/** IPI name number: nine digits plus two check digits (weights 10..2, mod 101), as in the server's validator. */
function ipiCheck(base: string): string {
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(base[i]) * (10 - i);
  total %= 101;
  if (total !== 0) total = (101 - total) % 100;
  return String(total).padStart(2, '0');
}

/** Twenty fictional IPI name numbers, base 9990000nn, with valid check digits. */
export const SYNTH_IPIS: readonly string[] = Array.from({ length: 20 }, (_, i) => {
  const base = `9990000${String(i + 1).padStart(2, '0')}`;
  return base + ipiCheck(base);
});

const a = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const n = (v: number, width: number): string => String(v).padStart(width, '0');

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCwrText(options: SynthOptions): string {
  const { version, works } = options;
  const other = options.otherParties === true;
  const eol = options.eol ?? '\r\n';
  const rand = mulberry32(options.seed ?? 1);
  const v22 = version === '2.2';

  const lines: string[] = [];
  lines.push(
    'HDR' +
      'PB' +
      a('000099901', 9) +
      a('SYNTHETIC FIXTURE PUBLISHER', 45) +
      '01.10' +
      '20260101' +
      '120000' +
      '20260101' +
      a('', 15) +
      (v22 ? '2.2' + '001' + a('ROYALTI CWR SYNTH', 30) + a('0.0.0', 30) : ''),
  );
  lines.push('GRH' + 'NWR' + '00001' + (v22 ? '02.20' : '02.10') + '0000000000');

  const society = (i: number): string => SOCIETIES[i % SOCIETIES.length]!;

  const publisher = (
    tseq: number,
    rseq: number,
    type: 'SPU' | 'OPU',
    seq: number,
    idx: number,
    pr: number,
    mr: number,
    sr: number,
  ): string =>
    type +
    n(tseq, 8) +
    n(rseq, 8) +
    n(seq, 2) +
    a(`P${n(idx + 1, 8)}`, 9) +
    a(PUBLISHERS[idx % PUBLISHERS.length]!, 45) +
    ' ' +
    a('E', 2) +
    a('', 9) +
    SYNTH_IPIS[12 + (idx % 8)]! +
    a('', 14) +
    (pr > 0 ? society(idx) : '   ') +
    n(pr, 5) +
    (mr > 0 ? society(idx + 1) : '   ') +
    n(mr, 5) +
    (sr > 0 ? society(idx + 2) : '   ') +
    n(sr, 5) +
    '   ' +
    a('', 13) +
    a('', 14) +
    a('', 14) +
    a('', 2) +
    ' ';

  const territory = (
    type: 'SPT' | 'SWT',
    tseq: number,
    rseq: number,
    ip: string,
    pr: number,
    mr: number,
    sr: number,
  ): string =>
    type +
    n(tseq, 8) +
    n(rseq, 8) +
    a(ip, 9) +
    (type === 'SPT' ? a('', 6) : '') +
    n(pr, 5) +
    n(mr, 5) +
    n(sr, 5) +
    'I' +
    '2136' +
    ' ' +
    '001';

  const writer = (
    type: 'SWR' | 'OWR',
    tseq: number,
    rseq: number,
    idx: number,
    ipNumber: string,
    ipi: string,
    pr: number,
  ): string =>
    type +
    n(tseq, 8) +
    n(rseq, 8) +
    a(ipNumber, 9) +
    a(SURNAMES[idx % SURNAMES.length]!, 45) +
    a(FIRST_NAMES[idx % FIRST_NAMES.length]!, 30) +
    ' ' +
    'CA' +
    a('', 9) +
    ipi +
    society(idx) +
    n(pr, 5) +
    '   ' +
    n(0, 5) +
    '   ' +
    n(0, 5) +
    '    ' +
    a('', 13) +
    n(0, 12) + // Personal Number: no data in a numeric field is zeroes, not spaces
    ' ';

  for (let i = 0; i < works; i++) {
    const tseq = i;
    let rseq = 0;
    const next = (): number => ++rseq;

    const title = `${ADJECTIVES[i % ADJECTIVES.length]!} ${NOUNS[(i * 7) % NOUNS.length]!} ${n(i + 1, 5)}`;
    const minutes = 2 + Math.floor(rand() * 6);
    const seconds = Math.floor(rand() * 60);
    lines.push(
      'NWR' +
        n(tseq, 8) +
        n(0, 8) +
        a(title, 60) +
        'EN' +
        a(`SYN${n(i + 1, 6)}`, 14) +
        a('', 11) +
        '00000000' +
        a('', 12) +
        'POP' +
        `00${n(minutes, 2)}${n(seconds, 2)}` +
        'Y' +
        'MTX' +
        a('', 3) +
        'ORI' +
        a('', 3) +
        a('', 3) +
        a('', 3) +
        a('', 30) +
        a('', 10) +
        a('', 2) +
        ' ' +
        '000' +
        '00000000' +
        ' ' +
        a('', 25) +
        a('', 25) +
        ' ',
    );

    const w = i % 8;
    const p = i % 4;
    const shareHalf = other ? 2500 : 5000;
    const pubMr = other ? 5000 : 10000;
    const ctrlPubIp = `P${n(p + 1, 8)}`;

    lines.push(publisher(tseq, next(), 'SPU', 1, p, shareHalf, pubMr, pubMr));
    lines.push(territory('SPT', tseq, next(), ctrlPubIp, shareHalf, pubMr, pubMr));
    if (other) lines.push(publisher(tseq, next(), 'OPU', 2, 4 + (i % 4), shareHalf, pubMr, pubMr));
    const wIp = `W${n(w + 1, 8)}`;
    lines.push(writer('SWR', tseq, next(), w, wIp, SYNTH_IPIS[w]!, shareHalf));
    lines.push(territory('SWT', tseq, next(), wIp, shareHalf, 0, 0));
    lines.push(
      'PWR' +
        n(tseq, 8) +
        n(next(), 8) +
        a(ctrlPubIp, 9) +
        a(PUBLISHERS[p % PUBLISHERS.length]!, 45) +
        a('', 14) +
        a('', 14) +
        a(wIp, 9) +
        (v22 ? '01' : ''),
    );
    if (other) {
      const o = 8 + (i % 4);
      lines.push(writer('OWR', tseq, next(), o, `W${n(o + 1, 8)}`, SYNTH_IPIS[8 + (i % 4)]!, shareHalf));
    }
  }

  const groupRecords = lines.length - 1 + 1; // everything after HDR, plus the GRT about to be added
  lines.push('GRT' + '00001' + n(works, 8) + n(groupRecords, 8));
  lines.push('TRL' + '00001' + n(works, 8) + n(lines.length + 1, 8));

  const finalNewline = options.finalNewline ?? true;
  return lines.join(eol) + (finalNewline ? eol : '');
}

/** ASCII bytes of `generateCwrText`. */
export function generateCwr(options: SynthOptions): Uint8Array {
  const text = generateCwrText(options);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}
