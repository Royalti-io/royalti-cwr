import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { check, parse } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { LOOKUPS } from '../../src/spec/lookups/index';
import { hasLowerCaseAt, isRealDate, isRealDateAt, isRealTime, isRealTimeAt } from '../../src/rules/util';
import { ackBase, agrBase, bytesOf, clean, rec, Tx } from './support';

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

/** Rule ids that fire after one field of the clean file is set to `value`. */
function fired(version: CwrVersion, type: string, nth: number, field: string, value: string): string[] {
  const t = clean(version);
  const line = t.find(type, nth);
  t.put(line, field, value);
  return t.run().problems.map(p => p.ruleId);
}

describe('baselines for the other file shapes', () => {
  for (const version of VERSIONS) {
    it(`${version}: the ACK file (with an NWR and an EXC that continue it) has no problems`, () => {
      expect(ackBase(version).run().problems).toEqual([]);
    });
    it(`${version}: the AGR file has no problems`, () => {
      expect(agrBase(version).run().problems).toEqual([]);
    });
  }
});

describe('what each format rule lets through and what it stops', () => {
  for (const version of VERSIONS) {
    it(`${version}: Y/N fields`, () => {
      for (const ok of ['Y', 'N', ' ']) expect(fired(version, 'SPT', 0, 'sharesChange', ok)).toEqual([]);
      for (const bad of ['U', 'X', 'y', '1']) expect(fired(version, 'SPT', 0, 'sharesChange', bad)).toEqual(['FMT-B']);
    });

    it(`${version}: Y/N/U flags`, () => {
      for (const ok of ['Y', 'N', 'U', ' ']) expect(fired(version, 'NWR', 0, 'exceptionalClause', ok)).toEqual([]);
      for (const bad of ['X', 'y', '0']) expect(fired(version, 'NWR', 0, 'exceptionalClause', bad)).toEqual(['FMT-F']);
    });

    it(`${version}: dates`, () => {
      for (const ok of ['00000000', '20240229', '20261231', '20260101', '16000229']) expect(fired(version, 'NWR', 0, 'copyrightDate', ok)).toEqual([]);
      for (const bad of ['20230229', '20260431', '20260000', '20261301', '20260100', '2026010A', '19000229']) {
        expect(fired(version, 'NWR', 0, 'copyrightDate', bad)).toEqual(['FMT-D']);
      }
    });

    it(`${version}: a mandatory date of zeroes is blank, not a date`, () => {
      const t = clean(version);
      t.put(0, 'creationDate', '00000000');
      expect(t.run().problems.map(p => p.ruleId)).toEqual(['FMT-M']);
    });

    it(`${version}: times of day stop at 23:59:59, durations do not`, () => {
      for (const ok of ['000000', '235959', '120000']) {
        const t = clean(version);
        t.put(0, 'creationTime', ok);
        expect(t.run().problems).toEqual([]);
      }
      for (const bad of ['240000', '236000', '235960', '12000A']) {
        const t = clean(version);
        t.put(0, 'creationTime', bad);
        expect(t.run().problems.map(p => p.ruleId)).toEqual(['FMT-T']);
      }
      for (const ok of ['250000', '995959', '000000']) expect(fired(version, 'NWR', 0, 'duration', ok)).toEqual([]);
      for (const bad of ['006000', '000060', '009900', '0030']) expect(fired(version, 'NWR', 0, 'duration', bad.padEnd(6, 'X').slice(0, 6))).toEqual(['FMT-T']);
    });

    it(`${version}: numeric fields`, () => {
      expect(fired(version, 'SPU', 0, 'publisherSequenceNumber', '01')).toEqual([]);
      for (const bad of [' 7', '7 ', '+7', '1.']) expect(fired(version, 'SPU', 0, 'publisherSequenceNumber', bad)).toEqual(['FMT-N']);
      expect(fired(version, 'SPU', 0, 'publisherSequenceNumber', '  ')).toEqual(['FMT-M']);
      expect(fired(version, 'SWR', 0, 'personalNumber', '000000000000')).toEqual([]);
      expect(fired(version, 'SWR', 0, 'personalNumber', '')).toEqual(['FMT-Z']);
      expect(fired(version, 'SWR', 0, 'personalNumber', '12345678901X')).toEqual(['FMT-N']);
    });

    it(`${version}: a mandatory field`, () => {
      expect(fired(version, 'NWR', 0, 'submitterWorkNumber', 'A')).toEqual([]);
      expect(fired(version, 'NWR', 0, 'submitterWorkNumber', '')).toEqual(['FMT-M']);
    });

    it(`${version}: the SPT Constant field is meant to be blank and is not a mandatory miss`, () => {
      expect(fired(version, 'SPT', 0, 'constant', '')).toEqual([]);
    });
  }

  it('finds lower case in the ASCII range and above it, and nowhere else', () => {
    expect(hasLowerCaseAt('ABC DEF 123', 0, 11)).toBe(false);
    expect(hasLowerCaseAt('ABC dEF', 0, 7)).toBe(true);
    expect(hasLowerCaseAt('ABC dEF', 0, 4)).toBe(false);
    expect(hasLowerCaseAt('CAFÉ', 0, 4)).toBe(false);
    expect(hasLowerCaseAt('CAFé', 0, 4)).toBe(true);
    expect(hasLowerCaseAt('{[~', 0, 3)).toBe(false);
  });

  it('agrees with itself: the in-place date and time checks match the string checks', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9 A]{8}$/), v => isRealDate(v) === isRealDateAt('xx' + v + 'yy', 2)),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9 A]{6}$/), fc.boolean(), (v, tod) => isRealTime(v, tod) === isRealTimeAt('xx' + v + 'yy', 2, tod)),
      { numRuns: 500 },
    );
    expect(isRealDate('00000000')).toBe(false);
    expect(isRealDate('20240229')).toBe(true);
    expect(isRealDate('21000229')).toBe(false);
    expect(isRealDate('20000229')).toBe(true);
  });
});

describe('lookups', () => {
  const societyCodes = new Set(LOOKUPS.societyCode.rows.map(r => r.code));
  const transmitterOnly = LOOKUPS.transmitterCode.rows.find(r => /^\d{3}$/.test(r.code) && !societyCodes.has(r.code))?.code;

  for (const version of VERSIONS) {
    it(`${version}: a society code is known if either saved list has it`, () => {
      expect(transmitterOnly, 'the 3.0 list has a numeric code CRF020 lacks').toBeDefined();
      expect(fired(version, 'SWR', 0, 'prAffiliationSocietyNumber', '021')).toEqual([]);
      expect(fired(version, 'SWR', 0, 'prAffiliationSocietyNumber', transmitterOnly!)).toEqual([]);
      expect(fired(version, 'SWR', 0, 'prAffiliationSocietyNumber', '999')).toEqual(['LKP-SOC']);
      expect(fired(version, 'SWR', 0, 'prAffiliationSocietyNumber', '')).toEqual([]);
    });

    it(`${version}: table values are matched after trimming, and a blank optional field is not entered`, () => {
      expect(fired(version, 'NWR', 0, 'languageCode', 'EN')).toEqual([]);
      expect(fired(version, 'NWR', 0, 'languageCode', '')).toEqual([]);
      expect(fired(version, 'NWR', 0, 'languageCode', 'en')).toEqual(['LKP-TBL']);
      expect(fired(version, 'SPU', 0, 'publisherType', 'E')).toEqual([]);
      expect(fired(version, 'SPU', 0, 'publisherType', 'ZZ')).toEqual(['LKP-TBL']);
    });

    it(`${version}: TIS codes in the saved list pass, 2136 included`, () => {
      expect(fired(version, 'SPT', 0, 'tisNumericCode', '2136')).toEqual([]);
      expect(fired(version, 'SPT', 0, 'tisNumericCode', '0840')).toEqual([]);
    });

    it(`${version}: a retired transaction type is flagged though it is in the table`, () => {
      const t = clean(version);
      t.put(t.find('GRH'), 'transactionType', 'COP');
      const ids = t.run().problems.map(p => p.ruleId);
      expect(ids).toContain('LKP-RET');
      expect(ids).not.toContain('LKP-TBL');
    });
  }
});

describe('records that are cut or odd', () => {
  for (const version of VERSIONS) {
    it(`${version}: a field the record does not fully reach is left to STR-LEN`, () => {
      const t = clean(version);
      const line = t.find('SWT', 0);
      const span = t.span(line, 'prCollectionShare');
      // End one character before the field ends: the field is partly there, and what is there is not a fault.
      t.lines[line] = t.lines[line]!.slice(0, span.end - 1);
      const ids = t.run().problems.map(p => p.ruleId);
      expect(ids).toEqual(['STR-LEN']);
    });

    it(`${version}: a record cut inside a field holding letters is still only STR-LEN`, () => {
      const t = clean(version);
      const line = t.find('NWR', 0);
      const span = t.span(line, 'copyrightDate');
      t.lines[line] = t.lines[line]!.slice(0, span.start + 4) ;
      expect(t.run().problems.map(p => p.ruleId)).toEqual(['STR-LEN']);
    });

    it(`${version}: GRH at 26 and GRT at 24 characters are the layouts, not short records`, () => {
      const t = clean(version);
      expect(t.lines[t.find('GRH')]!.length).toBe(26);
      expect(t.lines[t.find('GRT')]!.length).toBe(24);
      expect(t.run().problems).toEqual([]);
    });

    it(`${version}: the unused tail of a GRT and GRH may be present, at their full lengths`, () => {
      const t = clean(version);
      t.lines[t.find('GRH')] += '  ';
      t.lines[t.find('GRT')] += ' '.repeat(13);
      expect(t.run().problems.map(p => p.ruleId)).toEqual(['FMT-Z']); // the GRT's Total Monetary Value, blank where zeroes belong
    });
  }
});

describe('EXC and ACK special cases', () => {
  for (const version of VERSIONS) {
    it(`${version}: mandatory-field edits are bypassed in an EXC, not in the NWR it follows`, () => {
      const t = ackBase(version);
      t.put(t.find('EXC'), 'workTitle', '');
      expect(t.run().problems).toEqual([]);
      const u = ackBase(version);
      u.put(u.find('NWR'), 'workTitle', '');
      expect(u.run().problems.map(p => p.ruleId)).toEqual(['FMT-M']);
    });

    it(`${version}: an ACK that answers a problem with the HDR has no work behind it`, () => {
      const t = ackBase(version);
      while (t.lines[3]!.slice(0, 3) !== 'GRT') t.remove(3);
      t.put(2, 'originalTransactionType', 'HDR');
      t.fix();
      expect(t.run().problems).toEqual([]);
    });

    it(`${version}: the NWR an ACK carries continues its transaction number and record numbers`, () => {
      const t = ackBase(version);
      const ack = t.find('ACK');
      const nwr = t.find('NWR');
      expect(t.get(ack, 'transactionSequence')).toBe(t.get(nwr, 'transactionSequence'));
      expect(t.get(nwr, 'recordSequence')).toBe('00000001');
      // And a wrong number on it is reported.
      t.put(nwr, 'transactionSequence', '5');
      expect(t.run().problems.map(p => p.ruleId)).toContain('PFX-3');
    });
  }
});

describe('record order: patterns the spec’s BNF allows are not reported', () => {
  for (const version of VERSIONS) {
    it(`${version}: repeated publisher chains, writers with PWR after OWR, titles and the tail records`, () => {
      const t = clean(version, 1);
      const sequence: Array<[string, Record<string, string>]> = [
        ['SPU', { interestedPartyNumber: 'P1', publisherName: 'X', publisherType: 'E' }],
        ['NPN', {}],
        ['SPT', { interestedPartyNumber: 'P1' }],
        ['SPU', { interestedPartyNumber: 'P2', publisherName: 'X', publisherType: 'SE' }],
        ['SPT', { interestedPartyNumber: 'P2' }],
        ['OPU', { publisherName: 'X' }],
        ['NPN', {}],
        ['SWR', { interestedPartyNumber: 'W1', writerLastName: 'X', writerDesignationCode: 'CA' }],
        ['NWN', {}],
        ['SWT', { interestedPartyNumber: 'W1' }],
        ['PWR', {}],
        ['OWR', { writerLastName: 'X' }],
        ['NWN', {}],
        ['PWR', {}],
        ['ALT', { titleType: 'AT' }],
        ['ALT', { titleType: 'AT' }],
        ['NAT', { titleType: 'AT' }],
        ['EWT', {}],
        ['NET', {}],
        ['NOW', {}],
        ['VER', {}],
        ['NVT', {}],
        ['NOW', {}],
        ['PER', {}],
        ['NPR', { performingArtistName: 'X' }],
        ['REC', { recordingFormat: 'A' }],
        ['ORN', { intendedPurpose: 'COM', productionTitle: 'X' }],
        ['INS', {}],
        ['IND', {}],
        ['COM', {}],
        ['NCT', {}],
        ['NOW', {}],
        ['ARI', { societyNumber: '021', workNumber: 'X' }],
      ];
      if (version === '2.2') {
        sequence.splice(3, 0, ['OPT', {}]);
        sequence.splice(13, 0, ['OWT', {}]);
        sequence.push(['XRF', { organisationCode: '021', identifierType: 'W' }]);
      }
      const at = t.find('NWR');
      t.put(at, 'compositeType', 'MED'); // the COM below needs a composite work
      t.put(at, 'compositeComponentCount', '2');
      // A work of its own: the NWR header and nothing else, then the sequence under test.
      for (let i = t.lines.length - 3; i > at; i--) t.remove(i);
      sequence.forEach(([type, over], i) => t.insertAfter(at + i, rec(version, type, over)));
      t.fix();
      // The sequence is made of dummy parties (no shares, blank Interested Party #s), so only the rules about record order and the
      // allowed record types are asked here; the share and link rules have their own tests.
      const order = new Set(['NWR-T-018', 'NWR-T-043', 'NWR-T-008', 'STR-F-001']);
      expect(t.run().problems.filter(p => order.has(p.ruleId)).map(p => `${p.ruleId} line ${p.line}: ${p.message}`)).toEqual([]);
    });
  }
});

describe('whole-file edge cases', () => {
  it('an empty file is reported at file level, not thrown on', () => {
    const r = check(parse(new Uint8Array(0)));
    expect(r.problems.map(p => [p.ruleId, p.line, p.span])).toEqual([['HDR-1', -1, null]]);
    expect(r.summary.text).toMatch(/^1 problem in \d+ checks: 1 error, 0 warnings$/);
  });

  it('a file with one HDR line has no GRH', () => {
    const r = check(parse(bytesOf('HDR' + ' '.repeat(98))));
    expect(r.problems.map(p => p.ruleId)).toContain('HDR-2');
    expect(r.problems.find(p => p.ruleId === 'HDR-2')!.line).toBe(-1);
  });

  it('a file of blank lines has blank-line notes and no crash', () => {
    const r = check(parse(bytesOf('\r\n   \r\n\r\n')));
    expect(r.problems.filter(p => p.ruleId === 'ENC-003')).toHaveLength(3);
    expect(r.summary.infos).toBe(3);
  });

  it('a single-record file where every record type is nonsense still checks', () => {
    const r = check(parse(bytesOf('ZZZ' + '0'.repeat(30))));
    expect(r.problems.map(p => p.ruleId).sort()).toEqual(['HDR-1', 'HDR-2', 'STR-F-001', 'TRL-1']);
  });

  it('never throws and always points inside the file, whatever the lines', () => {
    const lineArb = fc.oneof(
      fc.stringMatching(/^[A-Z0-9 ]{0,300}$/),
      fc.constantFrom('HDR', 'GRH', 'GRT', 'TRL', 'NWR', 'SPU', 'SPT', 'SWR', 'SWT', 'PWR', 'ACK', 'AGR', 'MSG').chain(t => fc.stringMatching(/^[A-Z0-9 ]{0,260}$/).map(s => t + s)),
    );
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 40 }), fc.constantFrom<CwrVersion>('2.1', '2.2'), (lines, version) => {
        const doc = parse(bytesOf(lines.join('\r\n')), { version });
        const r = check(doc);
        for (const p of r.problems) {
          expect(p.line).toBeGreaterThanOrEqual(-1);
          expect(p.line).toBeLessThan(doc.lines.length);
          if (p.span) {
            expect(p.line).toBeGreaterThanOrEqual(0);
            expect(p.span.start).toBeGreaterThanOrEqual(0);
            expect(p.span.end).toBeGreaterThanOrEqual(p.span.start);
          }
          expect(p.message).not.toMatch(/\{\w+\}/);
          expect(p.message).not.toMatch(/undefined|NaN/);
        }
        expect(r.summary.text).not.toMatch(/valid/i);
      }),
      { numRuns: 80 },
    );
  }, 60000);

  it('keeps `Tx` honest: the helper’s put refuses a value that does not fit', () => {
    const t = clean('2.1');
    expect(() => t.put(t.find('NWR'), 'languageCode', 'ENG')).toThrow(/does not fit/);
    void Tx;
  });
});
