import { describe, expect, it } from 'vitest';
import { BuildError, buildDoc, check, checkHeader, checkRows, EXAMPLE_ROWS, getField, parse, renumber, serialize, identifierCheck } from '../../src/index';
import type { BuildHeader, CwrDoc, HeaderProblem, TemplateRow, TemplateValues } from '../../src/index';
import { HEADER, checkerErrors, rows, withRows } from './support';

type V = Partial<TemplateValues>;

const refsOf = (doc: CwrDoc, type: string): number[] => doc.records.map((r, i) => (r.type === type ? i : -1)).filter(i => i >= 0);
const field = (doc: CwrDoc, ref: number, id: string): string => getField(doc, ref, id) ?? '';
const linesOf = (text: string): string[] => text.split('\r\n').slice(0, -1);

const PUB1: V = { rowType: 'PUBLISHER', workNumber: 'W1', partyKey: 'P1', controlled: 'Y', name: 'First Publishing', ipi: '99900000452', prOwned: '25', mrOwned: '50', srOwned: '50' };
const PUB2: V = { rowType: 'PUBLISHER', workNumber: 'W1', partyKey: 'P2', controlled: 'Y', name: 'Second Publishing', ipi: '99900000550', prOwned: '25', mrOwned: '50', srOwned: '50' };

describe('buildDoc: the file', () => {
  const built = buildDoc(EXAMPLE_ROWS, HEADER);
  const { doc, text } = built;

  it('is CWR 2.2 with one group of new work registrations and one transaction per WORK row', () => {
    expect(doc.version.version).toBe('2.2');
    expect(doc.version.grh).toBe('02.20');
    expect(doc.file.groups).toHaveLength(1);
    expect(doc.file.groups[0]!.type).toBe('NWR');
    expect(doc.file.groups[0]!.transactions).toHaveLength(3);
    expect(doc.records.every(r => r.status === 'ok')).toBe(true);
    expect(doc.orphans).toEqual([]);
  });

  it('ends every record in CR LF, in ASCII, and the text is the file', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(doc.encoding).toBe('ascii');
    expect(doc.lines.every(l => l.eol === '\r\n')).toBe(true);
    expect(String.fromCharCode(...doc.bytes)).toBe(text);
    expect(String.fromCharCode(...serialize(doc))).toBe(text);
  });

  it('has counts that the engine sets: renumbering changes nothing', () => {
    expect(renumber(parse(doc.bytes, { version: '2.2' }))).toEqual([]);
    const grt = doc.file.groups[0]!.grt!;
    expect(field(doc, grt, 'transactionCount')).toBe('00000003');
    expect(Number(field(doc, grt, 'recordCount'))).toBe(grt - doc.file.groups[0]!.grh + 1);
    const trl = doc.file.trl!;
    expect(field(doc, trl, 'groupCount')).toBe('00001');
    expect(field(doc, trl, 'transactionCount')).toBe('00000003');
    expect(Number(field(doc, trl, 'recordCount'))).toBe(doc.records.length);
  });

  it('puts the header from the caller in the HDR and the GRH, and nothing from the sheet', () => {
    const hdr = doc.file.hdr!;
    expect(field(doc, hdr, 'senderType')).toBe('PB');
    expect(field(doc, hdr, 'senderId')).toBe('123456789');
    expect(field(doc, hdr, 'senderName').trim()).toBe('EXAMPLE SENDER');
    expect(field(doc, hdr, 'ediStandardVersionNumber')).toBe('01.10');
    expect(field(doc, hdr, 'creationDate')).toBe('20261029');
    expect(field(doc, hdr, 'creationTime')).toBe('120000');
    expect(field(doc, hdr, 'transmissionDate')).toBe('20261029');
    expect(field(doc, hdr, 'version')).toBe('2.2');
    expect(field(doc, doc.file.groups[0]!.grh, 'groupId')).toBe('00001');
  });

  it('numbers transactions from 0 and records from 1 within each', () => {
    const seen: number[][] = [];
    for (const t of doc.file.groups[0]!.transactions) {
      expect(field(doc, t.header, 'recordSequence')).toBe('00000000');
      seen.push(t.records.map(r => Number(field(doc, r, 'recordSequence'))));
      expect(Number(field(doc, t.header, 'transactionSequence'))).toBe(seen.length - 1);
    }
    for (const s of seen) expect(s).toEqual(s.map((_, i) => i + 1));
  });

  it('gives the checker no errors, and no warnings either, for the example', () => {
    expect(checkerErrors(doc)).toEqual([]);
    expect(check(doc).summary.problems).toBe(0);
  });

  it('is the same file every time', () => {
    expect(buildDoc(EXAMPLE_ROWS, HEADER).text).toBe(text);
  });

  it('writes each work in sheet order, with its records in the order the specification lists them', () => {
    const types = doc.file.groups[0]!.transactions.map(t => [doc.records[t.header]!.type, ...t.records.map(r => doc.records[r]!.type)]);
    expect(types[0]).toEqual(['NWR', 'SPU', 'SPT', 'SPU', 'SPT', 'SWR', 'SWT', 'PWR', 'SWR', 'SWT', 'PWR', 'ALT', 'PER', 'REC']);
    expect(types[1]).toEqual(['NWR', 'SPU', 'SPT', 'SPT', 'OPU', 'SWR', 'SWT', 'SWT', 'PWR', 'OWR', 'OWR']);
    expect(types[2]).toEqual(['NWR', 'SWR', 'SWT']);
  });
});

describe('buildDoc: how rows become records', () => {
  const one = (extra: V[] = [], patches: Array<[number, V]> = []): CwrDoc => buildDoc(withRows(patches, extra), HEADER).doc;

  it('upper-cases text and cuts it to the field width', () => {
    const { doc } = buildDoc(withRows([[0, { title: 'a'.repeat(70) }]]), HEADER);
    const nwr = refsOf(doc, 'NWR')[0]!;
    expect(field(doc, nwr, 'workTitle')).toBe('A'.repeat(60));
    const doc2 = one([], [[0, { title: 'Quiet Orchard' }]]);
    expect(field(doc2, refsOf(doc2, 'NWR')[0]!, 'workTitle').trim()).toBe('QUIET ORCHARD');
    expect(field(doc2, refsOf(doc2, 'SWR')[0]!, 'writerLastName').trim()).toBe('QUILLFEATHER');
  });

  it('writes shares as hundredths of a percent, five digits', () => {
    const { doc } = buildDoc(EXAMPLE_ROWS, HEADER);
    const spu = refsOf(doc, 'SPU')[0]!;
    expect(field(doc, spu, 'prOwnershipShare')).toBe('02500');
    expect(field(doc, spu, 'mrOwnershipShare')).toBe('05000');
    const third = refsOf(doc, 'OWR').map(r => field(doc, r, 'prOwnershipShare'));
    expect(third).toEqual(['03333', '03334']);
    expect(field(doc, refsOf(doc, 'SWT')[0]!, 'prCollectionShare')).toBe('02500');
  });

  it('puts back an IPI name number that lost its leading zeros, and normalises ISWC and ISRC', () => {
    let short = '';
    for (let n = 1; n < 100 && short === ''; n++) {
      const body = String(n * 7919).padStart(9, '0');
      for (let c = 0; c < 100; c++) {
        const candidate = body + String(c).padStart(2, '0');
        if (candidate.startsWith('00') && identifierCheck('ipiName', candidate).ok) {
          short = candidate;
          break;
        }
      }
    }
    const doc = buildDoc(
      withRows([[0, { iswc: 't-034.524.680-1' }], [1, { ipi: short.replace(/^0+/, '') }]], [{ rowType: 'RECORDING', workNumber: 'W1', isrc: 'gb-aye-06-01498' }]),
      HEADER,
    ).doc;
    expect(field(doc, refsOf(doc, 'SWR')[0]!, 'writerIpiNameNumber')).toBe(short);
    expect(field(doc, refsOf(doc, 'NWR')[0]!, 'iswc')).toBe('T0345246801');
    expect(field(doc, refsOf(doc, 'REC')[0]!, 'isrc')).toBe('GBAYE0601498');
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('turns a length into HHMMSS and a date into YYYYMMDD', () => {
    const doc = buildDoc(withRows([[0, { duration: '1:03:25' }]], [{ rowType: 'RECORDING', workNumber: 'W1', isrc: 'GBAYE0601498', duration: '3:05', releaseDate: '2026-03-06' }]), HEADER).doc;
    expect(field(doc, refsOf(doc, 'NWR')[0]!, 'duration')).toBe('010325');
    const rec = refsOf(doc, 'REC')[0]!;
    expect(field(doc, rec, 'firstReleaseDuration')).toBe('000305');
    expect(field(doc, rec, 'firstReleaseDate')).toBe('20260306');
    expect(field(doc, refsOf(doc, 'NWR')[0]!, 'recordedIndicator')).toBe('Y');
  });

  it('keeps the same Interested Party # for the same person across works, and gives different people different ones', () => {
    const { doc } = buildDoc(EXAMPLE_ROWS, HEADER);
    const ana = refsOf(doc, 'SWR').filter(r => field(doc, r, 'writerIpiNameNumber') === '99900000158');
    expect(ana).toHaveLength(2);
    expect(field(doc, ana[0]!, 'interestedPartyNumber')).toBe(field(doc, ana[1]!, 'interestedPartyNumber'));
    const all = new Set([...refsOf(doc, 'SWR'), ...refsOf(doc, 'OWR')].map(r => field(doc, r, 'interestedPartyNumber')));
    expect(all.size).toBe(4);
    for (const r of [...refsOf(doc, 'SPU'), ...refsOf(doc, 'OPU')]) expect(field(doc, r, 'interestedPartyNumber')).toMatch(/^P\d{8}$/);
  });

  it('numbers publisher chains from 1, the controlled ones first, and ties each PWR to its chain', () => {
    const r = rows(
      { rowType: 'WORK', workNumber: 'W1', title: 'T' },
      { rowType: 'PUBLISHER', workNumber: 'W1', controlled: 'N', name: 'Other Publishing', ipi: '99900000648', mrOwned: '50', srOwned: '50' },
      { ...PUB1, mrOwned: '25', srOwned: '25' },
      { ...PUB2, mrOwned: '25', srOwned: '25' },
      { rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'C', name: 'A', prOwned: '25', publisher: 'P2' },
      { rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'A', name: 'B', prOwned: '25', publisher: 'P1; P2' },
    );
    const { doc } = buildDoc(r, HEADER);
    const pubs = [...refsOf(doc, 'SPU'), ...refsOf(doc, 'OPU')];
    expect(pubs.map(p => field(doc, p, 'publisherSequenceNumber'))).toEqual(['01', '02', '03']);
    expect(pubs.map(p => doc.records[p]!.type)).toEqual(['SPU', 'SPU', 'OPU']);
    const pwr = refsOf(doc, 'PWR').map(p => [field(doc, p, 'publisherSequenceNumber'), field(doc, p, 'publisherName').trim()]);
    expect(pwr).toEqual([['02', 'SECOND PUBLISHING'], ['01', 'FIRST PUBLISHING'], ['02', 'SECOND PUBLISHING']]);
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('writes an SPT or SWT per territory with a sequence number, and World when no territory is given', () => {
    const { doc } = buildDoc(EXAMPLE_ROWS, HEADER);
    const spt = refsOf(doc, 'SPT').map(r => [field(doc, r, 'tisNumericCode'), field(doc, r, 'sequenceNumber')]);
    expect(spt).toEqual([['2136', '001'], ['2136', '001'], ['0826', '001'], ['0840', '002']]);
    expect(refsOf(doc, 'OPT')).toEqual([]);
    expect(refsOf(doc, 'OWT')).toEqual([]);
  });

  it('uses the collected share when one is given, and the owned share when not', () => {
    const r = rows(
      { rowType: 'WORK', workNumber: 'W1', title: 'T' },
      { ...PUB1, mrCollected: '40' },
      { ...PUB2 },
      { rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'C', name: 'A', prOwned: '50', publisher: 'P1; P2' },
    );
    const { doc } = buildDoc(r, HEADER);
    const spt = refsOf(doc, 'SPT');
    expect([field(doc, spt[0]!, 'mrCollectionShare'), field(doc, spt[1]!, 'mrCollectionShare')]).toEqual(['04000', '05000']);
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('writes parties you do not control as OPU and OWR, with no territory records', () => {
    const r = rows(
      { rowType: 'WORK', workNumber: 'W1', title: 'T' },
      { rowType: 'PUBLISHER', workNumber: 'W1', controlled: 'N', name: 'Elsewhere Publishing', prOwned: '50', mrOwned: '100', srOwned: '100' },
      { rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'CA', name: 'Elsewhere', prOwned: '50' },
    );
    const { doc } = buildDoc(r, HEADER);
    expect(refsOf(doc, 'OPU')).toHaveLength(1);
    expect(refsOf(doc, 'OWR')).toHaveLength(1);
    for (const t of ['SPU', 'SWR', 'SPT', 'SWT', 'PWR']) expect(refsOf(doc, t)).toEqual([]);
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('marks a work with an arranger as a modification, with the two fields that needs', () => {
    const r = withRows([[1, { prOwned: '50', mrOwned: '50', srOwned: '50' }]], [{ rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'AR', name: 'Arranger', prOwned: '50', mrOwned: '50', srOwned: '50' }]);
    const { doc } = buildDoc(r, HEADER);
    const nwr = refsOf(doc, 'NWR')[0]!;
    expect(field(doc, nwr, 'versionType').trim()).toBe('MOD');
    expect(field(doc, nwr, 'musicArrangement').trim()).toBe('UNS');
    expect(field(doc, nwr, 'lyricAdaptation').trim()).toBe('UNS');
    expect(checkerErrors(doc)).toEqual([]);
    const plain = buildDoc(withRows(), HEADER).doc;
    expect(field(plain, refsOf(plain, 'NWR')[0]!, 'versionType').trim()).toBe('ORI');
  });

  it('writes alternative titles, performers and recordings', () => {
    const doc = one([
      { rowType: 'ALT TITLE', workNumber: 'W1', title: 'Autre titre', titleType: 'AT', language: 'fr' },
      { rowType: 'ALT TITLE', workNumber: 'W1', title: 'Third' },
      { rowType: 'PERFORMER', workNumber: 'W1', name: 'The Band', firstName: 'Lead', ipi: '99900000158' },
      { rowType: 'RECORDING', workNumber: 'W1', title: 'Test Song', isrc: 'GBAYE0601498', album: 'Album', label: 'Label' },
    ]);
    const alts = refsOf(doc, 'ALT').map(r => [field(doc, r, 'alternateTitle').trim(), field(doc, r, 'titleType'), field(doc, r, 'languageCode').trim()]);
    expect(alts).toEqual([['AUTRE TITRE', 'AT', 'FR'], ['THIRD', 'AT', '']]);
    const per = refsOf(doc, 'PER')[0]!;
    expect([field(doc, per, 'performingArtistLastName').trim(), field(doc, per, 'performingArtistFirstName').trim(), field(doc, per, 'performingArtistIpiNameNumber')]).toEqual(['THE BAND', 'LEAD', '99900000158']);
    const rec = refsOf(doc, 'REC')[0]!;
    expect([field(doc, rec, 'recordingTitle').trim(), field(doc, rec, 'firstAlbumTitle').trim(), field(doc, rec, 'recordLabel').trim()]).toEqual(['TEST SONG', 'ALBUM', 'LABEL']);
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('does not stop for warnings', () => {
    const r = withRows([[0, { title: 'x'.repeat(80) }]], [{ rowType: 'WORK', workNumber: 'W1', title: 'dup' }]);
    expect(() => buildDoc(r, HEADER)).toThrow(BuildError); // a duplicate is an error
    expect(() => buildDoc(withRows([[0, { title: 'x'.repeat(80) }]]), HEADER)).not.toThrow(); // text too long is a warning
  });
});

describe('buildDoc: refusing', () => {
  it('throws a BuildError that lists the problems, and builds nothing', () => {
    const bad = withRows([[0, { title: '' }], [1, { ipi: '12ab' }]]);
    try {
      buildDoc(bad, HEADER);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BuildError);
      const err = e as BuildError;
      expect(err.code).toBe('BUILD_REFUSED');
      expect(err.problems.filter(p => p.severity === 'error').map(p => p.code).sort()).toEqual(['bad-ipi', 'missing-title']);
      expect(err.headerProblems).toEqual([]);
      expect(err.message).toContain('2 problems in the rows');
    }
  });

  it('refuses an empty sheet', () => {
    expect(() => buildDoc([], HEADER)).toThrow(BuildError);
  });

  const bad = (h: Partial<BuildHeader>): BuildHeader => ({ ...HEADER, ...h });

  it('refuses sender details that cannot go in the header', () => {
    const cases: Array<[Partial<BuildHeader>, string]> = [
      [{ senderType: 'XX' }, 'sender-type'],
      [{ senderId: '' }, 'sender-id'],
      [{ senderId: '12345678901' }, 'sender-id'],
      [{ senderId: 'ABC' }, 'sender-id'],
      [{ senderName: '' }, 'sender-name'],
      [{ senderName: 'N'.repeat(46) }, 'sender-name'],
      [{ creationDate: '20261340' }, 'creation-date'],
      [{ transmissionDate: 'tomorrow' }, 'transmission-date'],
      [{ creationTime: '250000' }, 'creation-time'],
      [{ characterSet: 'C'.repeat(16) }, 'character-set'],
    ];
    for (const [patch, code] of cases) {
      expect(checkHeader(bad(patch)).map(p => p.code)).toContain(code);
      try {
        buildDoc(withRows(), bad(patch));
        expect.unreachable();
      } catch (e) {
        expect((e as BuildError).headerProblems.map(p => p.code)).toContain(code);
      }
    }
    expect(checkHeader(HEADER)).toEqual([]);
  });

  it('accepts dates with dashes, times with colons, and a lower-case sender type', () => {
    const { doc } = buildDoc(withRows(), bad({ senderType: 'pb', creationDate: '2026-10-29', creationTime: '12:30:05', transmissionDate: '2026-10-30', senderId: '42' }));
    const hdr = doc.file.hdr!;
    expect([field(doc, hdr, 'senderType'), field(doc, hdr, 'senderId'), field(doc, hdr, 'creationDate'), field(doc, hdr, 'creationTime'), field(doc, hdr, 'transmissionDate')]).toEqual([
      'PB', '000000042', '20261029', '123005', '20261030',
    ]);
  });

  it('writes letters outside ASCII only when the header names a character set, as UTF-8', () => {
    const r = withRows([[1, { name: 'Éloïse', firstName: 'Zoë' }]]);
    try {
      buildDoc(r, HEADER);
      expect.unreachable();
    } catch (e) {
      expect((e as BuildError).headerProblems.map(p => p.code)).toEqual(['character-set-needed']);
    }
    const { doc, text } = buildDoc(r, { ...HEADER, characterSet: 'UTF-8' });
    expect(doc.encoding).toBe('utf8');
    expect(text).toContain('ÉLOÏSE');
    expect(field(doc, doc.file.hdr!, 'characterSet').trim()).toBe('UTF-8');
    expect(checkerErrors(doc)).toEqual([]);
  });
});

describe('buildDoc: review fixes', () => {
  const header = (h: Partial<BuildHeader>): BuildHeader => ({ ...HEADER, ...h });
  const refused = (h: Partial<BuildHeader>): HeaderProblem[] => {
    const found = checkHeader(header(h));
    expect(found.length).toBeGreaterThan(0);
    try {
      buildDoc(withRows(), header(h));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BuildError);
      expect((e as BuildError).headerProblems).toEqual(found);
    }
    return found;
  };

  it('refuses control characters and line breaks in the sender details, so a caller cannot add records', () => {
    expect(refused({ senderName: 'Acme\nMusic' })).toMatchObject([{ field: 'senderName', code: 'bad-character' }]);
    expect(refused({ softwarePackageVersion: '1\r\nTRL000010000000100000099' })).toMatchObject([{ field: 'softwarePackageVersion', code: 'bad-character' }]);
    expect(refused({ softwarePackage: 'Tool\u0085X', characterSet: 'UTF-8' })).toMatchObject([{ field: 'softwarePackage', code: 'bad-character' }]);
    expect(refused({ senderName: 'Ωμέγα\u0001' }).map(p => p.field)).toContain('senderName');
  });

  it('refuses letters outside Latin-1 in the sender details', () => {
    expect(refused({ senderName: '李小龍 Music', characterSet: 'UTF-8' })).toMatchObject([{ field: 'senderName', code: 'unsupported-character' }]);
  });

  it('asks for a character set when the software version has a non-ASCII letter', () => {
    expect(refused({ softwarePackageVersion: 'é' })).toMatchObject([{ field: 'characterSet', code: 'character-set-needed' }]);
    const { doc } = buildDoc(withRows(), header({ softwarePackageVersion: 'é', characterSet: 'utf8' }));
    expect(field(doc, doc.file.hdr!, 'characterSet').trim()).toBe('UTF-8');
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('refuses software names that would be cut, in capitals', () => {
    expect(refused({ softwarePackage: 'S'.repeat(31) })).toMatchObject([{ field: 'softwarePackage', code: 'header-text-too-long' }]);
    expect(refused({ softwarePackageVersion: 'ß'.repeat(16), characterSet: 'UTF-8' })).toMatchObject([{ field: 'softwarePackageVersion', code: 'header-text-too-long' }]);
    expect(checkHeader(header({ softwarePackage: 'S'.repeat(30), softwarePackageVersion: '1'.repeat(30) }))).toEqual([]);
  });

  it('refuses a sender code of all zeros, which means no code was entered', () => {
    for (const senderId of ['0', '000000000', '00']) {
      expect(refused({ senderId })).toMatchObject([{ field: 'senderId', code: 'sender-id' }]);
    }
    expect(checkHeader(header({ senderId: '000000001' }))).toEqual([]);
  });

  it('accepts only UTF-8 as a character set name, because the bytes are always UTF-8', () => {
    expect(refused({ characterSet: 'ASCII' })).toMatchObject([{ field: 'characterSet', code: 'character-set' }]);
    expect(refused({ characterSet: 'Big5' })).toMatchObject([{ field: 'characterSet', code: 'character-set' }]);
    const { doc } = buildDoc(withRows([[1, { name: 'Café' }]]), header({ characterSet: 'utf-8' }));
    expect(field(doc, doc.file.hdr!, 'characterSet').trim()).toBe('UTF-8');
  });

  it('writes ISRC Validity Y, because the sheet states the link between the ISRC and the work', () => {
    const { doc } = buildDoc(EXAMPLE_ROWS, HEADER);
    const recs = refsOf(doc, 'REC');
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(field(doc, r, 'isrcValidity').trim()).toBe('Y');
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('throws a BuildError, never a plain Error, for a work with more than 99 publishers or a territory code that is not known', () => {
    const pubs: V[] = Array.from({ length: 100 }, (_, i) => ({ rowType: 'PUBLISHER', workNumber: 'W1', partyKey: `K${i}`, controlled: 'N', name: `Pub ${i}`, prOwned: '0.5', mrOwned: '1', srOwned: '1' }));
    const manyPubs = withRows([[1, { prOwned: '50', mrOwned: '', srOwned: '' }]], pubs);
    const unknownTerr = withRows([[1, { territories: '0826;9999' }]]);
    for (const [sheet, code] of [[manyPubs, 'too-many-publishers'], [unknownTerr, 'unknown-territory']] as const) {
      try {
        buildDoc(sheet, HEADER);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(BuildError);
        expect((e as BuildError).problems.some(p => p.code === code && p.severity === 'error')).toBe(true);
      }
    }
  });

  it('builds with 99 publishers and a list of territories', () => {
    const pubs: V[] = Array.from({ length: 99 }, (_, i) => ({ rowType: 'PUBLISHER', workNumber: 'W1', partyKey: `K${i}`, controlled: 'N', name: `Pub ${i}`, prOwned: '0.5', mrOwned: '1', srOwned: '1' }));
    const a = buildDoc(withRows([[1, { prOwned: '50.5', mrOwned: '1', srOwned: '1' }]], pubs), HEADER);
    expect(refsOf(a.doc, 'OPU')).toHaveLength(99);
    const b = buildDoc(withRows([[1, { territories: '0826;0840;0250' }]]), HEADER);
    expect(refsOf(b.doc, 'SWT')).toHaveLength(3);
  }, 30_000);

  it('refuses a control character from the C1 range in a title', () => {
    expect(() => buildDoc(withRows([[0, { title: 'Song\u0085Two' }]]), header({ characterSet: 'UTF-8' }))).toThrow(BuildError);
  });

  it('refuses the title type OT in an alternative title', () => {
    expect(() => buildDoc(withRows([], [{ rowType: 'ALT TITLE', workNumber: 'W1', title: 'Other', titleType: 'OT' }]), HEADER)).toThrow(BuildError);
  });

  it('warns about a collection-less writer in the rows, where the checker would otherwise warn about the file', () => {
    const sheet = withRows([[1, { prCollected: '0', mrCollected: '0', srCollected: '0' }]]);
    expect(checkRows(sheet).some(p => p.code === 'writer-no-collection')).toBe(true);
    const { doc } = buildDoc(sheet, HEADER);
    expect(check(doc).problems.some(p => p.ruleId === 'NWR-T-020')).toBe(true);
  });
});

describe('buildDoc: the rows it is given are not changed', () => {
  it('leaves them alone', () => {
    const r: TemplateRow[] = rows(...EXAMPLE_ROWS.map(x => ({ ...x })));
    const before = JSON.stringify(r);
    buildDoc(r, HEADER);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe('buildDoc: a long file', () => {
  it('builds 25 works of the example shapes with no errors from the checker', () => {
    const many: V[] = [];
    for (let i = 1; i <= 25; i++) {
      const n = `N${String(i).padStart(3, '0')}`;
      many.push({ rowType: 'WORK', workNumber: n, title: `Song ${i}` });
      many.push({ rowType: 'WRITER', workNumber: n, controlled: 'Y', role: 'CA', name: 'Quillfeather', ipi: '99900000158', prOwned: '100', mrOwned: '100', srOwned: '100' });
    }
    const { doc } = buildDoc(rows(...many), HEADER);
    expect(doc.file.groups[0]!.transactions).toHaveLength(25);
    expect(checkerErrors(doc)).toEqual([]);
  });
});

describe('buildDoc: second review fixes', () => {
  const header = (h: Partial<BuildHeader>): BuildHeader => ({ ...HEADER, ...h });

  it('refuses a sheet whose Publisher cell is only separators, so the checker never sees an SWR without a PWR', () => {
    for (const cell of [';', ',', ' , ', ';;']) {
      const sheet = rows(
        { rowType: 'WORK', workNumber: 'W1', title: 'Test Song' },
        { ...PUB1, prOwned: '25', mrOwned: '50', srOwned: '50' },
        { rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'CA', name: 'Quillfeather', prOwned: '75', mrOwned: '50', srOwned: '50', publisher: cell },
      );
      expect(() => buildDoc(sheet, HEADER)).toThrow(BuildError);
    }
  });

  it('cleans the sender details: a non-breaking space or decomposed accent is treated like the plain form', () => {
    const { doc } = buildDoc(withRows(), header({ senderName: '\u00a0Acme\u00a0Music\u00a0', softwarePackage: 'Tool\u00a0X', softwarePackageVersion: '\u200b1.0', characterSet: 'UTF-8' }));
    const hdr = doc.file.hdr!;
    expect(field(doc, hdr, 'senderName').trim()).toBe('ACME MUSIC');
    expect(field(doc, hdr, 'softwarePackage').trim()).toBe('TOOL X');
    expect(field(doc, hdr, 'softwarePackageVersion').trim()).toBe('1.0');
    const composed = buildDoc(withRows(), header({ senderName: 'Caf\u00e9', characterSet: 'UTF-8' })).text;
    const decomposed = buildDoc(withRows(), header({ senderName: 'Cafe\u0301', characterSet: 'UTF-8' })).text;
    expect(decomposed).toBe(composed);
  });

  it('counts the length of a sender detail after cleaning', () => {
    expect(checkHeader(header({ senderName: `\u00a0${'N'.repeat(45)}\u00a0` }))).toEqual([]);
  });

  it('takes dates only as YYYYMMDD or YYYY-MM-DD, and times only as HHMMSS or HH:MM:SS', () => {
    for (const creationDate of ['20-26-10-29', '2026-1029', '202610-29', '2026/10/29', '2026-10-2']) {
      expect(checkHeader(header({ creationDate })).map(p => p.code)).toEqual(['creation-date']);
    }
    for (const transmissionDate of ['2026--10-29', '2026-10-29-', '--20261029']) {
      expect(checkHeader(header({ transmissionDate })).map(p => p.code)).toEqual(['transmission-date']);
    }
    for (const creationTime of ['12:00:0', '1:2:3', '12::00:00', '12:0000', '12-00-00', '120:000']) {
      expect(checkHeader(header({ creationTime })).map(p => p.code)).toEqual(['creation-time']);
    }
    expect(checkHeader(header({ creationDate: '2026-10-29', transmissionDate: '20261030', creationTime: '12:30:05' }))).toEqual([]);
  });
});
