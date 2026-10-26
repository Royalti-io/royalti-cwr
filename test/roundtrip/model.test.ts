import { describe, expect, it } from 'vitest';
import {
  generateCwr,
  generateCwrText,
  getField,
  InputTooLargeError,
  parse,
  recordText,
  serialize,
  specLayouts,
  UnsupportedVersionError,
} from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { ascii, equalBytes, expectSound } from '../helpers';

const text = (s: string): Uint8Array => ascii(s);

describe('encoding and line endings', () => {
  it('keeps each line ending: CRLF, LF, lone CR, none on the last line', () => {
    const doc = parse(text('HDR\r\nGRH\nGRT\rTRL'));
    expect(doc.lines.map(l => l.eol)).toEqual(['\r\n', '\n', '\r', '']);
    expect(doc.lines.map(l => l.text)).toEqual(['HDR', 'GRH', 'GRT', 'TRL']);
  });

  it('a final newline does not create an empty last line', () => {
    expect(parse(text('A\n')).lines.length).toBe(1);
    expect(parse(text('A\n\n')).lines.length).toBe(2);
  });

  it('BOM: kept, not part of the first line, file is UTF-8', () => {
    const bytes = Uint8Array.of(0xef, 0xbb, 0xbf, ...text('HDR\n'));
    const doc = parse(bytes);
    expect(doc.bom).toBe(true);
    expect(doc.encoding).toBe('utf8');
    expect(doc.lines[0]!.text).toBe('HDR');
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
  });

  it('valid UTF-8 high bytes -> utf8; columns count characters', () => {
    const bytes = Uint8Array.of(...text('NWR'), 0xc3, 0xa9, ...text('X\n')); // é
    const doc = parse(bytes);
    expect(doc.encoding).toBe('utf8');
    expect(doc.lines[0]!.text).toBe('NWRéX');
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
  });

  it('invalid UTF-8 -> Latin-1, byte for byte (0x80-0x9F survive)', () => {
    const bytes = Uint8Array.of(...text('NWR'), 0xe9, 0x41, 0x80, 0x9f, ...text('\n'));
    const doc = parse(bytes);
    expect(doc.encoding).toBe('latin1');
    expect(doc.lines[0]!.text.charCodeAt(3)).toBe(0xe9);
    expect(doc.lines[0]!.text.charCodeAt(5)).toBe(0x80);
    expect(doc.lines[0]!.text.charCodeAt(6)).toBe(0x9f);
    expect(equalBytes(serialize(doc), bytes)).toBe(true);
  });

  it('rejects overlong and surrogate UTF-8 as Latin-1', () => {
    expect(parse(Uint8Array.of(0xc0, 0x80, 10)).encoding).toBe('latin1');
    expect(parse(Uint8Array.of(0xed, 0xa0, 0x80, 10)).encoding).toBe('latin1');
  });
});

describe('records are kept and classified, never dropped', () => {
  const sample = generateCwrText({ version: '2.1', works: 1, eol: '\n', finalNewline: false }).split('\n');
  const nwr = sample[2]!;

  it('blank-ish lines stay in lines, not in records', () => {
    const doc = parse(text(`${sample[0]}\n\n   \n\t\n${sample[1]}\n`));
    expect(doc.lines.length).toBe(5);
    expect(doc.records.length).toBe(2);
    expect(Array.from(doc.recordOfLine)).toEqual([0, -1, -1, -1, 1]);
  });

  it('unknown type, short, long and bad-prefix records get a status', () => {
    const doc = parse(text([nwr, 'ALX00000000000000012345', nwr.slice(0, 208), nwr + 'EXTRA', 'NWRxxxxxxxxxxxxxxxxTITLE', '   ' + nwr.slice(3)].join('\n')));
    expect(doc.records.map(r => r.status)).toEqual(['ok', 'unknown-type', 'short', 'long', 'bad-prefix', 'unknown-type']);
    expect(doc.records[2]!.length).toBe(208);
    expect(doc.records[5]!.type).toBe('   ');
  });

  it('GRH 26 and GRT 24 are valid lengths; OPT is unknown in a 2.1 file', () => {
    const doc = parse(generateCwr({ version: '2.1', works: 1 }));
    expect(doc.records.every(r => r.status === 'ok')).toBe(true);
    const opt = parse(text(`${sample[0]}\n${sample[1]}\n${nwr}\nOPT0000000000000002`));
    expect(opt.records[3]!.status).toBe('unknown-type');
    const opt22 = parse(text(`GRH${'NWR'}00001${'02.20'}0000000000\nOPT00000000000000025`));
    expect(opt22.records[1]!.status).not.toBe('unknown-type');
  });

  it('a known type with no layout in the provider is ok, with layout null', () => {
    // The default provider lays out every record type, so a provider that knows PER but has no layout for it
    // stands in for the "valid type, no layout" path.
    const noPerLayout = {
      getLayout: (version: CwrVersion, type: string) => (type === 'PER' ? null : specLayouts.getLayout(version, type)),
      isRecordType: specLayouts.isRecordType,
    };
    const doc = parse(text('PER' + '0000000000000001' + 'X'), { layouts: noPerLayout });
    expect(doc.records[0]!.status).toBe('ok');
    expect(doc.records[0]!.layout).toBeNull();
  });

  it('the default provider lays out every record type, so PER, REC, ORN, ALT and the rest get a real status', () => {
    const doc = parse(text(['PER' + '0000000000000001' + 'X', 'ALT' + '0000000000000002' + 'T'.padEnd(60) + 'AT' + 'EN'].join('\n')));
    expect(doc.records.map(r => [r.layout, r.status])).toEqual([['PER', 'short'], ['ALT', 'ok']]);
  });

  it('exposes spans on demand: short records read as empty, absent fields undefined', () => {
    const doc = parse(text(nwr.slice(0, 40) + '\n' + nwr));
    expect(getField(doc, 0, 'workTitle')).toBe(nwr.slice(19, 40));
    expect(getField(doc, 0, 'iswc')).toBe('');
    expect(getField(doc, 1, 'workTitle')).toBe(nwr.slice(19, 79));
    expect(getField(doc, 1, 'nope')).toBeUndefined();
    expect(recordText(doc, 1)).toBe(nwr);
  });
});

describe('grouping', () => {
  it('detail records before a header, after a GRT, and extra HDR/TRL become orphans', () => {
    const lines = [
      'SPU00000000000000019',
      'HDR',
      'HDR',
      'GRHNWR0000102.10',
      'NWR0000000000000000T',
      'SWR00000000000000019',
      'GRT00001',
      'SWR00000000000000029',
      'TRL',
      'TRL',
    ];
    const doc = parse(text(lines.join('\n')));
    expectSound(doc);
    expect(doc.orphans).toEqual([0, 2, 7, 9]);
    expect(doc.file.hdr).toBe(1);
    expect(doc.file.trl).toBe(8);
    expect(doc.file.groups[0]!.transactions[0]!.records).toEqual([5]);
  });

  it('a GRH with no GRT, then a second GRH, keep their own transactions', () => {
    const doc = parse(text('GRHNWR00001\nNWR1\nSWR1\nGRHREV00002\nREV1\nTRL'));
    expect(doc.file.groups.map(g => [g.type, g.grt, g.transactions.length])).toEqual([['NWR', undefined, 1], ['REV', undefined, 1]]);
    expect(doc.file.trl).toBe(5);
  });

  it('an ACK carries the transaction that follows it', () => {
    const doc = parse(text('GRHACK00001\nACK1\nMSG1\nNWR1\nSWR1\nACK2\nNWR2\nNWR3\nTRL'));
    const g = doc.file.groups[0]!;
    expect(g.transactions.length).toBe(3);
    expect(g.transactions[0]!.records).toEqual([2, 3, 4]);
    expect(g.transactions[0]!.inner!.length).toBe(1);
    expect(g.transactions[0]!.inner![0]!.header).toBe(3);
    expect(g.transactions[0]!.inner![0]!.records).toEqual([4]);
    expect(g.transactions[2]!.header).toBe(7);
  });
});

describe('refusals', () => {
  it('refuses CWR 3.x by GRH, by HDR version field and by file name', () => {
    expect(() => parse(text('HDR\nGRHNWR0000103.00\n'))).toThrow(UnsupportedVersionError);
    expect(() => parse(text('GRHNWR0000103.10'))).toThrow(UnsupportedVersionError);
    expect(() => parse(text('HDR' + ' '.repeat(98) + '3.0'))).toThrow(UnsupportedVersionError);
    expect(() => parse(text('HDR'), { fileName: 'CW260001ABC_000.V30' })).toThrow(UnsupportedVersionError);
    try {
      parse(text('GRHNWR0000103.00'));
    } catch (e) {
      expect((e as UnsupportedVersionError).code).toBe('UNSUPPORTED_VERSION');
      expect((e as UnsupportedVersionError).detected).toBe('03.00');
    }
  });

  it('detects 2.1 and 2.2, and lets the caller force a version', () => {
    expect(parse(generateCwr({ version: '2.2', works: 1 })).version).toMatchObject({ version: '2.2', source: 'grh', grh: '02.20' });
    expect(parse(generateCwr({ version: '2.1', works: 1 })).version).toMatchObject({ version: '2.1', source: 'grh' });
    expect(parse(text('PER')).version).toMatchObject({ version: '2.1', source: 'default' });
    expect(parse(generateCwr({ version: '2.1', works: 1 }), { version: '2.2' }).version.source).toBe('option');
  });

  it('refuses input over the size cap', () => {
    expect(() => parse(new Uint8Array(11), { maxBytes: 10 })).toThrow(InputTooLargeError);
  });
});
