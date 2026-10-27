import { describe, expect, it } from 'vitest';
import { formatShare, guardCsvCell, parse, serialize, worksCsv, WORKS_CSV_HEADERS, workSummaries } from '../../src/index';
import type { CwrDoc } from '../../src/index';
import { fixture, SAMPLE } from '../helpers';
import { allOf, assemble, dec, enc, lineText, parseCsv, record, synth, withFields, withRawText } from './support';

const csvText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes.subarray(3));
const rows = (doc: CwrDoc): string[][] => parseCsv(csvText(worksCsv(doc)));
const col = (name: string): number => WORKS_CSV_HEADERS.indexOf(name);

describe('worksCsv: the file', () => {
  const doc = synth('2.2', 5, true);
  const bytes = worksCsv(doc);

  it('is UTF-8 with a byte order mark, CR LF between rows, and a header row', () => {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = csvText(bytes);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false);
    const all = parseCsv(text);
    expect(all[0]).toEqual([...WORKS_CSV_HEADERS]);
    expect(all).toHaveLength(6);
    for (const r of all) expect(r).toHaveLength(WORKS_CSV_HEADERS.length);
  });

  it('has one row per work with its title, numbers, writers, publishers and totals', () => {
    const r = rows(doc)[1]!;
    expect(r[col('Line')]).toBe('3');
    expect(r[col('Record type')]).toBe('NWR');
    expect(r[col('Title')]).toBe('AMBER HARBOUR 00001');
    expect(r[col('Submitter work #')]).toBe('SYN000001');
    expect(r[col('ISWC')]).toBe('');
    expect(r[col('Writers')]).toBe('QUILLFEATHER, ANA; BRAMBLEFORD, IVO');
    expect(r[col('Publishers')]).toBe('SYNTHETIC SONGS ONE; DUMMY DITTIES LTD');
    expect([col('PR total %'), col('MR total %'), col('SR total %')].map(i => r[i])).toEqual(['100.00', '100.00', '100.00']);
    expect([col('ACK status'), col('Messages'), col('Society work #s'), col('Recipient work #'), col('Cross-references')].map(i => r[i])).toEqual(['', '', '', '', '']);
  });

  it('has totals that match workSummaries on the public sample, and an empty cell where a share cannot be read', () => {
    const sample = withRawText(parse(fixture(SAMPLE)), allOf(parse(fixture(SAMPLE)), 'SWR')[0]!, 129, 'ABCDE');
    const out = rows(sample).slice(1);
    const sums = workSummaries(sample);
    expect(out).toHaveLength(sums.length);
    out.forEach((r, i) => {
      for (const [name, right] of [['PR total %', 'pr'], ['MR total %', 'mr'], ['SR total %', 'sr']] as const) {
        const t = sums[i]!.totals[right].total;
        expect(r[col(name)]).toBe(t === null ? '' : formatShare(t).replace('%', ''));
      }
      expect(r[col('Title')]).toBe(sums[i]!.title);
    });
    expect(out.some(r => r[col('PR total %')] === '')).toBe(true);
  });

  it('is deterministic and read-only', () => {
    expect(Buffer.from(worksCsv(doc)).equals(Buffer.from(bytes))).toBe(true);
    expect(doc.edits.size).toBe(0);
    expect(Buffer.from(serialize(doc)).equals(Buffer.from(doc.bytes))).toBe(true);
  });

  it('has only the header when the file has no work', () => {
    const empty = parse(enc('HDRPB000000199SYNTH\r\nGRHNWR0000102.10\r\nGRT000010000000000000002\r\nTRL000010000000000000004\r\n'));
    expect(parseCsv(csvText(worksCsv(empty)))).toEqual([[...WORKS_CSV_HEADERS]]);
    expect(parseCsv(csvText(worksCsv(parse(new Uint8Array(0)))))).toEqual([[...WORKS_CSV_HEADERS]]);
  });
});

describe('worksCsv: a cell that starts a formula is made text', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tTAB', "'\tTAB"],
    ['\rCR', "'\rCR"],
    ['plain', 'plain'],
    ['', ''],
    ['A=B', 'A=B'],
    ["'=1", "'=1"],
    [' =1', ' =1'],
  ])('guardCsvCell(%j) is %j', (input, expected) => {
    expect(guardCsvCell(input)).toBe(expected);
  });

  const base = synth('2.1', 6, true);
  const nwr = allOf(base, 'NWR');
  const hostile = withFields(base, [
    [nwr[0]!, 'workTitle', '=HYPERLINK("http://example.com","x")'],
    [nwr[1]!, 'workTitle', '+1+1'],
    [nwr[2]!, 'workTitle', '-2+3'],
    [nwr[3]!, 'workTitle', '@SUM(A1:A9)'],
    [nwr[4]!, 'workTitle', 'SAY "HI", THEN GO'],
    [allOf(base, 'SPU')[5]!, 'publisherName', '=CMD'],
    [allOf(base, 'SWR')[5]!, 'writerLastName', '-WRITER'],
  ]);

  it('prefixes a single quote to every dangerous cell, whichever column it is in', () => {
    const out = rows(hostile);
    expect(out[1]![col('Title')]).toBe(`'=HYPERLINK("http://example.com","x")`);
    expect(out[2]![col('Title')]).toBe("'+1+1");
    expect(out[3]![col('Title')]).toBe("'-2+3");
    expect(out[4]![col('Title')]).toBe("'@SUM(A1:A9)");
    expect(out[6]![col('Publishers')]!.startsWith("'=CMD; ")).toBe(true);
    expect(out[6]![col('Writers')]!.startsWith("'-WRITER, ")).toBe(true);
    // Not a single cell of the file starts with a formula character.
    for (const r of out.slice(1)) for (const cell of r) expect(/^[=+\-@\t\r]/.test(cell)).toBe(false);
  });

  it('quotes cells that hold commas or quotes, and parses back to the exact text', () => {
    const out = rows(hostile);
    expect(out[5]![col('Title')]).toBe('SAY "HI", THEN GO');
    expect(csvText(worksCsv(hostile))).toContain('"SAY ""HI"", THEN GO"');
  });

  it('guards a cell that is in the file as a quoted cell too', () => {
    expect(csvText(worksCsv(hostile))).toContain(`"'=HYPERLINK(""http://example.com"",""x"")"`);
  });
});

describe('worksCsv: text and encodings', () => {
  it('writes accented text from a UTF-8 file as UTF-8', () => {
    const doc0 = synth('2.1', 2);
    const text = dec(doc0.bytes).replace('AMBER HARBOUR 00001', 'CAFÉ HARBOUR 00001'.padEnd(19, ' '));
    const doc = parse(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]));
    const bytes = worksCsv(doc);
    expect(parseCsv(csvText(bytes))[1]![col('Title')]).toBe('CAFÉ HARBOUR 00001');
    expect(Buffer.from(bytes).includes(Buffer.from([0xc3, 0x89]))).toBe(true);
  });

  it('writes a Latin-1 file as UTF-8 too', () => {
    const bytes0 = synth('2.1', 2).bytes.slice();
    bytes0[dec(bytes0).indexOf('AMBER') + 1] = 0xc9;
    const doc = parse(bytes0);
    expect(doc.encoding).toBe('latin1');
    expect(parseCsv(csvText(worksCsv(doc)))[1]![col('Title')]).toBe('AÉBER HARBOUR 00001');
  });

  it('shows pending edits', () => {
    const doc = withFields(synth('2.1', 2), []);
    const edited = parse(doc.bytes);
    edited.edits.set(doc.records[allOf(doc, 'NWR')[0]!]!.line, lineText(doc, 2).replace('AMBER', 'EMBER'));
    expect(rows(edited)[1]![col('Title')]).toBe('EMBER HARBOUR 00001');
  });
});

describe('worksCsv: acknowledgements', () => {
  const pool = synth('2.2', 3);
  const text = (ref: number): string => lineText(pool, pool.records[ref]!.line);
  const t0 = pool.file.groups[0]!.transactions[0]!;
  const ack = record('ACK', 0, 0, 159, [19, '20260101'], [27, '120000'], [33, '00001'], [38, '00000000'], [46, 'NWR'], [49, 'FIRST TITLE'], [109, 'N1'], [129, 'SOC-77'], [149, '20260102'], [157, 'AS']);
  const msg = record('MSG', 0, 1, 185, [19, 'E'], [20, '00000002'], [28, 'NWR'], [31, 'T'], [32, '001'], [35, '=SHARES DO NOT ADD UP']);
  const msg2 = record('MSG', 0, 2, 185, [19, 'W'], [35, 'SECOND, MESSAGE']);
  const ari = record('ARI', 0, 3, 201, [19, '021'], [22, 'ABC-1234'], [36, 'ALL'], [39, 'WD']);
  const xrf = record('XRF', 0, 4, 38, [19, 'ASC'], [22, 'X-9'], [36, 'W'], [37, 'Y']);
  const bareAck = record('ACK', 0, 0, 159, [19, '20260101'], [46, 'HDR'], [157, 'RJ']);
  const src = parse(
    assemble(pool, [{ type: 'ACK', version: '02.20', txns: [[ack, msg, msg2, ari, xrf, text(t0.header), ...t0.records.map(text), record('EXC', 0, 0, 260, [19, 'OTHER TITLE'])], [bareAck]] }]),
  );
  const out = rows(src);

  it('makes a row for an ACK that carries a work, with its status, messages and society numbers', () => {
    expect(out).toHaveLength(4);
    const r = out[1]!;
    expect(r[col('Record type')]).toBe('ACK');
    expect(r[col('Title')]).toBe('FIRST TITLE');
    expect(r[col('Submitter work #')]).toBe('N1');
    expect(r[col('ACK status')]).toBe('AS');
    expect(r[col('Recipient work #')]).toBe('SOC-77');
    // The first message starts with an equals sign, so the whole cell is made text.
    expect(r[col('Messages')]).toBe("'=SHARES DO NOT ADD UP; SECOND, MESSAGE");
    expect(r[col('Society work #s')]).toBe('021:ABC-1234');
    expect(r[col('Cross-references')]).toBe('ASC:X-9');
    // The work inside the ACK supplies the writers, publishers and shares.
    expect(r[col('Writers')]).toContain('QUILLFEATHER');
    expect([col('PR total %'), col('MR total %'), col('SR total %')].map(i => r[i])).toEqual(['100.00', '100.00', '100.00']);
  });

  it('makes a row for the EXC that continues it, and one for an ACK with no work behind it', () => {
    expect(out[2]![col('Record type')]).toBe('EXC');
    expect(out[2]![col('Title')]).toBe('OTHER TITLE');
    expect(out[3]![col('Record type')]).toBe('ACK');
    expect(out[3]![col('ACK status')]).toBe('RJ');
    expect([col('Writers'), col('Publishers'), col('PR total %')].map(i => out[3]![i])).toEqual(['', '', '']);
  });
});

describe('worksCsv: a large file', () => {
  it('writes a row per work', () => {
    const doc = synth('2.1', 2000, true);
    const all = rows(doc);
    expect(all).toHaveLength(2001);
    expect(all[2000]![col('Title')]).toBe(workSummaries(doc)[1999]!.title);
  });
});
