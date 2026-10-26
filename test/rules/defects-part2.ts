import type { CwrVersion } from '../../src/index';
import { SYNTH_IPIS } from '../../src/index';
import { rec } from './support';
import type { Hit, Tx } from './support';

/**
 * Planted defects for the rules of part 2 (shares, links, territories, identifiers, version rules). The format is the one in
 * defects.test.ts: a small synthetic file with one change, and the whole list of problems it must produce. Where a defect cannot
 * exist without a second finding (a work that loses its publishers also fails the PWR rule), the second finding is written out and
 * the plant says why.
 *
 * The base files are the same: `one` has three works of eight records each, lines 2 to 9 being work 0:
 *   NWR 2, SPU 3, SPT 4, OPU 5, SWR 6, SWT 7, PWR 8, OWR 9.
 * Work 0: SPU (E, seq 1) PR 25 MR 50 SR 50; SPT World 25/50/50; OPU (E, seq 2) 25/50/50; SWR PR 25; SWT World PR 25; PWR to the SPU; OWR PR 25.
 */

export interface Defect2 {
  rule: string;
  name: string;
  versions?: CwrVersion[];
  base?: 'one' | 'ack' | 'agr';
  plant(t: Tx): Hit[];
}

const V21: CwrVersion[] = ['2.1'];
const V22: CwrVersion[] = ['2.2'];

const hit = (rule: string, line: number, span: { start: number; end: number } | null, severity = 'error'): Hit => ({
  rule,
  severity,
  line,
  start: span ? span.start : null,
  end: span ? span.end : null,
});
const TYPE = { start: 0, end: 3 };
const onField = (rule: string, t: Tx, line: number, fieldId: string, severity = 'error'): Hit => hit(rule, line, t.span(line, fieldId), severity);
const title = (rule: string, t: Tx, severity = 'error'): Hit => {
  const nwr = t.find('NWR', 0);
  return hit(rule, nwr, t.span(nwr, 'workTitle'), severity);
};
/** The record-order rule of the version: companion of any defect that puts a record out of place. */
const order = (t: Tx, line: number): Hit => hit(t.version === '2.1' ? 'NWR-T-018' : 'NWR-T-043', line, TYPE);

/** Inserts a record after the nth record of `type` (nth 0 unless given) and returns the new record's line (before fix()). */
function insertAfterType(t: Tx, type: string, text: string, nth = 0): number {
  const at = t.find(type, nth);
  t.insertAfter(at, text);
  return at + 1;
}

/** Work 0 with no publishers: SPU, SPT, OPU and PWR removed, the writers holding the shares given as [PR, MR, SR]. */
function writersOnly(t: Tx, swr: [string, string, string], owr: [string, string, string]): void {
  for (const type of ['PWR', 'OPU', 'SPT', 'SPU']) t.remove(t.find(type, 0));
  const w = t.find('SWR', 0);
  t.put(w, 'prOwnershipShare', swr[0]);
  t.put(w, 'mrOwnershipShare', swr[1]);
  t.put(w, 'srOwnershipShare', swr[2]);
  const o = t.find('OWR', 0);
  t.put(o, 'prOwnershipShare', owr[0]);
  t.put(o, 'mrOwnershipShare', owr[1]);
  t.put(o, 'srOwnershipShare', owr[2]);
}

/** Work 0's original publisher gives its ownership to an acquirer: E has zero shares and no SPT; an AQ (preceded by `between`) holds 25/50/50. */
function ownershipToAcquirer(t: Tx, between: Array<Record<string, string>>, aqShares: [string, string, string] = ['2500', '5000', '5000']): void {
  const spu = t.find('SPU', 0);
  t.put(spu, 'prOwnershipShare', '0');
  t.put(spu, 'mrOwnershipShare', '0');
  t.put(spu, 'srOwnershipShare', '0');
  const spt = t.lines[t.find('SPT', 0)]!;
  t.remove(t.find('SPT', 0));
  let at = spu;
  for (const over of between) {
    t.insertAfter(at, rec(t.version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'X', ...over }));
    at++;
  }
  t.insertAfter(at, rec(t.version, 'SPU', {
    publisherSequenceNumber: '1',
    interestedPartyNumber: 'P00000010',
    publisherName: 'ACQUIRER',
    publisherType: 'AQ',
    publisherIpiNameNumber: SYNTH_IPIS[4]!, // followed by an SPT in 2.2 when it owns something: SPU-F-040 wants the IPI Name #
    prOwnershipShare: aqShares[0],
    mrOwnershipShare: aqShares[1],
    srOwnershipShare: aqShares[2],
  }));
  // The acquirer collects: the work's SPT moves to it (its Interested Party # is the SPU's), so the chain is not left without one.
  if (aqShares.some(x => x !== '0')) {
    t.insertAfter(at + 1, spt.slice(0, 19) + 'P00000010' + spt.slice(28));
  }
}

/** Makes work 0 a modification (MOD) with the arrangement and adaptation its edits ask for. */
function modification(t: Tx): void {
  const nwr = t.find('NWR', 0);
  t.put(nwr, 'versionType', 'MOD');
  t.put(nwr, 'musicArrangement', 'NEW');
  t.put(nwr, 'lyricAdaptation', 'NEW');
}

const IPI_GOOD = SYNTH_IPIS[3]!;
const IPI_BAD = IPI_GOOD.slice(0, 10) + String((Number(IPI_GOOD[10]) + 1) % 10);

export const DEFECTS2: Defect2[] = [
  // ------------------------------------------------------------------------------------------------ share totals
  {
    rule: 'NWR-T-004',
    name: 'publishers own 60% of PR (the writers 40%, so NWR-T-009 fires too; the totals still make 100%)',
    plant(t) {
      t.put(t.find('SPU', 0), 'prOwnershipShare', '3000');
      t.put(t.find('SPT', 0), 'prCollectionShare', '3000'); // keeps NWR-T-027 quiet
      t.put(t.find('OPU', 0), 'prOwnershipShare', '3000');
      t.put(t.find('SWR', 0), 'prOwnershipShare', '2000');
      t.put(t.find('OWR', 0), 'prOwnershipShare', '2000');
      return [title('NWR-T-004', t), title('NWR-T-009', t)];
    },
  },
  {
    rule: 'NWR-T-009',
    name: 'writers own 40% of PR (publishers 60%, so NWR-T-004 fires too)',
    plant(t) {
      t.put(t.find('SPU', 0), 'prOwnershipShare', '3000');
      t.put(t.find('SPT', 0), 'prCollectionShare', '3000');
      t.put(t.find('OPU', 0), 'prOwnershipShare', '3000');
      t.put(t.find('SWR', 0), 'prOwnershipShare', '2000');
      t.put(t.find('OWR', 0), 'prOwnershipShare', '2000');
      return [title('NWR-T-004', t), title('NWR-T-009', t)];
    },
  },
  {
    rule: 'NWR-T-011',
    name: 'defect (a): PR totals 70% on a work whose writers have no publisher (SWR-R-002 stays quiet: a PWR could not point anywhere)',
    plant(t) {
      writersOnly(t, ['3500', '0', '0'], ['3500', '0', '0']);
      t.fix();
      return [title('NWR-T-011', t)];
    },
  },
  {
    rule: 'NWR-T-011',
    name: 'defect (a): PR totals 92.50% on a work whose writers have no publisher (SWR-R-002 stays quiet)',
    plant(t) {
      writersOnly(t, ['4625', '0', '0'], ['4625', '0', '0']);
      t.fix();
      return [title('NWR-T-011', t)];
    },
  },
  {
    rule: 'NWR-T-011',
    name: 'defect (a): PR totals 92.50% again, with one writer holding it all (SWR-R-002 stays quiet)',
    plant(t) {
      writersOnly(t, ['9250', '0', '0'], ['0', '0', '0']);
      t.fix();
      return [title('NWR-T-011', t)];
    },
  },
  {
    rule: 'NWR-T-011',
    name: 'defect (b): MR and SR total 50% because the other publisher’s mechanical share was left at 0',
    plant(t) {
      const opu = t.find('OPU', 0);
      t.put(opu, 'mrOwnershipShare', '0');
      t.put(opu, 'srOwnershipShare', '0');
      return [title('NWR-T-011', t), title('NWR-T-011', t)];
    },
  },
  {
    rule: 'NWR-T-025',
    name: 'a controlled chain whose publisher owns nothing (the other publisher takes the shares)',
    plant(t) {
      const spu = t.find('SPU', 0);
      for (const id of ['prOwnershipShare', 'mrOwnershipShare', 'srOwnershipShare']) t.put(spu, id, '0');
      const opu = t.find('OPU', 0);
      t.put(opu, 'prOwnershipShare', '5000');
      t.put(opu, 'mrOwnershipShare', '10000');
      t.put(opu, 'srOwnershipShare', '10000');
      t.remove(t.find('SPT', 0));
      t.fix();
      return [hit('NWR-T-025', t.find('SPU', 0), TYPE)];
    },
  },
  {
    rule: 'NWR-T-026',
    name: 'an acquirer in the chain while the original publisher still owns (the acquirer has no share either, so SPU-R-008 fires)',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.insertAfter(spt, rec(t.version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000010', publisherName: 'ACQUIRER', publisherType: 'AQ' }));
      t.fix();
      const spu = t.find('SPU', 0);
      const aq = t.find('SPU', 1);
      return [
        onField('NWR-T-026', t, spu, 'prOwnershipShare'),
        onField('NWR-T-026', t, spu, 'mrOwnershipShare'),
        onField('NWR-T-026', t, spu, 'srOwnershipShare'),
        onField('SPU-R-008', t, aq, 'publisherType'),
      ];
    },
  },
  {
    rule: 'SPU-R-008',
    name: 'an acquirer with zero shares (the original publisher also owns nothing, so NWR-T-025 fires: the chain has no ownership)',
    plant(t) {
      const opu = t.find('OPU', 0);
      t.put(opu, 'prOwnershipShare', '5000');
      t.put(opu, 'mrOwnershipShare', '10000');
      t.put(opu, 'srOwnershipShare', '10000');
      ownershipToAcquirer(t, [], ['0', '0', '0']);
      t.fix();
      return [onField('SPU-R-008', t, t.find('SPU', 1), 'publisherType'), hit('NWR-T-025', t.find('SPU', 0), TYPE)];
    },
  },
  {
    rule: 'NWR-T-027',
    name: 'the SPT collects 20% of PR in the world, the original publisher owns 25%',
    plant(t) {
      t.put(t.find('SPT', 0), 'prCollectionShare', '2000');
      return [hit('NWR-T-027', t.find('SPU', 0), TYPE)];
    },
  },

  // ------------------------------------------------------------------------------------------------ share fields
  {
    rule: 'SPU-F-013',
    name: 'an SPU with 50.05% of PR (no SPT left, the other publisher 0, so the totals still hold; NWR-T-007 warns that the chain has no SPT)',
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'prOwnershipShare', '5005');
      t.put(t.find('OPU', 0), 'prOwnershipShare', '0');
      t.remove(t.find('SPT', 0));
      t.fix();
      return [onField('SPU-F-013', t, t.find('SPU', 0), 'prOwnershipShare'), hit('NWR-T-007', t.find('SPU', 0), TYPE, 'warning')];
    },
  },
  {
    rule: 'SPU-F-013',
    name: 'defect (d): an SPU share written with a decimal point, 25.00 (FMT-N fires too: the field must be digits)',
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'prOwnershipShare', '25.00');
      return [onField('SPU-F-013', t, spu, 'prOwnershipShare'), onField('FMT-N', t, spu, 'prOwnershipShare')];
    },
  },
  {
    rule: 'SPU-F-016',
    name: 'an SPU with 100.05% of MR (the other publisher 0)',
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'mrOwnershipShare', '10005');
      t.put(t.find('OPU', 0), 'mrOwnershipShare', '0');
      return [onField('SPU-F-016', t, spu, 'mrOwnershipShare')];
    },
  },
  {
    rule: 'SPU-F-018',
    name: 'an SPU with 100.05% of SR (the other publisher 0)',
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'srOwnershipShare', '10005');
      t.put(t.find('OPU', 0), 'srOwnershipShare', '0');
      return [onField('SPU-F-018', t, spu, 'srOwnershipShare')];
    },
  },
  {
    rule: 'SPU-F-019',
    name: 'an administrator (AM) with a PR ownership share of 1%',
    plant(t) {
      t.put(t.find('SPU', 0), 'prOwnershipShare', '2400');
      t.put(t.find('SPT', 0), 'prCollectionShare', '2400');
      const at = insertAfterType(t, 'SPT', rec(t.version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'ADMIN', publisherType: 'AM', prOwnershipShare: '100' }));
      t.fix();
      return [onField('SPU-F-019', t, at, 'prOwnershipShare')];
    },
  },
  {
    rule: 'SWR-F-011',
    name: 'a lone writer with 100.05% of PR and no publisher',
    plant(t) {
      writersOnly(t, ['10005', '10000', '10000'], ['0', '0', '0']);
      t.fix();
      return [onField('SWR-F-011', t, t.find('SWR', 0), 'prOwnershipShare')];
    },
  },
  {
    rule: 'SWR-F-011',
    name: 'defect (d): a writer share written as 92.5, with a decimal point (FMT-N fires too; the totals are left alone because the share cannot be read)',
    plant(t) {
      const swr = t.find('SWR', 0);
      t.put(swr, 'prOwnershipShare', '92.5');
      return [onField('SWR-F-011', t, swr, 'prOwnershipShare'), onField('FMT-N', t, swr, 'prOwnershipShare')];
    },
  },
  {
    rule: 'SWR-F-013',
    name: 'a lone writer with 100.05% of MR and no publisher',
    plant(t) {
      writersOnly(t, ['10000', '10005', '10000'], ['0', '0', '0']);
      t.fix();
      return [onField('SWR-F-013', t, t.find('SWR', 0), 'mrOwnershipShare')];
    },
  },
  {
    rule: 'SWR-F-015',
    name: 'a lone writer with 100.05% of SR and no publisher',
    plant(t) {
      writersOnly(t, ['10000', '10000', '10005'], ['0', '0', '0']);
      t.fix();
      return [onField('SWR-F-015', t, t.find('SWR', 0), 'srOwnershipShare')];
    },
  },
  {
    rule: 'SPT-F-006',
    name: 'an SPT with 50.05% of PR (NWR-T-027 fires too: it differs from the SPU’s ownership)',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.put(spt, 'prCollectionShare', '5005');
      return [onField('SPT-F-006', t, spt, 'prCollectionShare'), hit('NWR-T-027', t.find('SPU', 0), TYPE)];
    },
  },
  {
    rule: 'SPT-F-007',
    name: 'an SPT with 100.05% of MR',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.put(spt, 'mrCollectionShare', '10005');
      return [onField('SPT-F-007', t, spt, 'mrCollectionShare')];
    },
  },
  {
    rule: 'SPT-F-008',
    name: 'an SPT with 100.05% of SR',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.put(spt, 'srCollectionShare', '10005');
      return [onField('SPT-F-008', t, spt, 'srCollectionShare')];
    },
  },
  {
    rule: 'SWT-F-003',
    name: 'an SWT with 100.05% of PR (the territory total passes 100% too)',
    plant(t) {
      const swt = t.find('SWT', 0);
      t.put(swt, 'prCollectionShare', '10005');
      return [onField('SWT-F-003', t, swt, 'prCollectionShare'), title(t.version === '2.1' ? 'NWR-T-014' : 'NWR-T-044', t)];
    },
  },
  {
    rule: 'SWT-F-004',
    name: 'an SWT with 100.05% of MR (the territory total passes 100% too)',
    plant(t) {
      const swt = t.find('SWT', 0);
      t.put(swt, 'mrCollectionShare', '10005');
      return [onField('SWT-F-004', t, swt, 'mrCollectionShare'), title(t.version === '2.1' ? 'NWR-T-014' : 'NWR-T-044', t)];
    },
  },
  {
    rule: 'SWT-F-005',
    name: 'an SWT with 100.05% of SR (the territory total passes 100% too)',
    plant(t) {
      const swt = t.find('SWT', 0);
      t.put(swt, 'srCollectionShare', '10005');
      return [onField('SWT-F-005', t, swt, 'srCollectionShare'), title(t.version === '2.1' ? 'NWR-T-014' : 'NWR-T-044', t)];
    },
  },
  {
    rule: 'IPA-F-006',
    name: 'an IPA with a PR share of 100.05%',
    base: 'agr',
    plant(t) {
      const ipa = t.find('IPA', 0);
      t.put(ipa, 'prShare', '10005');
      return [onField('IPA-F-006', t, ipa, 'prShare')];
    },
  },
  {
    rule: 'IPA-F-008',
    name: 'an IPA with an MR share of 100.05%',
    base: 'agr',
    plant(t) {
      const ipa = t.find('IPA', 0);
      t.put(ipa, 'mrShare', '10005');
      return [onField('IPA-F-008', t, ipa, 'mrShare')];
    },
  },
  {
    rule: 'IPA-F-010',
    name: 'an IPA with an SR share of 100.05%',
    base: 'agr',
    plant(t) {
      const ipa = t.find('IPA', 0);
      t.put(ipa, 'srShare', '10005');
      return [onField('IPA-F-010', t, ipa, 'srShare')];
    },
  },

  // ------------------------------------------------------------------------------------------------ territories
  {
    rule: 'NWR-T-014',
    name: 'the SPT and SWT collect 105% of PR together in the world',
    versions: V21,
    plant(t) {
      t.put(t.find('SWT', 0), 'prCollectionShare', '8000');
      return [title('NWR-T-014', t)];
    },
  },
  {
    rule: 'NWR-T-044',
    name: 'the SPT and SWT collect 105% of PR together in the world',
    versions: V22,
    plant(t) {
      t.put(t.find('SWT', 0), 'prCollectionShare', '8000');
      return [title('NWR-T-044', t)];
    },
  },
  {
    rule: 'NWR-T-044',
    name: 'controlled collection of 50% of MR plus an OPT of 80% in one territory',
    versions: V22,
    plant(t) {
      t.insertAfter(t.find('OPU', 0), rec('2.2', 'OPT', { interestedPartyNumber: 'P00000005', mrCollectionShare: '8000', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      return [title('NWR-T-044', t)];
    },
  },
  {
    rule: 'SPT-R-001',
    name: 'an included territory with all three shares zero (sharesChange Y keeps NWR-T-027 out of it)',
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec(t.version, 'SPT', { interestedPartyNumber: 'P00000001', inclusionExclusionIndicator: 'I', tisNumericCode: '0840', sharesChange: 'Y', sequenceNumber: '2' }));
      t.fix();
      return [onField('SPT-R-001', t, at, 'inclusionExclusionIndicator', 'warning')];
    },
  },
  {
    rule: 'SWT-R-001',
    name: 'an included writer territory with all three shares zero',
    plant(t) {
      const at = insertAfterType(t, 'SWT', rec(t.version, 'SWT', { interestedPartyNumber: 'W00000001', inclusionExclusionIndicator: 'I', tisNumericCode: '0840', sequenceNumber: '2' }));
      t.fix();
      return [onField('SWT-R-001', t, at, 'inclusionExclusionIndicator')];
    },
  },
  {
    rule: 'SWT-R-003',
    name: 'an excluded writer territory with a PR share of 1% (a warning: FR)',
    plant(t) {
      const at = insertAfterType(t, 'SWT', rec(t.version, 'SWT', { interestedPartyNumber: 'W00000001', prCollectionShare: '100', inclusionExclusionIndicator: 'E', tisNumericCode: '0840', sequenceNumber: '2' }));
      t.fix();
      return [onField('SWT-R-003', t, at, 'inclusionExclusionIndicator', 'warning')];
    },
  },
  {
    rule: 'SPT-D-001',
    name: 'an excluded publisher territory with a PR share of 1% (a warning from the record description)',
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec(t.version, 'SPT', { interestedPartyNumber: 'P00000001', prCollectionShare: '100', inclusionExclusionIndicator: 'E', tisNumericCode: '0840', sequenceNumber: '2' }));
      t.fix();
      return [onField('SPT-D-001', t, at, 'inclusionExclusionIndicator', 'warning')];
    },
  },
  {
    rule: 'TIS-GRP',
    name: 'a group other than World (2110): noted, and the per-territory sums are not computed for the work',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.put(spt, 'tisNumericCode', '2110');
      return [onField('TIS-GRP', t, spt, 'tisNumericCode', 'info')];
    },
  },

  // ------------------------------------------------------------------------------------------------ chains
  {
    rule: 'SPU-F-001',
    name: 'the second chain is numbered 5, not 2',
    plant(t) {
      const opu = t.find('OPU', 0);
      t.put(opu, 'publisherSequenceNumber', '5');
      return [onField('SPU-F-001', t, opu, 'publisherSequenceNumber')];
    },
  },
  {
    rule: 'SPU-R-002',
    name: 'a chain that starts with a sub-publisher (SE) before the original publisher',
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'publisherSequenceNumber', '2');
      t.put(t.find('OPU', 0), 'publisherSequenceNumber', '3');
      if (t.version === '2.2') t.put(t.find('PWR', 0), 'publisherSequenceNumber', '2');
      t.insertAfter(t.find('NWR', 0), rec(t.version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'SUB', publisherType: 'SE' }));
      t.fix();
      return [onField('SPU-R-002', t, t.find('SPU', 0), 'publisherType')];
    },
  },
  {
    rule: 'SPU-R-005',
    name: 'an administrator in chain 1 numbered 5',
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec(t.version, 'SPU', { publisherSequenceNumber: '5', interestedPartyNumber: 'P00000009', publisherName: 'ADMIN', publisherType: 'AM' }));
      t.fix();
      return [onField('SPU-R-005', t, at, 'publisherSequenceNumber')];
    },
  },
  {
    rule: 'SPU-D-001',
    name: 'an administrator that carries chain 1’s number stands after chain 2 (a warning; it is counted in chain 1)',
    plant(t) {
      // Chain 2 is the base OPU turned into a controlled original publisher with its own SPT; the administrator follows it with number 1.
      const opu = t.find('OPU', 0);
      t.poke(opu, 0, 'SPU');
      t.insertAfter(opu, rec(t.version, 'SPT', { interestedPartyNumber: 'P00000005', prCollectionShare: '2500', mrCollectionShare: '5000', srCollectionShare: '5000', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      const at = insertAfterType(t, 'SPT', rec(t.version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'ADMIN', publisherType: 'AM' }), 1);
      t.fix();
      return [onField('SPU-D-001', t, at, 'publisherSequenceNumber', 'warning')];
    },
  },
  {
    rule: 'SPU-F-040',
    name: 'the SPU that is followed by an SPT has no IPI Name #',
    versions: V22,
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'publisherIpiNameNumber', '');
      return [onField('SPU-F-040', t, spu, 'publisherIpiNameNumber')];
    },
  },
  {
    rule: 'NWR-T-007',
    name: 'a controlled publisher that owns 25% of PR and has no SPT (a warning: the edit’s condition is read as ownership)',
    plant(t) {
      t.remove(t.find('SPT', 0));
      t.fix();
      return [hit('NWR-T-007', t.find('SPU', 0), TYPE, 'warning')];
    },
  },
  {
    rule: 'NWR-T-020',
    name: 'a controlled writer that owns 25% of PR and has no SWT (a warning: the edit’s condition is read as ownership)',
    plant(t) {
      t.remove(t.find('SWT', 0));
      t.fix();
      return [hit('NWR-T-020', t.find('SWR', 0), TYPE, 'warning')];
    },
  },
  {
    rule: 'AGR-T-005',
    name: 'the PR shares of the two IPA records total 90%',
    base: 'agr',
    plant(t) {
      const ipa = t.find('IPA', 0);
      t.put(ipa, 'prShare', '6000');
      t.put(ipa + 1, 'prShare', '3000');
      return [hit('AGR-T-005', t.find('AGR', 0), TYPE)];
    },
  },
  {
    rule: 'SPU-R-006',
    name: 'an SPU in a chain that an OPU opens (it is also out of order, so NWR-T-018 fires)',
    versions: V21,
    plant(t) {
      const at = insertAfterType(t, 'OPU', rec(t.version, 'SPU', { publisherSequenceNumber: '2', interestedPartyNumber: 'P00000009', publisherName: 'ADMIN', publisherType: 'AM' }));
      t.fix();
      return [hit('SPU-R-006', at, TYPE), order(t, t.find('OPU', 0))]; // of the two records out of order against each other, the earlier is reported
    },
  },
  {
    rule: 'SPU-R-007',
    name: 'an SPT after an OPU (SPT-F-001 and the record order fire too)',
    versions: V21,
    plant(t) {
      const at = insertAfterType(t, 'OPU', rec(t.version, 'SPT', { interestedPartyNumber: 'P00000005', mrCollectionShare: '1', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      return [hit('SPU-R-007', at, TYPE), hit('SPT-F-001', at, TYPE), order(t, t.find('OPU', 0))];
    },
  },
  {
    rule: 'NWR-T-016',
    name: 'an OPU administrator inside a chain that an SPU opens',
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec(t.version, 'OPU', { publisherSequenceNumber: '1', publisherName: 'ADMIN', publisherType: 'AM' }));
      t.fix();
      return [hit('NWR-T-016', at, TYPE)];
    },
  },
  {
    rule: 'NWR-T-017',
    name: 'a second original publisher with sequence 1 (SPU-F-001 fires, and the new chain owns nothing: NWR-T-025)',
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec(t.version, 'SPU', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000009', publisherName: 'SECOND', publisherType: 'E' }));
      t.fix();
      return [onField('NWR-T-017', t, at, 'publisherType'), onField('SPU-F-001', t, at, 'publisherSequenceNumber'), hit('NWR-T-025', at, TYPE)];
    },
  },
  {
    rule: 'SPU-F-032',
    name: 'an acquirer that follows an administrator, not an original publisher (the ownership moved to the acquirer, so nothing else fires)',
    plant(t) {
      ownershipToAcquirer(t, [{ publisherType: 'AM', publisherName: 'ADMIN', interestedPartyNumber: 'P00000011' }]);
      t.fix();
      return [onField('SPU-F-032', t, t.find('SPU', 2), 'publisherType')];
    },
  },
  {
    rule: 'SPU-F-008',
    name: 'an OPU whose Publisher Unknown Indicator is U (a warning: the edit allows Y or N)',
    plant(t) {
      const opu = t.find('OPU', 0);
      t.put(opu, 'publisherUnknownIndicator', 'U');
      return [onField('SPU-F-008', t, opu, 'publisherUnknownIndicator', 'warning')];
    },
  },
  {
    rule: 'SPU-F-009',
    name: 'an OPU marked unknown that still has a name (a warning)',
    plant(t) {
      const opu = t.find('OPU', 0);
      t.put(opu, 'publisherUnknownIndicator', 'Y');
      return [onField('SPU-F-009', t, opu, 'publisherName', 'warning')];
    },
  },
  {
    rule: 'SWR-F-005',
    name: 'an OWR whose Writer Unknown Indicator is U (a warning: the edit allows Y or N)',
    plant(t) {
      const owr = t.find('OWR', 0);
      t.put(owr, 'writerUnknownIndicator', 'U');
      return [onField('SWR-F-005', t, owr, 'writerUnknownIndicator', 'warning')];
    },
  },
  {
    rule: 'SWR-F-006',
    name: 'an OWR marked unknown that still has a last name (a warning)',
    plant(t) {
      const owr = t.find('OWR', 0);
      t.put(owr, 'writerUnknownIndicator', 'Y');
      return [onField('SWR-F-006', t, owr, 'writerLastName', 'warning')];
    },
  },

  // ------------------------------------------------------------------------------------------------ territory records and their parents
  {
    rule: 'SPT-F-001',
    name: 'an SPT after the SWR (the record order fires too, and the SWT behind it no longer follows an SWR)',
    plant(t) {
      const at = insertAfterType(t, 'SWR', rec(t.version, 'SPT', { interestedPartyNumber: 'P00000001', mrCollectionShare: '1', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      return [hit('SPT-F-001', at, TYPE), order(t, at), hit('SWT-F-001', at + 1, TYPE)];
    },
  },
  {
    rule: 'SPT-F-014',
    name: 'an OPT after the SWR (the record order fires too, and the SWT behind it no longer follows an SWR)',
    versions: V22,
    plant(t) {
      const at = insertAfterType(t, 'SWR', rec('2.2', 'OPT', { interestedPartyNumber: 'P00000001', mrCollectionShare: '1', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      return [hit('SPT-F-014', at, TYPE), order(t, at - 1), hit('SWT-F-001', at + 1, TYPE)];
    },
  },
  {
    rule: 'SPT-F-002',
    name: 'an SPT whose Interested Party # is not the SPU’s',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.put(spt, 'interestedPartyNumber', 'P99');
      return [onField('SPT-F-002', t, spt, 'interestedPartyNumber')];
    },
  },
  {
    rule: 'SPT-F-013',
    name: 'the first SPT numbered 2',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.put(spt, 'sequenceNumber', '2');
      return [onField('SPT-F-013', t, spt, 'sequenceNumber')];
    },
  },
  {
    rule: 'SWT-F-001',
    name: 'an SWT after the OWR (it belongs to an OWR; the record order fires too)',
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec(t.version, 'SWT', { interestedPartyNumber: 'W00000009', prCollectionShare: '1', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      return [hit('SWT-F-001', at, TYPE), order(t, at - 1)];
    },
  },
  {
    rule: 'SWT-F-011',
    name: 'an OWT that follows the SWR’s PWR',
    versions: V22,
    plant(t) {
      const at = insertAfterType(t, 'PWR', rec('2.2', 'OWT', { interestedPartyNumber: 'W00000001', prCollectionShare: '1', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '2' }));
      t.fix();
      return [hit('SWT-F-011', at, TYPE)];
    },
  },
  {
    rule: 'SWT-F-002',
    name: 'an SWT whose Interested Party # is not the SWR’s',
    plant(t) {
      const swt = t.find('SWT', 0);
      t.put(swt, 'interestedPartyNumber', 'W99');
      return [onField('SWT-F-002', t, swt, 'interestedPartyNumber')];
    },
  },
  {
    rule: 'SWT-F-013',
    name: 'an OWT whose Interested Party # is not the OWR’s',
    versions: V22,
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec('2.2', 'OWT', { interestedPartyNumber: 'W77', prCollectionShare: '1', inclusionExclusionIndicator: 'I', tisNumericCode: '2136', sequenceNumber: '1' }));
      t.fix();
      return [onField('SWT-F-013', t, at, 'interestedPartyNumber')];
    },
  },
  {
    rule: 'SWT-F-010',
    name: 'the first SWT numbered 3',
    plant(t) {
      const swt = t.find('SWT', 0);
      t.put(swt, 'sequenceNumber', '3');
      return [onField('SWT-F-010', t, swt, 'sequenceNumber')];
    },
  },
  {
    rule: 'NPN-R-001',
    name: 'an NPN after the SPT, not straight after its SPU',
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec(t.version, 'NPN', { publisherSequenceNumber: '1', interestedPartyNumber: 'P00000001' }));
      t.fix();
      return [hit('NPN-R-001', at, TYPE)];
    },
  },
  {
    rule: 'NPN-F-001',
    name: 'an NPN with Publisher Sequence # 5 under an SPU with 1',
    plant(t) {
      const at = insertAfterType(t, 'SPU', rec(t.version, 'NPN', { publisherSequenceNumber: '5', interestedPartyNumber: 'P00000001' }));
      t.fix();
      return [onField('NPN-F-001', t, at, 'publisherSequenceNumber')];
    },
  },
  {
    rule: 'NPN-F-002',
    name: 'an NPN whose Interested Party # is not its SPU’s',
    plant(t) {
      const at = insertAfterType(t, 'SPU', rec(t.version, 'NPN', { publisherSequenceNumber: '1', interestedPartyNumber: 'P99' }));
      t.fix();
      return [onField('NPN-F-002', t, at, 'interestedPartyNumber')];
    },
  },
  {
    rule: 'NWN-R-001',
    name: 'an NWN after the SWT, not straight after its SWR',
    plant(t) {
      const at = insertAfterType(t, 'SWT', rec(t.version, 'NWN', { interestedPartyNumber: 'W00000001' }));
      t.fix();
      return [hit('NWN-R-001', at, TYPE)];
    },
  },
  {
    rule: 'NWN-F-001',
    name: 'an NWN whose Interested Party # is not its SWR’s',
    plant(t) {
      const at = insertAfterType(t, 'SWR', rec(t.version, 'NWN', { interestedPartyNumber: 'W99' }));
      t.fix();
      return [onField('NWN-F-001', t, at, 'interestedPartyNumber')];
    },
  },

  // ------------------------------------------------------------------------------------------------ writers and PWR
  {
    rule: 'SWR-R-002',
    name: 'defect (c): a controlled writer with no PWR link to a publisher',
    plant(t) {
      t.remove(t.find('PWR', 0));
      t.fix();
      return [hit('SWR-R-002', t.find('SWR', 0), TYPE)];
    },
  },
  {
    rule: 'PWR-R-001',
    name: 'a PWR after an OWR',
    versions: V21,
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec('2.1', 'PWR', { publisherIpNumber: 'P00000001', publisherName: 'X', writerIpNumber: 'W00000009' }));
      t.fix();
      return [hit('PWR-R-001', at, TYPE)];
    },
  },
  {
    rule: 'PWR-R-002',
    name: 'a PWR straight after the SPT (the record order fires too)',
    versions: V21,
    plant(t) {
      const at = insertAfterType(t, 'SPT', rec('2.1', 'PWR', { publisherIpNumber: 'P00000001', publisherName: 'X', writerIpNumber: 'W00000001' }));
      t.fix();
      return [hit('PWR-R-002', at, TYPE), hit('NWR-T-018', at, TYPE)];
    },
  },
  {
    rule: 'PWR-F-001',
    name: 'a PWR whose Publisher IP # is no SPU’s',
    versions: V21,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherIpNumber', 'P99');
      return [onField('PWR-F-001', t, pwr, 'publisherIpNumber')];
    },
  },
  {
    rule: 'PWR-F-001',
    name: 'a PWR that points to an OPU, a publisher the submitter does not control',
    versions: V21,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherIpNumber', 'P00000005');
      return [onField('PWR-F-001', t, pwr, 'publisherIpNumber')];
    },
  },
  {
    rule: 'PWR-F-005',
    name: 'a PWR whose Writer IP # is not the SWR’s',
    versions: V21,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'writerIpNumber', 'W99');
      return [onField('PWR-F-005', t, pwr, 'writerIpNumber')];
    },
  },
  {
    rule: 'PWR-F-007',
    name: 'a PWR with Publisher Sequence # 5, which no chain has',
    versions: V22,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherSequenceNumber', '5');
      return [onField('PWR-F-007', t, pwr, 'publisherSequenceNumber')];
    },
  },
  {
    rule: 'PWR-F-008',
    name: 'a PWR after an SWR without a Writer IP #',
    versions: V22,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'writerIpNumber', '');
      return [onField('PWR-F-008', t, pwr, 'writerIpNumber')];
    },
  },
  {
    rule: 'PWR-F-009',
    name: 'a PWR after an SWR without a Publisher IP #',
    versions: V22,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherIpNumber', '');
      return [onField('PWR-F-009', t, pwr, 'publisherIpNumber')];
    },
  },
  {
    rule: 'PWR-F-010',
    name: 'a PWR after an SWR without a Publisher Name',
    versions: V22,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherName', '');
      return [onField('PWR-F-010', t, pwr, 'publisherName')];
    },
  },
  {
    rule: 'PWR-F-011',
    name: 'a PWR whose Writer IP # is not the preceding SWR’s',
    versions: V22,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'writerIpNumber', 'W99');
      return [onField('PWR-F-011', t, pwr, 'writerIpNumber')];
    },
  },
  {
    rule: 'PWR-F-012',
    name: 'a PWR whose Publisher IP # is not the one of the chain its sequence number names',
    versions: V22,
    plant(t) {
      const pwr = t.find('PWR', 0);
      t.put(pwr, 'publisherIpNumber', 'P99');
      return [onField('PWR-F-012', t, pwr, 'publisherIpNumber')];
    },
  },

  // ------------------------------------------------------------------------------------------------ identifiers
  {
    rule: 'ID-IPI-FMT',
    name: 'a writer IPI Name # of 5 digits (a warning: FR)',
    plant(t) {
      const swr = t.find('SWR', 0);
      t.put(swr, 'writerIpiNameNumber', 'ABC12');
      return [onField('ID-IPI-FMT', t, swr, 'writerIpiNameNumber', 'warning')];
    },
  },
  {
    rule: 'ID-IPI-CHK',
    name: 'a writer IPI Name # with the wrong check digits (secondary source, a warning)',
    plant(t) {
      const swr = t.find('SWR', 0);
      t.put(swr, 'writerIpiNameNumber', IPI_BAD);
      return [onField('ID-IPI-CHK', t, swr, 'writerIpiNameNumber', 'warning')];
    },
  },
  {
    rule: 'ID-IPIB-FMT',
    name: 'a writer IPI Base # that is not I-NNNNNNNNN-C (a warning)',
    plant(t) {
      const swr = t.find('SWR', 0);
      t.put(swr, 'writerIpiBaseNumber', 'I-12345-6');
      return [onField('ID-IPIB-FMT', t, swr, 'writerIpiBaseNumber', 'warning')];
    },
  },
  {
    rule: 'ID-IPIB-CHK',
    name: 'a writer IPI Base # with the wrong check digit (secondary source, a warning)',
    plant(t) {
      const swr = t.find('SWR', 0);
      t.put(swr, 'writerIpiBaseNumber', 'I-000000229-8');
      return [onField('ID-IPIB-CHK', t, swr, 'writerIpiBaseNumber', 'warning')];
    },
  },
  {
    rule: 'HDR-F-SENDER-IPI',
    name: 'a numeric Sender Type and Sender ID that read as an IPI with the wrong check digits (secondary source, a warning)',
    plant(t) {
      t.put(0, 'senderType', IPI_BAD.slice(0, 2));
      t.put(0, 'senderId', IPI_BAD.slice(2));
      return [hit('HDR-F-SENDER-IPI', 0, { start: 3, end: 14 }, 'warning')]; // Sender Type and Sender ID together
    },
  },
  {
    rule: 'NWR-F-004',
    name: 'an ISWC that is not T and ten digits (a warning)',
    plant(t) {
      const nwr = t.find('NWR', 0);
      t.put(nwr, 'iswc', 'T123');
      return [onField('NWR-F-004', t, nwr, 'iswc', 'warning')];
    },
  },
  {
    rule: 'EWT-F-002',
    name: 'an ISWC of Entire Work that is not T and ten digits (a warning)',
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec(t.version, 'EWT', { iswcOfEntireWork: 'T123' }));
      t.fix();
      return [onField('EWT-F-002', t, at, 'iswcOfEntireWork', 'warning')];
    },
  },
  {
    rule: 'VER-F-002',
    name: 'an ISWC of Original Work that is not T and ten digits (a warning)',
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec(t.version, 'VER', { iswcOfOriginalWork: 'T123' }));
      t.fix();
      return [onField('VER-F-002', t, at, 'iswcOfOriginalWork', 'warning')];
    },
  },
  {
    rule: 'COM-F-002',
    name: 'an ISWC of Component that is not T and ten digits (a warning)',
    plant(t) {
      const nwr = t.find('NWR', 0);
      t.put(nwr, 'compositeType', 'MED');
      t.put(nwr, 'compositeComponentCount', '2');
      const at = insertAfterType(t, 'OWR', rec(t.version, 'COM', { iswcOfComponent: 'T123' }));
      t.fix();
      return [onField('COM-F-002', t, at, 'iswcOfComponent', 'warning')];
    },
  },
  {
    rule: 'REC-F-009',
    name: 'an EAN of 3 digits (a warning)',
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec(t.version, 'REC', { ean: '123' }));
      t.fix();
      return [onField('REC-F-009', t, at, 'ean', 'warning')];
    },
  },

  // ------------------------------------------------------------------------------------------------ what a work must hold
  {
    rule: 'NWR-T-003',
    name: 'a SER work with no INS record',
    versions: V21,
    plant(t) {
      t.put(t.find('NWR', 0), 'musicalWorkDistributionCategory', 'SER');
      return [title('NWR-T-003', t)];
    },
  },
  {
    rule: 'NWR-T-053',
    name: 'a SER work with no INS or IND record',
    versions: V22,
    plant(t) {
      t.put(t.find('NWR', 0), 'musicalWorkDistributionCategory', 'SER');
      return [title('NWR-T-053', t)];
    },
  },
  {
    rule: 'NWR-T-010',
    name: 'a modification with no arranger, adapter, sub-arranger, sub-author or translator',
    plant(t) {
      modification(t);
      return [title('NWR-T-010', t)];
    },
  },
  {
    rule: 'NWR-T-015',
    name: 'a modification whose only writers are arrangers',
    plant(t) {
      modification(t);
      t.put(t.find('SWR', 0), 'writerDesignationCode', 'AR');
      t.put(t.find('OWR', 0), 'writerDesignationCode', 'AR');
      return [title('NWR-T-015', t)];
    },
  },
  {
    rule: 'NWR-T-023',
    name: 'an original work with an arranger',
    plant(t) {
      const swr = t.find('SWR', 0);
      t.put(swr, 'writerDesignationCode', 'AR');
      return [onField('NWR-T-023', t, swr, 'writerDesignationCode')];
    },
  },
  {
    rule: 'NWR-T-045',
    name: 'a music-only work whose two writers are CA',
    versions: V22,
    plant(t) {
      t.put(t.find('NWR', 0), 'textMusicRelationship', 'MUS');
      return [onField('NWR-T-045', t, t.find('SWR', 0), 'writerDesignationCode'), onField('NWR-T-045', t, t.find('OWR', 0), 'writerDesignationCode')];
    },
  },
  {
    rule: 'SWR-F-020',
    name: 'a modification where a creator has no share and the only arranger is an OWR',
    plant(t) {
      modification(t);
      const swr = t.find('SWR', 0);
      for (const id of ['prOwnershipShare', 'mrOwnershipShare', 'srOwnershipShare']) t.put(swr, id, '0');
      const owr = t.find('OWR', 0);
      t.put(owr, 'prOwnershipShare', '5000');
      t.put(owr, 'writerDesignationCode', 'AR');
      return [onField('SWR-F-020', t, swr, 'writerDesignationCode')];
    },
  },
  {
    rule: 'SPU-F-029',
    name: 'a publisher named ASCAP with no IPI Name # (in 2.2 SPU-F-040 asks for it too: the SPU is followed by an SPT)',
    plant(t) {
      const spu = t.find('SPU', 0);
      t.put(spu, 'publisherName', 'ASCAP');
      t.put(spu, 'publisherIpiNameNumber', '');
      // 2.2 only: the SPU is followed by an SPT, so SPU-F-040 wants its IPI Name # too.
      return [onField('SPU-F-029', t, spu, 'publisherIpiNameNumber'), ...(t.version === '2.2' ? [onField('SPU-F-040', t, spu, 'publisherIpiNameNumber')] : [])];
    },
  },
  {
    rule: 'NWR-F-003',
    name: 'two works with the same Submitter Work #',
    plant(t) {
      const first = t.find('NWR', 0);
      const second = t.find('NWR', 1);
      t.put(second, 'submitterWorkNumber', t.get(first, 'submitterWorkNumber').trim());
      return [onField('NWR-F-003', t, second, 'submitterWorkNumber')];
    },
  },

  // ------------------------------------------------------------------------------------------------ versions
  {
    rule: 'GRH-F-004',
    name: 'a GRH Version Number of 02.15',
    plant(t) {
      const grh = t.find('GRH', 0);
      t.put(grh, 'versionNumberForThisTransactionType', '02.15');
      return [onField('GRH-F-004', t, grh, 'versionNumberForThisTransactionType')];
    },
  },
  {
    rule: 'HDR-F-015',
    name: 'an HDR Version of 2.1 in a 2.2 file',
    versions: V22,
    plant(t) {
      t.put(0, 'version', '2.1');
      return [onField('HDR-F-015', t, 0, 'version')];
    },
  },
  {
    rule: 'HDR-F-016',
    name: 'an HDR Revision of 5 in a 2.2 file',
    versions: V22,
    plant(t) {
      t.put(0, 'revision', '5');
      return [onField('HDR-F-016', t, 0, 'revision')];
    },
  },
  {
    rule: 'VER-002',
    name: 'a file read as 2.1 whose HDR carries the 2.2 fields (STR-LEN reports the extra characters too)',
    versions: V21,
    plant(t) {
      const len = t.lines[0]!.length;
      t.lines[0] = t.lines[0] + '2.2' + '001' + 'ROYALTI CWR SYNTH'.padEnd(30) + '0.0.0'.padEnd(30);
      const grh = t.find('GRH', 0);
      return [
        { ...onField('VER-002', t, grh, 'versionNumberForThisTransactionType', 'warning') },
        hit('STR-LEN', 0, { start: len, end: t.lines[0]!.length }),
      ];
    },
  },
  {
    rule: 'VER-002',
    name: 'a file read as 2.2 with a 2.1 HDR and 2.1 PWR records (STR-LEN reports the cut records too)',
    versions: V22,
    plant(t) {
      const out: Hit[] = [];
      const hdrLen = t.lines[0]!.length;
      t.lines[0] = t.lines[0]!.slice(0, 101);
      for (let i = 0; i < t.lines.length; i++) {
        if (t.lines[i]!.startsWith('PWR')) {
          out.push(hit('STR-LEN', i, { start: 110, end: 112 }));
          t.lines[i] = t.lines[i]!.slice(0, 110);
        }
      }
      out.push(hit('STR-LEN', 0, { start: 101, end: hdrLen }, 'warning'));
      out.push(onField('VER-002', t, t.find('GRH', 0), 'versionNumberForThisTransactionType', 'warning'));
      return out;
    },
  },
  {
    rule: 'XRF-F-002',
    name: 'an XRF with Identifier Type V (a warning: the field text lists it, the edit does not)',
    versions: V22,
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec('2.2', 'XRF', { organisationCode: '021', identifier: 'X', identifierType: 'V', validity: 'Y' }));
      t.fix();
      return [onField('XRF-F-002', t, at, 'identifierType', 'warning')];
    },
  },
  {
    rule: 'VER-005',
    name: 'an ORN with characters in the reserved filler (a warning)',
    versions: V22,
    plant(t) {
      const at = insertAfterType(t, 'OWR', rec('2.2', 'ORN', { productionTitle: 'X' }));
      t.fix();
      t.poke(at, 162, '2');
      return [onField('VER-005', t, at, 'filler', 'warning')];
    },
  },
];
