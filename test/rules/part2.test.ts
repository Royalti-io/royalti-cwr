import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { check, parse, SYNTH_IPIS } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { ipiBaseCheckDigit, ipiNameCheckDigits } from '../../src/rules/defs/identifiers';
import { ackBase, agrBase, clean, rec } from './support';
import type { Tx } from './support';

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

const ids = (t: Tx): string[] => t.run().problems.map(p => p.ruleId);
const only = (t: Tx, ruleIds: string[]): string[] =>
  t
    .run()
    .problems.filter(p => ruleIds.includes(p.ruleId))
    .map(p => p.ruleId);

/** Work 0 without publishers; the writers hold the given PR share (hundredths), MR and SR 100% so only PR is under test. */
function writersOnly(t: Tx, swrPr: string, owrPr: string): void {
  for (const type of ['PWR', 'OPU', 'SPT', 'SPU']) t.remove(t.find(type, 0));
  const w = t.find('SWR', 0);
  t.put(w, 'prOwnershipShare', swrPr);
  t.put(w, 'mrOwnershipShare', '10000');
  t.put(w, 'srOwnershipShare', '10000');
  const o = t.find('OWR', 0);
  t.put(o, 'prOwnershipShare', owrPr);
  t.fix();
}

describe('the spec’s tolerance of 0.06% (6 hundredths) is used exactly where the spec states it', () => {
  for (const version of VERSIONS) {
    it(`${version}: NWR-T-011 passes 99.94% to 100.06% and 0%, and stops 99.93% and 100.07%`, () => {
      for (const [pr, expected] of [['9994', 0], ['10006', 0], ['9993', 1], ['10007', 1]] as const) {
        const t = clean(version);
        writersOnly(t, pr, '0');
        expect(only(t, ['NWR-T-011']).length, pr).toBe(expected);
      }
      const t = clean(version);
      for (const type of ['PWR', 'OPU', 'SPT', 'SPU']) t.remove(t.find(type, 0));
      for (const type of ['SWR', 'OWR']) for (const id of ['prOwnershipShare', 'mrOwnershipShare', 'srOwnershipShare']) t.put(t.find(type, 0), id, '0');
      t.fix();
      expect(only(t, ['NWR-T-011']), 'a work claiming nothing totals 0%').toEqual([]);
    });

    it(`${version}: NWR-T-004 allows publishers 50.06% of PR and stops 50.07%`, () => {
      for (const [pr, expected] of [['5006', 0], ['5007', 1]] as const) {
        const t = clean(version);
        t.put(t.find('SPU', 0), 'prOwnershipShare', pr);
        t.put(t.find('SPT', 0), 'prCollectionShare', pr);
        t.put(t.find('OPU', 0), 'prOwnershipShare', '0');
        expect(only(t, ['NWR-T-004']).length, pr).toBe(expected);
      }
    });

    it(`${version}: NWR-T-009 wants writers at 0% or at least 49.94% of PR, and at most 100.06% of any right`, () => {
      const run = (swr: string, owr: string): string[] => {
        const t = clean(version);
        t.put(t.find('SWR', 0), 'prOwnershipShare', swr);
        t.put(t.find('OWR', 0), 'prOwnershipShare', owr);
        return only(t, ['NWR-T-009']);
      };
      expect(run('4994', '0')).toEqual([]);
      expect(run('4993', '0')).toEqual(['NWR-T-009']);
      expect(run('0', '0')).toEqual([]);
      expect(run('1', '0')).toEqual(['NWR-T-009']);
      expect(run('5003', '5003')).toEqual([]);
      expect(run('5004', '5003')).toEqual(['NWR-T-009']);
    });

    it(`${version}: territory sums allow 100.06% and stop 100.07% (NWR-T-014 in 2.1, NWR-T-044 in 2.2)`, () => {
      const rule = version === '2.1' ? 'NWR-T-014' : 'NWR-T-044';
      for (const [pr, expected] of [['7506', 0], ['7507', 1]] as const) {
        const t = clean(version);
        t.put(t.find('SWT', 0), 'prCollectionShare', pr); // plus the SPT's 25.00%
        expect(only(t, [rule]).length, pr).toBe(expected);
      }
    });

    it(`${version}: NWR-T-027 allows a difference of 0.06% between collection and ownership and stops 0.07%`, () => {
      for (const [pr, expected] of [['2506', 0], ['2494', 0], ['2507', 1], ['2493', 1]] as const) {
        const t = clean(version);
        t.put(t.find('SPT', 0), 'prCollectionShare', pr);
        expect(only(t, ['NWR-T-027']).length, pr).toBe(expected);
      }
    });
  }
});

describe('territories', () => {
  for (const version of VERSIONS) {
    const rule = version === '2.1' ? 'NWR-T-014' : 'NWR-T-044';

    it(`${version}: the spec’s example, world, an excluded home territory, an included home territory, adds up per territory`, () => {
      // SPT: world 25% PR; exclude the US (0840) with zero; include the US with 25% PR. SWT: world 25% PR. Nothing exceeds 100%.
      const t = clean(version);
      const spt = t.find('SPT', 0);
      const mk = (ind: string, tis: string, share: string, seq: string): string =>
        rec(version, 'SPT', { interestedPartyNumber: 'P00000001', prCollectionShare: share, mrCollectionShare: share === '0' ? '0' : '5000', srCollectionShare: share === '0' ? '0' : '5000', inclusionExclusionIndicator: ind, tisNumericCode: tis, sequenceNumber: seq });
      t.insertAfter(spt, mk('E', '0840', '0', '2'));
      t.insertAfter(spt + 1, mk('I', '0840', '2500', '3'));
      t.fix();
      expect(ids(t)).toEqual([]);
    });

    it(`${version}: a territory included at a higher share than the world one is summed per territory`, () => {
      const t = clean(version);
      const spt = t.find('SPT', 0);
      // Include the US with 80% of PR after the world 25%: in the US the SPT now gives 80% (the later record decides), plus the SWT's 25%.
      t.insertAfter(spt, rec(version, 'SPT', { interestedPartyNumber: 'P00000001', prCollectionShare: '4000', mrCollectionShare: '5000', srCollectionShare: '5000', inclusionExclusionIndicator: 'I', tisNumericCode: '0840', sharesChange: 'Y', sequenceNumber: '2' }));
      t.insertAfter(t.find('SWT', 0), rec(version, 'SWT', { interestedPartyNumber: 'W00000001', prCollectionShare: '7000', inclusionExclusionIndicator: 'I', tisNumericCode: '0840', sequenceNumber: '2' }));
      t.fix();
      expect(ids(t)).toEqual([rule]);
    });

    it(`${version}: a group other than World is noted and nothing is summed for the work`, () => {
      const t = clean(version);
      t.put(t.find('SWT', 0), 'prCollectionShare', '9000'); // would pass 100% with the SPT's 25%
      t.put(t.find('SPT', 0), 'tisNumericCode', '2110');
      const r = t.run();
      expect(r.problems.map(p => p.ruleId)).toEqual(['TIS-GRP']);
      expect(r.problems[0]).toMatchObject({ severity: 'info' });
      expect(r.problems[0]!.message).toContain('does not expand');
      expect(r.summary.problems).toBe(0);
    });

    it(`${version}: a four-digit code the TIS list does not have and numbered like a group is noted by LKP-TIS and not summed`, () => {
      const t = clean(version);
      t.put(t.find('SWT', 0), 'prCollectionShare', '9000');
      t.put(t.find('SPT', 0), 'tisNumericCode', '9999');
      expect(ids(t)).toEqual(['LKP-TIS']);
    });

    it(`${version}: a country code outside the saved list (Greenland, 0304) is summed as the country it is`, () => {
      const t = clean(version);
      const spt = t.find('SPT', 0);
      t.insertAfter(spt, rec(version, 'SPT', { interestedPartyNumber: 'P00000001', prCollectionShare: '2500', mrCollectionShare: '5000', srCollectionShare: '5000', inclusionExclusionIndicator: 'I', tisNumericCode: '0304', sharesChange: 'Y', sequenceNumber: '2' }));
      t.insertAfter(t.find('SWT', 0), rec(version, 'SWT', { interestedPartyNumber: 'W00000001', prCollectionShare: '8000', inclusionExclusionIndicator: 'I', tisNumericCode: '0304', sequenceNumber: '2' }));
      t.fix();
      expect(ids(t).sort()).toEqual([rule, 'LKP-TIS', 'LKP-TIS'].sort());
    });
  }
});

describe('SWR-R-002: when a PWR is needed', () => {
  for (const version of VERSIONS) {
    it(`${version}: an unpublished work (the writers hold 100% of every right) needs no PWR, and a right nobody claims does not count`, () => {
      const t = clean(version);
      for (const type of ['PWR', 'OPU', 'SPT', 'SPU']) t.remove(t.find(type, 0));
      const w = t.find('SWR', 0);
      for (const id of ['prOwnershipShare', 'mrOwnershipShare', 'srOwnershipShare']) t.put(w, id, '10000');
      t.put(t.find('OWR', 0), 'prOwnershipShare', '0');
      t.fix();
      expect(ids(t)).toEqual([]);
      // MR and SR claimed by nobody at all: still unpublished.
      t.put(w, 'mrOwnershipShare', '0');
      t.put(w, 'srOwnershipShare', '0');
      expect(ids(t)).toEqual([]);
    });

    it(`${version}: a published work needs a PWR after every SWR, and an OWR needs none`, () => {
      const t = clean(version);
      expect(ids(t)).toEqual([]); // SWR with PWR, OWR without
      t.remove(t.find('PWR', 0));
      t.fix();
      expect(ids(t)).toEqual(['SWR-R-002']);
    });
  }
});

describe('NWR-T-027 conditions', () => {
  for (const version of VERSIONS) {
    it(`${version}: Shares change Y on a territory record lifts the edit`, () => {
      const t = clean(version);
      const spt = t.find('SPT', 0);
      t.put(spt, 'prCollectionShare', '1000');
      expect(only(t, ['NWR-T-027'])).toEqual(['NWR-T-027']);
      t.put(spt, 'sharesChange', 'Y');
      expect(only(t, ['NWR-T-027'])).toEqual([]);
    });

    it(`${version}: an income participant (PA) in the work lifts the edit`, () => {
      const t = clean(version);
      t.put(t.find('SPT', 0), 'prCollectionShare', '1000');
      t.insertAfter(t.find('SPT', 0), rec(version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'PA', publisherType: 'PA' }));
      t.fix();
      expect(only(t, ['NWR-T-027'])).toEqual([]);
    });

    it(`${version}: a chain with no SPT record is not asked to match`, () => {
      const t = clean(version);
      t.remove(t.find('SPT', 0));
      t.fix();
      expect(only(t, ['NWR-T-027'])).toEqual([]);
    });

    it(`${version}: an EXC transaction is not asked about shares`, () => {
      const t = clean(version);
      t.put(t.find('SWR', 0), 'prOwnershipShare', '1');
      const nwr = t.find('NWR', 0);
      t.poke(nwr, 0, 'EXC');
      const found = ids(t);
      expect(found.filter(x => /^(NWR-T-0(04|09|11|14|25|26|27|44)|SWR-R-002)$/.test(x))).toEqual([]);
    });
  }
});

describe('shares that cannot be read are left to the rules about that field', () => {
  for (const version of VERSIONS) {
    it(`${version}: a share with a decimal point is reported once by its own rule (and FMT-N), and the totals are not guessed`, () => {
      const t = clean(version);
      t.put(t.find('SWR', 0), 'prOwnershipShare', '92.50');
      expect(ids(t).sort()).toEqual(['FMT-N', 'SWR-F-011']);
      const p = t.run().problems.find(x => x.ruleId === 'SWR-F-011')!;
      expect(p.message).toContain('implied');
      expect(p.message).toContain('09250');
    });

    it(`${version}: letters in a share are FMT-N's alone`, () => {
      const t = clean(version);
      t.put(t.find('SWR', 0), 'prOwnershipShare', '25A00');
      expect(ids(t)).toEqual(['FMT-N']);
    });

    it(`${version}: whole hundredths are the finest grid: 33.33% three ways totals 99.99% and passes`, () => {
      const t = clean(version);
      for (const type of ['PWR', 'OPU', 'SPT', 'SPU']) t.remove(t.find(type, 0));
      t.put(t.find('SWR', 0), 'prOwnershipShare', '3333');
      t.put(t.find('OWR', 0), 'prOwnershipShare', '6666');
      t.put(t.find('SWR', 0), 'mrOwnershipShare', '10000');
      t.put(t.find('SWR', 0), 'srOwnershipShare', '10000');
      t.fix();
      expect(ids(t)).toEqual([]); // 99.99% within the spec's 0.06%; unpublished
    });
  }
});

describe('publisher and writer links', () => {
  for (const version of VERSIONS) {
    it(`${version}: a record whose parent has no Interested Party # leaves the finding to the parent`, () => {
      const t = clean(version);
      t.put(t.find('SWR', 0), 'interestedPartyNumber', '');
      expect(ids(t)).toEqual(['SWR-F-001']);
    });

    it(`${version}: a PWR cut off before its fields is STR-LEN's alone`, () => {
      const t = clean(version);
      const pwr = t.find('PWR', 0);
      t.lines[pwr] = t.lines[pwr]!.slice(0, 30);
      expect(ids(t)).toEqual(['STR-LEN']);
    });

    it(`${version}: chains by position: a second E starts a chain, an administrator continues it`, () => {
      const t = clean(version);
      t.insertAfter(t.find('SPT', 0), rec(version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'ADMIN', publisherType: 'AM', publisherIpiNameNumber: SYNTH_IPIS[4]! }));
      t.insertAfter(t.find('SPU', 1), rec(version, 'SPT', { interestedPartyNumber: 'P00000009', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1', sharesChange: 'Y' }));
      t.fix();
      // The administrator's zero-share SPT is an included territory with zero shares: SPT-R-001, a warning.
      expect(t.run().problems.map(p => [p.ruleId, p.severity])).toEqual([['SPT-R-001', 'warning']]);
    });
  }
});

describe('more cases the mutation checks asked for', () => {
  for (const version of VERSIONS) {
    it(`${version}: a chain that starts with an income participant (PA) is a chain, and a PWR may point at it`, () => {
      const t = clean(version);
      t.put(t.find('OPU', 0), 'publisherSequenceNumber', '3');
      t.insertAfter(t.find('SPT', 0), rec(version, 'SPU', { publisherSequenceNumber: '2', interestedPartyNumber: 'P00000009', publisherName: 'INCOME', publisherType: 'PA' }));
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherIpNumber', 'P00000009');
      if (version === '2.2') t.put(pwr, 'publisherSequenceNumber', '2');
      t.fix();
      expect(only(t, ['SPU-R-002', 'SPU-F-001', 'SPU-R-005', 'PWR-F-001', 'PWR-F-007', 'PWR-F-012', 'NWR-T-025'])).toEqual([]);
    });

    it(`${version}: a decimal comma is a decimal point too`, () => {
      const t = clean(version);
      t.put(t.find('SWR', 0), 'prOwnershipShare', '25,00');
      expect(ids(t).sort()).toEqual(['FMT-N', 'SWR-F-011']);
    });

    it(`${version}: a record cut off before its share fields is STR-LEN's alone: its shares are unknown, not zero`, () => {
      const t = clean(version);
      const spu = t.find('SPU', 0);
      t.lines[spu] = t.lines[spu]!.slice(0, 100);
      const r = t.run();
      expect(r.problems.map(p => [p.ruleId, p.severity])).toEqual([['STR-LEN', 'warning']]);
    });

    it(`${version}: a territory record with no SPU or SWR in front of it adds nothing to a territory total`, () => {
      const t = clean(version);
      t.insertAfter(t.find('SWR', 0), rec(version, 'SPT', { interestedPartyNumber: 'P00000001', prCollectionShare: '9000', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      expect(only(t, ['NWR-T-014', 'NWR-T-044', 'NWR-T-027'])).toEqual([]);
    });
  }

  it('the IPI name check digits are 00 when the weighted sum leaves a remainder of 1 (not 100)', () => {
    let body = 0;
    for (; body < 100000; body++) {
      const s = String(body).padStart(9, '0');
      let total = 0;
      for (let i = 0; i < 9; i++) total += Number(s[i]) * (10 - i);
      if (total % 101 === 1) break;
    }
    expect(ipiNameCheckDigits(String(body).padStart(9, '0'))).toBe('00');
  });
});

describe('identifiers', () => {
  it('the IPI name number check digits match the server’s port on the synthetic IPIs and CISAC’s base number example', () => {
    for (const ipi of SYNTH_IPIS) expect(ipiNameCheckDigits(ipi.slice(0, 9)), ipi).toBe(ipi.slice(9));
    expect(ipiBaseCheckDigit('000000229')).toBe(7); // I-000000229-7, the example the server's port says it reproduces
  });

  for (const version of VERSIONS) {
    it(`${version}: a good IPI name number, a good base number, an unset (zero) IPI, a good ISWC and a 13-digit EAN raise nothing`, () => {
      const t = clean(version);
      const swr = t.find('SWR', 0);
      t.put(swr, 'writerIpiBaseNumber', 'I-000000229-7');
      t.put(t.find('OWR', 0), 'writerIpiNameNumber', '00000000000');
      t.put(t.find('NWR', 0), 'iswc', 'T0345246801');
      t.insertAfter(t.find('OWR', 0), rec(version, 'REC', { ean: '5012345678900' }));
      t.fix();
      expect(ids(t)).toEqual([]);
    });

    it(`${version}: the secondary-source rules mark their problems`, () => {
      const t = clean(version);
      t.put(t.find('SWR', 0), 'writerIpiNameNumber', '99900000100');
      t.put(t.find('SWR', 0), 'writerIpiBaseNumber', 'I-000000229-8');
      const r = t.run();
      const secondary = r.problems.filter(p => p.secondary === true).map(p => p.ruleId);
      expect([...secondary].sort()).toEqual(['ID-IPIB-CHK', 'ID-IPI-CHK'].sort());
      expect(r.problems.every(p => (p.secondary === true) === ['ID-IPIB-CHK', 'ID-IPI-CHK'].includes(p.ruleId))).toBe(true);
      expect(r.problems.every(p => p.severity === 'warning')).toBe(true);
      expect(r.problems[0]!.message).toContain('secondary source');
    });

    it(`${version}: a numeric Sender Type is checked as an IPI by a secondary rule, a sender code PB is not`, () => {
      const t = clean(version);
      expect(ids(t)).toEqual([]); // PB
      t.put(0, 'senderType', '99');
      t.put(0, 'senderId', '900000100');
      const r = t.run();
      expect(r.problems.map(p => p.ruleId)).toEqual(['HDR-F-SENDER-IPI']);
      expect(r.problems[0]!.secondary).toBe(true);
      t.put(0, 'senderId', SYNTH_IPIS[0]!.slice(2));
      expect(ids(t)).toEqual([]);
    });
  }
});

describe('versions', () => {
  it('2.2: HDR Revision 1 and 2 pass, 0 means not entered, 3 does not', () => {
    for (const [rev, expected] of [['1', 0], ['2', 0], ['0', 0], ['3', 1]] as const) {
      const t = clean('2.2');
      t.put(0, 'revision', rev);
      expect(only(t, ['HDR-F-016']).length, rev).toBe(expected);
    }
  });

  it('2.2: a blank HDR Version is not entered', () => {
    const t = clean('2.2');
    t.put(0, 'version', '');
    expect(ids(t)).toEqual([]);
  });

  it('a clean file of either version has no VER-002 note', () => {
    for (const v of VERSIONS) expect(only(clean(v), ['VER-002'])).toEqual([]);
  });

  it('2.1: a record with no layout in this version (an OPT) and a wrong sequence number is reported, not thrown on', () => {
    // Found while writing part 2: PFX-6 looked the Record Sequence # span up in the record's own layout, which an OPT does not have in 2.1.
    const t = clean('2.1');
    t.insertAfter(t.find('SPT', 0), rec('2.2', 'OPT', { interestedPartyNumber: 'P00000001' })); // prefix 0/0, no resequencing
    const r = t.run();
    const pfx = r.problems.filter(p => p.ruleId === 'PFX-6' && p.line === t.find('OPT'));
    expect(pfx).toHaveLength(1);
    expect(pfx[0]!.span).toEqual({ start: 11, end: 19 });
  });

  it('2.1: an OPT, an OWT or an XRF record is an unknown record type and VER-002 says the file looks like 2.2', () => {
    const t = clean('2.1');
    t.insertAfter(t.find('SPT', 0), rec('2.2', 'OPT', { interestedPartyNumber: 'P00000001' }));
    t.fix();
    const r = t.run();
    expect(r.problems.some(p => p.ruleId === 'STR-F-001')).toBe(true);
    const v = r.problems.find(p => p.ruleId === 'VER-002')!;
    expect(v.severity).toBe('warning');
    expect(v.message).toContain('an OPT record (a record type of CWR 2.2 only)');
    expect(v.message).toContain('check it again as 2.2');
  });

  it('2.2: an ACK may leave out the 2.2 fields (PWR Publisher Sequence #), a work in an NWR group may not', () => {
    const ack = ackBase('2.2');
    const pwr = ack.find('PWR', 0);
    ack.lines[pwr] = ack.lines[pwr]!.slice(0, 110);
    expect(ids(ack)).toEqual([]);
    const blank = ackBase('2.2');
    blank.put(blank.find('PWR', 0), 'publisherSequenceNumber', '');
    expect(ids(blank)).toEqual([]);

    const nwr = clean('2.2');
    const p = nwr.find('PWR', 0);
    nwr.lines[p] = nwr.lines[p]!.slice(0, 110);
    expect(ids(nwr)).toEqual(['STR-LEN']);
  });

  it('2.1: an ACK is not given that allowance for fields the layout has', () => {
    const ack = ackBase('2.1');
    const pwr = ack.find('PWR', 0);
    ack.lines[pwr] = ack.lines[pwr]!.slice(0, 100);
    expect(ids(ack)).toEqual(['STR-LEN']);
  });
});

describe('table-like fields that now have a lookup id', () => {
  for (const version of VERSIONS) {
    it(`${version}: Inclusion/Exclusion Indicator is I or E`, () => {
      const t = clean(version);
      const spt = t.find('SPT', 0);
      t.put(spt, 'inclusionExclusionIndicator', 'X');
      expect(only(t, ['LKP-TBL'])).toEqual(['LKP-TBL']);
      t.put(spt, 'inclusionExclusionIndicator', 'E');
      expect(only(t, ['LKP-TBL'])).toEqual([]);
    });

    it(`${version}: IPA Agreement Role Code is AS or AC`, () => {
      const t = agrBase(version);
      expect(only(t, ['LKP-TBL'])).toEqual([]);
      t.put(t.find('IPA', 0), 'agreementRoleCode', 'ZZ');
      expect(only(t, ['LKP-TBL'])).toEqual(['LKP-TBL']);
    });

    it(`${version}: ARI Type of Right accepts the table’s MEC, PER, SYN and the edit’s ALL`, () => {
      for (const [right, expected] of [['MEC', 0], ['PER', 0], ['SYN', 0], ['ALL', 0], ['XXX', 1]] as const) {
        const t = clean(version);
        t.insertAfter(t.find('OWR', 0), rec(version, 'ARI', { societyNumber: '021', workNumber: 'X', typeOfRight: right }));
        t.fix();
        expect(only(t, ['LKP-TBL']).length, right).toBe(expected);
      }
    });

    it(`${version}: REC Recording Technique is A, D or U, and a wrong one is a warning (FR)`, () => {
      const t = clean(version);
      t.insertAfter(t.find('OWR', 0), rec(version, 'REC', { recordingTechnique: 'X', firstAlbumTitle: 'X' }));
      t.fix();
      const p = t.run().problems.filter(x => x.ruleId === 'LKP-TBL');
      expect(p.map(x => x.severity)).toEqual(['warning']);
      expect(p[0]!.edit).toBe('REC-F-012');
    });

    it(`${version}: MSG Message Type and Message Level are checked`, () => {
      const t = ackBase(version);
      t.insertAfter(t.find('ACK', 0), rec(version, 'MSG', { messageType: 'Q', messageLevel: 'F', originalRecordType: 'NWR', validationNumber: '001', messageText: 'X' }));
      t.fix();
      expect(only(t, ['LKP-TBL'])).toEqual(['LKP-TBL']);
    });
  }

  it('2.2: XRF Identifier Type W, R, P and V pass the table (V is XRF-F-002’s warning); anything else is LKP-TBL’s', () => {
    for (const [type, expected] of [['W', []], ['R', []], ['P', []], ['V', ['XRF-F-002']], ['Q', ['LKP-TBL']]] as const) {
      const t = clean('2.2');
      t.insertAfter(t.find('OWR', 0), rec('2.2', 'XRF', { organisationCode: '021', identifier: 'X', identifierType: type, validity: 'Y' }));
      t.fix();
      expect(ids(t), type).toEqual(expected);
    }
  });
});

describe('property: whatever the shares, ids and records, check does not throw and every span lies inside its line', () => {
  const FIELDS: Array<[string, string, number]> = [
    ['SPU', 'prOwnershipShare', 5],
    ['SPU', 'mrOwnershipShare', 5],
    ['SPU', 'publisherSequenceNumber', 2],
    ['SPU', 'publisherType', 2],
    ['SPU', 'interestedPartyNumber', 9],
    ['SPT', 'prCollectionShare', 5],
    ['SPT', 'tisNumericCode', 4],
    ['SPT', 'inclusionExclusionIndicator', 1],
    ['SPT', 'sequenceNumber', 3],
    ['SWR', 'prOwnershipShare', 5],
    ['SWR', 'writerIpiNameNumber', 11],
    ['SWR', 'writerIpiBaseNumber', 13],
    ['SWT', 'prCollectionShare', 5],
    ['SWT', 'tisNumericCode', 4],
    ['SWT', 'interestedPartyNumber', 9],
    ['PWR', 'publisherIpNumber', 9],
    ['PWR', 'writerIpNumber', 9],
    ['OPU', 'prOwnershipShare', 5],
    ['OWR', 'prOwnershipShare', 5],
    ['NWR', 'iswc', 11],
  ];
  for (const version of VERSIONS) {
    it(`${version}: random changes to share, id and territory fields, and random record deletions`, () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              field: fc.integer({ min: 0, max: FIELDS.length - 1 }),
              work: fc.integer({ min: 0, max: 2 }),
              value: fc.stringMatching(/^[0-9A-Z .,-]{0,13}$/),
            }),
            { maxLength: 12 },
          ),
          fc.array(fc.integer({ min: 2, max: 25 }), { maxLength: 4 }),
          (changes, deletions) => {
            const t = clean(version);
            for (const c of changes) {
              const [type, id] = FIELDS[c.field]!;
              const line = t.find(type, c.work);
              const span = t.span(line, id);
              const cell = c.value.padEnd(span.end - span.start, ' ').slice(0, span.end - span.start);
              t.lines[line] = t.lines[line]!.slice(0, span.start) + cell + t.lines[line]!.slice(span.end);
            }
            for (const d of [...new Set(deletions)].sort((a, b) => b - a)) if (d < t.lines.length - 2) t.remove(d);
            const doc = parse(t.bytes(), { version });
            const r = check(doc);
            for (const p of r.problems) {
              if (p.line === -1) continue;
              expect(p.line).toBeGreaterThanOrEqual(0);
              expect(p.line).toBeLessThan(doc.lines.length);
              const len = doc.lines[p.line]!.text.length;
              if (p.span && !p.ghost) {
                expect(p.span.start).toBeGreaterThanOrEqual(0);
                expect(p.span.end).toBeGreaterThanOrEqual(p.span.start);
                expect(p.span.end).toBeLessThanOrEqual(len);
              }
              for (const rel of p.related ?? []) {
                expect(rel.line).toBeGreaterThanOrEqual(0);
                expect(rel.line).toBeLessThan(doc.lines.length);
                expect(rel.start).toBeGreaterThanOrEqual(0);
                expect(rel.end).toBeLessThanOrEqual(doc.lines[rel.line]!.text.length);
              }
              expect(p.message).not.toMatch(/\{\w+\}/); // every placeholder was filled
            }
          },
        ),
        { numRuns: 150 },
      );
    });
  }
});
