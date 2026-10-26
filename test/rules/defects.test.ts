import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, parse, check } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { ackBase, agrBase, clean, cleanTwoGroups, hitsOf, rec } from './support';
import type { Tx } from './support';
import type { Hit } from './support';
import { DEFECTS2 } from './defects-part2';

/**
 * One planted defect per rule: a small synthetic file from src/synth with one change, and the exact list
 * of problems it must produce. The list is the whole answer: the rule under test at the planted place, and
 * nothing else. Where a defect cannot exist without a second finding (an unknown first record is also an
 * unknown record type) the second finding is written out in the list and explained.
 *
 * Base files (all three are clean: zero problems, see baseline.test.ts):
 *   one   3 works in one NWR group, with OPU and OWR. Lines: 0 HDR, 1 GRH, 2-9 work 0, 10-17 work 1, 18-25 work 2, 26 GRT, 27 TRL.
 *   two   the same, as an NWR group (works 0, 1) and a REV group (work 2).
 *   ack   an ACK with the NWR it answers and an EXC that continues it.
 *   agr   an AGR with one TER and an assignor and an acquirer IPA.
 */

type Base = 'one' | 'two' | 'ack' | 'agr';

interface Defect {
  rule: string;
  name: string;
  versions?: CwrVersion[];
  base?: Base;
  plant(t: Tx): Hit[];
}

const BOTH: CwrVersion[] = ['2.1', '2.2'];

function makeBase(version: CwrVersion, base: Base): Tx {
  switch (base) {
    case 'one':
      return clean(version);
    case 'two':
      return cleanTwoGroups(version);
    case 'ack':
      return ackBase(version);
    case 'agr':
      return agrBase(version);
  }
}

const hit = (rule: string, line: number, span: { start: number; end: number } | null, severity = 'error'): Hit => ({
  rule,
  severity,
  line,
  start: span ? span.start : null,
  end: span ? span.end : null,
});
const TYPE = { start: 0, end: 3 };

/** A hit on one field of one line. */
const onField = (rule: string, t: Tx, line: number, fieldId: string): Hit => hit(rule, line, t.span(line, fieldId));
const warn = (h: Hit): Hit => ({ ...h, severity: 'warning' });
const note = (h: Hit): Hit => ({ ...h, severity: 'info' });

const DEFECTS: Defect[] = [
  // Part 2 (shares, links, territories, identifiers, versions) lives in defects-part2.ts.
  ...DEFECTS2,
  // ---------------------------------------------------------------- encoding
  {
    rule: 'ENC-001',
    name: 'one line ends with LF only',
    plant(t) {
      t.eols[5] = '\n';
      return [warn(hit('ENC-001', 5, { start: t.lines[5]!.length, end: t.lines[5]!.length }))];
    },
  },
  {
    rule: 'ENC-002',
    name: 'a character above ASCII with no character set in the HDR',
    plant(t) {
      const line = t.find('NWR', 1);
      const span = t.span(line, 'workTitle');
      t.poke(line, span.start, 'É');
      return [hit('ENC-002', line, { start: span.start, end: span.start + 1 })];
    },
  },
  {
    rule: 'ENC-003',
    name: 'a blank line',
    plant(t) {
      t.insertAfter(3, '');
      return [note(hit('ENC-003', 4, { start: 0, end: 0 }))];
    },
  },

  {
    rule: 'ENC-004',
    name: 'a NUL character in a title',
    plant(t) {
      const line = t.find('NWR', 1);
      const span = t.span(line, 'workTitle');
      t.poke(line, span.start + 2, '\u0000');
      return [hit('ENC-004', line, { start: span.start + 2, end: span.start + 3 })];
    },
  },

  // ---------------------------------------------------------------- file, group and transaction structure
  {
    rule: 'STR-F-001',
    name: 'a record type that is not one of the spec’s (an extra record after the SPT, so the SPU keeps its territory record)',
    plant(t) {
      const spt = t.find('SPT', 0);
      t.insertAfter(spt, 'XYZ' + t.lines[spt]!.slice(3));
      t.fix();
      return [hit('STR-F-001', spt + 1, TYPE)];
    },
  },
  {
    rule: 'HDR-1',
    name: 'the first record is not HDR (it is not a record type at all, so STR-F-001 also fires)',
    plant(t) {
      t.poke(0, 0, 'XXX');
      return [hit('HDR-1', 0, TYPE), hit('STR-F-001', 0, TYPE)];
    },
  },
  {
    rule: 'HDR-2',
    name: 'the second record is not GRH',
    plant(t) {
      t.remove(1).recount();
      return [hit('HDR-2', 1, TYPE)];
    },
  },
  {
    rule: 'TRL-1',
    name: 'the last record is not TRL',
    plant(t) {
      t.remove(t.lines.length - 1);
      return [hit('TRL-1', t.lines.length - 1, TYPE)];
    },
  },
  {
    rule: 'FILE-8',
    name: 'a second TRL',
    plant(t) {
      t.insertAfter(t.lines.length - 1, t.lines[t.lines.length - 1]!);
      return [hit('FILE-8', t.lines.length - 1, TYPE)];
    },
  },
  {
    rule: 'FILE-4',
    name: 'the second GRH does not follow a GRT',
    base: 'two',
    plant(t) {
      t.remove(t.find('GRT', 0)).recount();
      return [hit('FILE-4', t.find('GRH', 1), TYPE)];
    },
  },
  {
    rule: 'FILE-6',
    name: 'a detail record straight after the GRH',
    plant(t) {
      t.insertAfter(1, rec(t.version, 'MSG')).recount();
      return [hit('FILE-6', 2, TYPE)];
    },
  },
  {
    rule: 'FILE-7',
    name: 'a detail record straight after the GRT',
    plant(t) {
      t.insertAfter(t.find('GRT'), rec(t.version, 'MSG')).recount();
      return [hit('FILE-7', t.find('GRT') + 1, TYPE)];
    },
  },
  {
    rule: 'GRH-F-002',
    name: 'the second group is numbered 5',
    base: 'two',
    plant(t) {
      const grh = t.find('GRH', 1);
      t.put(grh, 'groupId', '5');
      t.put(t.find('GRT', 1), 'groupId', '5');
      return [onField('GRH-F-002', t, grh, 'groupId')];
    },
  },
  {
    rule: 'GRH-F-005',
    name: 'two groups of the same transaction type',
    base: 'two',
    plant(t) {
      const grh = t.find('GRH', 1);
      t.poke(grh, 3, 'NWR');
      t.poke(t.find('REV'), 0, 'NWR');
      return [onField('GRH-F-005', t, grh, 'transactionType')];
    },
  },
  {
    rule: 'GRT-F-001',
    name: 'the GRT names another group',
    base: 'two',
    plant(t) {
      const grt = t.find('GRT', 0);
      t.put(grt, 'groupId', '9');
      return [onField('GRT-F-001', t, grt, 'groupId')];
    },
  },
  {
    rule: 'GRT-F-002',
    name: 'the GRT transaction count is one too many',
    plant(t) {
      const grt = t.find('GRT');
      t.put(grt, 'transactionCount', String(Number(t.get(grt, 'transactionCount')) + 1));
      return [onField('GRT-F-002', t, grt, 'transactionCount')];
    },
  },
  {
    rule: 'GRT-F-003',
    name: 'the GRT record count is one too many',
    plant(t) {
      const grt = t.find('GRT');
      t.put(grt, 'recordCount', String(Number(t.get(grt, 'recordCount')) + 1));
      return [onField('GRT-F-003', t, grt, 'recordCount')];
    },
  },
  {
    rule: 'TRL-F-001',
    name: 'the TRL group count is one too many',
    plant(t) {
      const trl = t.find('TRL');
      t.put(trl, 'groupCount', String(Number(t.get(trl, 'groupCount')) + 1));
      return [onField('TRL-F-001', t, trl, 'groupCount')];
    },
  },
  {
    rule: 'TRL-F-002',
    name: 'the TRL transaction count is one too many',
    plant(t) {
      const trl = t.find('TRL');
      t.put(trl, 'transactionCount', String(Number(t.get(trl, 'transactionCount')) + 1));
      return [onField('TRL-F-002', t, trl, 'transactionCount')];
    },
  },
  {
    rule: 'TRL-F-003',
    name: 'the TRL record count is one too many',
    plant(t) {
      const trl = t.find('TRL');
      t.put(trl, 'recordCount', String(Number(t.get(trl, 'recordCount')) + 1));
      return [onField('TRL-F-003', t, trl, 'recordCount')];
    },
  },
  {
    rule: 'NWR-T-022',
    name: 'an NWR in a group whose header says REV',
    base: 'two',
    plant(t) {
      const line = t.find('REV');
      t.poke(line, 0, 'NWR');
      return [hit('NWR-T-022', line, TYPE)];
    },
  },
  {
    rule: 'NWR-T-008',
    name: 'a TER record inside a work',
    plant(t) {
      t.insertAfter(t.find('PWR', 0), rec(t.version, 'TER')).fix();
      return [hit('NWR-T-008', t.find('TER'), TYPE)];
    },
  },
  {
    rule: 'NWR-T-012',
    name: 'a work with no writer',
    plant(t) {
      const swr = t.find('SWR', 0);
      for (let i = 0; i < 3; i++) t.remove(swr); // SWR, SWT, PWR
      t.remove(t.find('OWR', 0)).fix();
      const nwr = t.find('NWR', 0);
      // Companion: with no writer left, the publishers' PR shares alone total 50%, so NWR-T-011 also fires (PR only; MR and SR are 100% from the publishers).
      return [hit('NWR-T-012', nwr, t.span(nwr, 'workTitle')), hit('NWR-T-011', nwr, t.span(nwr, 'workTitle'))];
    },
  },
  {
    rule: 'EWT-R-001',
    name: 'two EWT records in one work',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'EWT')).insertAfter(t.find('EWT'), rec(t.version, 'EWT')).fix();
      return [hit('EWT-R-001', t.find('EWT', 1), TYPE)];
    },
  },
  {
    rule: 'VER-R-001',
    name: 'two VER records in one work',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'VER')).insertAfter(t.find('VER'), rec(t.version, 'VER')).fix();
      return [hit('VER-R-001', t.find('VER', 1), TYPE)];
    },
  },
  {
    rule: 'IND-R-001',
    name: 'an IND with no INS before it',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'IND')).fix();
      return [hit('IND-R-001', t.find('IND'), TYPE)];
    },
  },
  {
    rule: 'COM-R-001',
    name: 'a COM in a work with no Composite Type',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'COM')).fix();
      return [hit('COM-R-001', t.find('COM'), TYPE)];
    },
  },
  {
    rule: 'NWR-T-018',
    name: 'an ALT before the publishers',
    versions: ['2.1'],
    plant(t) {
      t.insertAfter(2, rec(t.version, 'ALT', { titleType: 'AT' })).fix();
      return [hit('NWR-T-018', 3, TYPE)];
    },
  },
  {
    rule: 'NWR-T-043',
    name: 'an ALT before the publishers',
    versions: ['2.2'],
    plant(t) {
      t.insertAfter(2, rec(t.version, 'ALT', { titleType: 'AT' })).fix();
      return [hit('NWR-T-043', 3, TYPE)];
    },
  },
  {
    rule: 'ACK-T-002',
    name: 'an ACK with nothing after it',
    base: 'ack',
    plant(t) {
      while (t.lines[3]!.slice(0, 3) !== 'GRT') t.remove(3);
      t.fix();
      return [hit('ACK-T-002', 2, TYPE)];
    },
  },
  {
    rule: 'ACK-T-003',
    name: 'an EXC after an ACK that carries an AGR',
    base: 'ack',
    plant(t) {
      // ACK, AGR (inner), EXC as a transaction of its own with the next Transaction Sequence #.
      const exc = rec(t.version, 'EXC', {}, 1, 0);
      while (t.lines[3]!.slice(0, 3) !== 'GRT') t.remove(3);
      t.poke(2, t.span(2, 'originalTransactionType').start, 'AGR');
      t.lines.splice(3, 0, rec(t.version, 'AGR', { agreementType: 'OS', numberOfWorks: '1' }, 0, 1), exc);
      t.eols.splice(3, 0, '\r\n', '\r\n');
      t.recount();
      return [hit('ACK-T-003', 4, TYPE)];
    },
  },
  {
    rule: 'AGR-T-002',
    name: 'an AGR with no TER',
    base: 'agr',
    plant(t) {
      t.remove(t.find('TER')).fix();
      return [hit('AGR-T-002', 2, TYPE)];
    },
  },
  {
    rule: 'AGR-T-003',
    name: 'an AGR with two assignors and no acquirer',
    base: 'agr',
    plant(t) {
      t.put(t.find('IPA', 1), 'agreementRoleCode', 'AS');
      return [hit('AGR-T-003', 2, TYPE)];
    },
  },

  // ---------------------------------------------------------------- record prefix
  {
    rule: 'PFX-2',
    name: 'the first transaction of a group has Transaction Sequence # 5',
    base: 'two',
    plant(t) {
      const first = t.find('REV');
      for (let i = first; i < t.find('GRT', 1); i++) t.poke(i, 3, '00000005');
      return [onField('PFX-2', t, first, 'transactionSequence')];
    },
  },
  {
    rule: 'PFX-3',
    name: 'one transaction out of sequence',
    plant(t) {
      const first = t.find('NWR', 1);
      for (let i = first; i < t.find('NWR', 2); i++) t.poke(i, 3, '00000005');
      return [onField('PFX-3', t, first, 'transactionSequence')];
    },
  },
  {
    rule: 'PFX-4',
    name: 'one detail record with another transaction’s number',
    plant(t) {
      const line = t.find('SPT', 0);
      t.poke(line, 3, '00000009');
      return [onField('PFX-4', t, line, 'transactionSequence')];
    },
  },
  {
    rule: 'PFX-5',
    name: 'a transaction header whose Record Sequence # is not 0',
    plant(t) {
      const line = t.find('NWR', 1);
      t.poke(line, 11, '00000003');
      return [onField('PFX-5', t, line, 'recordSequence')];
    },
  },
  {
    rule: 'PFX-6',
    name: 'one detail record out of record sequence',
    plant(t) {
      const line = t.find('SWR', 0);
      t.poke(line, 11, '00000020');
      return [onField('PFX-6', t, line, 'recordSequence')];
    },
  },

  // ---------------------------------------------------------------- length
  {
    rule: 'STR-LEN',
    name: 'a record longer than its layout',
    plant(t) {
      const line = t.find('SWT', 0);
      const len = t.lines[line]!.length;
      t.lines[line] += 'X';
      return [hit('STR-LEN', line, { start: len, end: len + 1 })];
    },
  },
  {
    rule: 'STR-LEN',
    name: 'a record cut inside a mandatory field',
    plant(t) {
      const line = t.find('PWR', 0);
      const len = t.lines[line]!.length;
      t.lines[line] = t.lines[line]!.slice(0, 100);
      return [hit('STR-LEN', line, { start: 100, end: len })];
    },
  },
  {
    rule: 'STR-LEN',
    name: 'a record with only optional fields cut (a warning)',
    plant(t) {
      const line = t.find('SPU', 0);
      const len = t.lines[line]!.length;
      t.lines[line] = t.lines[line]!.slice(0, 138);
      return [warn(hit('STR-LEN', line, { start: 138, end: len }))];
    },
  },

  // ---------------------------------------------------------------- field format
  {
    rule: 'FMT-M',
    name: 'a blank mandatory field',
    plant(t) {
      const line = t.find('NWR', 0);
      const span = t.put(line, 'workTitle', '');
      return [hit('FMT-M', line, span)];
    },
  },
  {
    rule: 'FMT-N',
    name: 'letters in a numeric field',
    plant(t) {
      const line = t.find('SPU', 0);
      const span = t.put(line, 'publisherSequenceNumber', '1X');
      return [hit('FMT-N', line, span)];
    },
  },
  {
    rule: 'FMT-Z',
    name: 'a blank numeric field (a warning)',
    plant(t) {
      const line = t.find('SWR', 0);
      const span = t.put(line, 'personalNumber', '');
      return [warn(hit('FMT-Z', line, span))];
    },
  },
  {
    rule: 'FMT-D',
    name: 'a date in month 13',
    plant(t) {
      const span = t.put(0, 'creationDate', '20261340');
      return [hit('FMT-D', 0, span)];
    },
  },
  {
    rule: 'FMT-D',
    name: 'a bad copyright date, where the spec says the field is defaulted (FR, a warning)',
    plant(t) {
      const line = t.find('NWR', 0);
      const span = t.put(line, 'copyrightDate', '20260230');
      return [warn(hit('FMT-D', line, span))];
    },
  },
  {
    rule: 'FMT-T',
    name: 'hour 24 in a time of day',
    plant(t) {
      const span = t.put(0, 'creationTime', '246000');
      return [hit('FMT-T', 0, span)];
    },
  },
  {
    rule: 'FMT-T',
    name: 'seconds above 59 in a duration, where the spec says the field is defaulted (FR, a warning)',
    plant(t) {
      const line = t.find('NWR', 0);
      const span = t.put(line, 'duration', '000099');
      return [warn(hit('FMT-T', line, span))];
    },
  },
  {
    rule: 'FMT-B',
    name: 'X in a Y/N field (FR, a warning)',
    plant(t) {
      const line = t.find('SPT', 0);
      const span = t.put(line, 'sharesChange', 'X');
      return [warn(hit('FMT-B', line, span))];
    },
  },
  {
    rule: 'FMT-F',
    name: 'Q in a Y/N/U flag',
    plant(t) {
      const line = t.find('NWR', 0);
      const span = t.put(line, 'exceptionalClause', 'Q');
      return [hit('FMT-F', line, span)];
    },
  },
  {
    rule: 'FMT-UC',
    name: 'lower case in an alphabetic field',
    plant(t) {
      const line = t.find('NWR', 0);
      const span = t.put(line, 'workTitle', 'Amber Harbour');
      return [hit('FMT-UC', line, span)];
    },
  },

  // ---------------------------------------------------------------- conditional requirements
  {
    rule: 'HDR-F-002',
    name: 'Sender Type XX',
    plant(t) {
      const span = t.put(0, 'senderType', 'XX');
      return [hit('HDR-F-002', 0, span)];
    },
  },
  {
    rule: 'HDR-F-009',
    name: 'EDI Standard Version Number 01.20',
    plant(t) {
      const span = t.put(0, 'ediStandardVersionNumber', '01.20');
      return [hit('HDR-F-009', 0, span)];
    },
  },
  {
    rule: 'SPU-F-002',
    name: 'an SPU with no Interested Party #',
    plant(t) {
      const line = t.find('SPU', 0);
      return [hit('SPU-F-002', line, t.put(line, 'interestedPartyNumber', ''))];
    },
  },
  {
    rule: 'SPU-F-004',
    name: 'an SPU with no Publisher Name',
    plant(t) {
      const line = t.find('SPU', 0);
      return [hit('SPU-F-004', line, t.put(line, 'publisherName', ''))];
    },
  },
  {
    rule: 'SPU-F-005',
    name: 'an SPU with no Publisher Type',
    plant(t) {
      const line = t.find('SPU', 0);
      return [hit('SPU-F-005', line, t.put(line, 'publisherType', ''))];
    },
  },
  {
    rule: 'SPU-F-007',
    name: 'an SPU with Publisher Unknown Indicator Y',
    plant(t) {
      const line = t.find('SPU', 0);
      return [hit('SPU-F-007', line, t.put(line, 'publisherUnknownIndicator', 'Y'))];
    },
  },
  {
    rule: 'SWR-F-001',
    name: 'an SWR with no Interested Party #',
    plant(t) {
      const line = t.find('SWR', 0);
      return [hit('SWR-F-001', line, t.put(line, 'interestedPartyNumber', ''))];
    },
  },
  {
    rule: 'SWR-F-003',
    name: 'an SWR with no Writer Last Name',
    plant(t) {
      const line = t.find('SWR', 0);
      return [hit('SWR-F-003', line, t.put(line, 'writerLastName', ''))];
    },
  },
  {
    rule: 'SWR-F-004',
    name: 'an SWR with Writer Unknown Indicator Y',
    plant(t) {
      const line = t.find('SWR', 0);
      return [hit('SWR-F-004', line, t.put(line, 'writerUnknownIndicator', 'Y'))];
    },
  },
  {
    rule: 'SWR-F-007',
    name: 'an SWR with no Writer Designation Code',
    plant(t) {
      const line = t.find('SWR', 0);
      return [hit('SWR-F-007', line, t.put(line, 'writerDesignationCode', ''))];
    },
  },
  {
    rule: 'NWR-F-007',
    name: 'a SER work with duration zero',
    plant(t) {
      const line = t.find('NWR', 0);
      t.put(line, 'musicalWorkDistributionCategory', 'SER');
      // Companion: a SER work needs an INS record (an INS or IND in 2.2), and this one has none.
      return [hit('NWR-F-007', line, t.put(line, 'duration', '000000')), hit(t.version === '2.1' ? 'NWR-T-003' : 'NWR-T-053', line, t.span(line, 'workTitle'))];
    },
  },
  {
    rule: 'NWR-F-014',
    name: 'a MOD version with no Music Arrangement',
    plant(t) {
      const line = t.find('NWR', 0);
      t.put(line, 'versionType', 'MOD');
      t.put(line, 'lyricAdaptation', 'NEW');
      t.put(t.find('OWR', 0), 'writerDesignationCode', 'AR'); // a modification needs an arranger (NWR-T-010)
      return [hit('NWR-F-014', line, t.span(line, 'musicArrangement'))];
    },
  },
  {
    rule: 'NWR-F-015',
    name: 'a MOD version with no Lyric Adaptation',
    plant(t) {
      const line = t.find('NWR', 0);
      t.put(line, 'versionType', 'MOD');
      t.put(line, 'musicArrangement', 'NEW');
      t.put(t.find('OWR', 0), 'writerDesignationCode', 'AR'); // a modification needs an arranger (NWR-T-010)
      return [hit('NWR-F-015', line, t.span(line, 'lyricAdaptation'))];
    },
  },
  {
    rule: 'NWR-F-018',
    name: 'a Composite Type with no Component Count',
    plant(t) {
      const line = t.find('NWR', 0);
      t.put(line, 'compositeType', 'MED');
      return [hit('NWR-F-018', line, t.span(line, 'compositeComponentCount'))];
    },
  },
  {
    rule: 'NWR-F-019',
    name: 'a Component Count with no Composite Type',
    plant(t) {
      const line = t.find('NWR', 0);
      t.put(line, 'compositeComponentCount', '2');
      return [hit('NWR-F-019', line, t.span(line, 'compositeType'))];
    },
  },
  {
    rule: 'NWR-F-020',
    name: 'a Component Count of 1',
    plant(t) {
      const line = t.find('NWR', 0);
      t.put(line, 'compositeType', 'MED');
      return [hit('NWR-F-020', line, t.put(line, 'compositeComponentCount', '1'))];
    },
  },
  {
    rule: 'ALT-F-006',
    name: 'an OL title with no language',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'ALT', { titleType: 'OL' })).fix();
      const line = t.find('ALT');
      return [hit('ALT-F-006', line, t.span(line, 'languageCode'))];
    },
  },
  {
    rule: 'ORN-F-004',
    name: 'a LIB origin with no CD Identifier',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'ORN', { intendedPurpose: 'LIB', productionTitle: 'X' })).fix();
      const line = t.find('ORN');
      return [hit('ORN-F-004', line, t.span(line, 'cdIdentifier'))];
    },
  },
  {
    rule: 'ORN-F-010',
    name: 'an origin with neither Production Title nor Library',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'ORN', { intendedPurpose: 'COM' })).fix();
      const line = t.find('ORN');
      return [hit('ORN-F-010', line, t.span(line, 'productionTitle'))];
    },
  },
  {
    rule: 'ORN-F-013',
    name: 'a FIL origin with no Production Title',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'ORN', { intendedPurpose: 'FIL', library: 'X' })).fix();
      const line = t.find('ORN');
      return [hit('ORN-F-013', line, t.span(line, 'productionTitle'))];
    },
  },
  {
    rule: 'REC-F-001',
    name: 'a REC with every optional field empty',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'REC')).fix();
      return [hit('REC-F-001', t.find('REC'), TYPE)];
    },
  },
  {
    rule: 'NPR-F-005',
    name: 'an NPR with no artist, language or dialect',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'NPR')).fix();
      const line = t.find('NPR');
      return [hit('NPR-F-005', line, t.span(line, 'performingArtistName'))];
    },
  },
  {
    rule: 'ARI-R-001',
    name: 'an ARI with neither Work # nor Note',
    plant(t) {
      t.insertAfter(t.find('OWR', 0), rec(t.version, 'ARI', { societyNumber: '021' })).fix();
      const line = t.find('ARI');
      return [hit('ARI-R-001', line, t.span(line, 'workNumber'))];
    },
  },
  {
    rule: 'ACK-F-009',
    name: 'an ACK for an NWR with no Creation Title',
    base: 'ack',
    plant(t) {
      return [hit('ACK-F-009', 2, t.put(2, 'creationTitle', ''))];
    },
  },

  // ---------------------------------------------------------------- lookups
  {
    rule: 'LKP-TBL',
    name: 'a Version Type that is not in the table',
    plant(t) {
      const line = t.find('NWR', 0);
      return [hit('LKP-TBL', line, t.put(line, 'versionType', 'XXX'))];
    },
  },
  {
    rule: 'LKP-TBL',
    name: 'an Excerpt Type that is not in the table, where the spec says the field is defaulted (FR, a warning)',
    plant(t) {
      const line = t.find('NWR', 0);
      return [warn(hit('LKP-TBL', line, t.put(line, 'excerptType', 'ZZZ')))];
    },
  },
  {
    rule: 'LKP-SOC',
    name: 'a society code in neither saved list',
    plant(t) {
      const line = t.find('SWR', 0);
      return [warn(hit('LKP-SOC', line, t.put(line, 'prAffiliationSocietyNumber', '999')))];
    },
  },
  {
    rule: 'LKP-TIS',
    name: 'a TIS code that is not in the saved list',
    plant(t) {
      const line = t.find('SPT', 0);
      return [note(hit('LKP-TIS', line, t.put(line, 'tisNumericCode', '9999')))];
    },
  },
  {
    rule: 'LKP-RET',
    name: 'society code 068, which the table marks as retired',
    plant(t) {
      const line = t.find('SWR', 0);
      return [warn(hit('LKP-RET', line, t.put(line, 'prAffiliationSocietyNumber', '068')))];
    },
  },
];

const sortHits = (hits: Hit[]): Hit[] =>
  [...hits].sort((a, b) => a.line - b.line || (a.start ?? -1) - (b.start ?? -1) || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));

describe('planted defects: one rule fires, at the planted place, and nothing else does', () => {
  for (const defect of DEFECTS) {
    for (const version of defect.versions ?? BOTH) {
      it(`${defect.rule} (${version}): ${defect.name}`, () => {
        const t = makeBase(version, defect.base ?? 'one');
        const expected = defect.plant(t);
        expect(expected.some(h => h.rule === defect.rule)).toBe(true);
        const result = t.run();
        expect(sortHits(hitsOf(result.problems))).toEqual(sortHits(expected));
      });
    }
  }
});

describe('coverage: every rule has a planted defect', () => {
  it('no rule is without a defect in each version it runs on', () => {
    const missing: string[] = [];
    for (const rule of BUILTIN_RULES) {
      for (const version of rule.versions) {
        const covered = DEFECTS.some(d => d.rule === rule.id && (d.versions ?? BOTH).includes(version));
        if (!covered) missing.push(`${rule.id} (${version})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every defect names a rule that exists', () => {
    const ids = new Set(BUILTIN_RULES.map(r => r.id));
    expect(DEFECTS.filter(d => !ids.has(d.rule)).map(d => d.rule)).toEqual([]);
  });
});

describe('severities and messages', () => {
  it('reports FR edits as warnings and names the edit', () => {
    const t = clean('2.1');
    const line = t.find('NWR', 0);
    t.put(line, 'copyrightDate', '20260230');
    const p = t.run().problems;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ ruleId: 'FMT-D', severity: 'warning', edit: 'NWR-F-005' });
    expect(p[0]!.message).toContain('NWR-F-005');
  });

  it('reports the SER duration under edit 7, as an error', () => {
    const t = clean('2.1');
    const line = t.find('NWR', 0);
    t.put(line, 'musicalWorkDistributionCategory', 'SER');
    t.put(line, 'duration', '000099');
    const p = t.run().problems.filter(x => x.ruleId === 'FMT-T');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ ruleId: 'FMT-T', severity: 'error', edit: 'NWR-F-007' });
  });

  it('never uses the word "valid" in a summary', () => {
    const t = clean('2.2');
    expect(t.run().summary.text).not.toMatch(/valid/i);
    t.poke(0, 0, 'XXX');
    expect(t.run().summary.text).not.toMatch(/valid/i);
  });

  it('counts problems and checks in the summary sentence', () => {
    const t = clean('2.1');
    const trl = t.find('TRL');
    t.put(trl, 'groupCount', '9');
    const r = t.run();
    expect(r.summary.errors).toBe(1);
    expect(r.summary.text).toBe(`1 problem in ${r.checked.toLocaleString('en-US')} checks: 1 error, 0 warnings`);
  });

  it('caps the listed problems per rule and still counts them all', () => {
    const t = clean('2.1', 30);
    for (let i = 0; i < t.lines.length; i++) if (t.lines[i]!.startsWith('NWR')) t.put(i, 'workTitle', 'lower case');
    const r = check(parse(t.bytes(), { version: '2.1' }), { maxPerRule: 5 });
    expect(r.problems.filter(p => p.ruleId === 'FMT-UC')).toHaveLength(5);
    expect(r.suppressed['FMT-UC']).toBe(25);
    expect(r.summary.errors).toBe(30);
  });
});
