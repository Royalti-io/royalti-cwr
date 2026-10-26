import { describe, expect, it } from 'vitest';
import { SYNTH_IPIS } from '../../src/index';
import type { CwrVersion } from '../../src/index';
import { agrBase, clean, spanOf } from './support';
import type { Tx } from './support';

/**
 * Regression tests for the findings of an independent review of the shares, links and territories rules.
 * Each scenario is the review's failing input, built
 * here from the synthetic generator's own records, and runs in both versions.
 */

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

function setFields(version: CwrVersion, line: string, over: Record<string, string>): string {
  let l = line;
  for (const [id, value] of Object.entries(over)) {
    const { start, end } = spanOf(version, l.slice(0, 3), id);
    const width = end - start;
    const cell = /^\d+$/.test(value) && value.length < width ? value.padStart(width, '0') : value.padEnd(width, ' ');
    if (cell.length !== width) throw new Error(`${value} does not fit ${l.slice(0, 3)}.${id}`);
    if (l.length < end) l = l.padEnd(end, ' ');
    l = l.slice(0, start) + cell + l.slice(end);
  }
  return l;
}

/** Builds records of one work from the clean base's own lines; every share is in hundredths of a percent. */
class Work {
  private readonly tpl: Record<string, string>;
  private readonly body: string[] = [];
  constructor(readonly version: CwrVersion) {
    const t = clean(version, 1);
    const at = (type: string): string => t.lines[t.find(type, 0)]!;
    this.tpl = { SPU: at('SPU'), OPU: at('OPU'), SPT: at('SPT'), SWR: at('SWR'), OWR: at('OWR'), SWT: at('SWT'), PWR: at('PWR') };
    this.tpl.OPT = 'OPT' + this.tpl.SPT!.slice(3);
    this.tpl.OWT = 'OWT' + this.tpl.SWT!.slice(3);
  }
  private add(type: string, over: Record<string, string>): this {
    this.body.push(setFields(this.version, this.tpl[type]!, over));
    return this;
  }
  spu(seq: number, ip: string, type: string, pr: number, mr: number, sr: number, extra: Record<string, string> = {}): this {
    return this.pub('SPU', seq, ip, type, pr, mr, sr, extra);
  }
  opu(seq: number, ip: string, type: string, pr: number, mr: number, sr: number, extra: Record<string, string> = {}): this {
    return this.pub('OPU', seq, ip, type, pr, mr, sr, extra);
  }
  private pub(rec: string, seq: number, ip: string, type: string, pr: number, mr: number, sr: number, extra: Record<string, string>): this {
    return this.add(rec, {
      publisherSequenceNumber: String(seq).padStart(2, '0'),
      interestedPartyNumber: ip,
      publisherName: `PUBLISHER ${ip}`,
      publisherType: type,
      prOwnershipShare: String(pr),
      mrOwnershipShare: String(mr),
      srOwnershipShare: String(sr),
      prAffiliationSocietyNumber: pr > 0 ? '021' : '',
      mrSociety: mr > 0 ? '021' : '',
      srSociety: sr > 0 ? '021' : '',
      ...extra,
    });
  }
  /** An SPT (or OPT), by default I for World, sequence 1. */
  spt(ip: string, pr: number, mr: number, sr: number, ind = 'I', tis = '2136', seq = 1, extra: Record<string, string> = {}, type = 'SPT'): this {
    return this.add(type, {
      interestedPartyNumber: ip,
      prCollectionShare: String(pr),
      mrCollectionShare: String(mr),
      srCollectionShare: String(sr),
      inclusionExclusionIndicator: ind,
      tisNumericCode: tis,
      sequenceNumber: String(seq),
      ...extra,
    });
  }
  swr(ip: string, pr: number, mr: number, sr: number, extra: Record<string, string> = {}, type = 'SWR'): this {
    return this.add(type, {
      interestedPartyNumber: ip,
      writerLastName: `WRITER ${ip}`,
      prOwnershipShare: String(pr),
      mrOwnershipShare: String(mr),
      srOwnershipShare: String(sr),
      ...extra,
    });
  }
  swt(ip: string, pr: number, mr = 0, sr = 0, ind = 'I', tis = '2136', seq = 1): this {
    return this.add('SWT', { interestedPartyNumber: ip, prCollectionShare: String(pr), mrCollectionShare: String(mr), srCollectionShare: String(sr), inclusionExclusionIndicator: ind, tisNumericCode: tis, sequenceNumber: String(seq) });
  }
  pwr(pubIp: string, writerIp: string, seq = 1): this {
    return this.add('PWR', { publisherIpNumber: pubIp, writerIpNumber: writerIp, ...(this.version === '2.2' ? { publisherSequenceNumber: String(seq).padStart(2, '0') } : {}) });
  }
  /** The clean one-work file with this work's detail records in place of the base ones. */
  file(): Tx {
    const t = clean(this.version, 1);
    const first = t.find('SPU', 0);
    const last = t.find('OWR', 0);
    t.lines.splice(first, last - first + 1, ...this.body);
    t.eols.splice(first, last - first + 1, ...this.body.map(() => '\r\n'));
    return t.fix();
  }
}

const ids = (t: Tx): string[] => t.run().problems.map(p => p.ruleId).sort();
const only = (t: Tx, ruleIds: string[]): string[] =>
  t
    .run()
    .problems.filter(p => ruleIds.includes(p.ruleId))
    .map(p => p.ruleId);

/** Two writers of 25% PR each, linked to publishers 1 and 2; with the publishers' 25% each that is the whole work. */
function twoWriters(w: Work): Work {
  return w.swr('W1', 2500, 0, 0).swt('W1', 2500).pwr('P1', 'W1', 1).swr('W2', 2500, 0, 0).swt('W2', 2500).pwr('P2', 'W2', 2);
}

describe('M1: an income participant (PA) inside a chain is not the start of a new chain', () => {
  for (const version of VERSIONS) {
    it(`${version}: a PA with its original publisher’s Publisher Sequence # is in that chain`, () => {
      const t = new Work(version)
        .spu(1, 'P1', 'E', 5000, 10000, 10000)
        .spt('P1', 4000, 10000, 10000)
        .spu(1, 'P3', 'PA', 0, 0, 0)
        .spt('P3', 1000, 0, 0)
        .swr('W1', 5000, 0, 0)
        .swt('W1', 5000)
        .pwr('P1', 'W1')
        .file();
      expect(ids(t)).toEqual([]);
    });

    it(`${version}: a PA with a number of its own opens a chain of its own, and the numbers must count on`, () => {
      const ok = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 4000, 10000, 10000).spu(2, 'P3', 'PA', 0, 0, 0).spt('P3', 1000, 0, 0).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
      expect(ids(ok)).toEqual([]);
      const bad = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 4000, 10000, 10000).spu(3, 'P3', 'PA', 0, 0, 0).spt('P3', 1000, 0, 0).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
      expect(ids(bad)).toEqual(['SPU-F-001']);
    });

    it(`${version}: a PA that follows the chain’s administrator is still in the chain, and NWR-T-025 asks the chain, not the PA`, () => {
      const t = new Work(version)
        .spu(1, 'P1', 'E', 5000, 10000, 10000)
        .spt('P1', 0, 0, 0, 'E', '0826', 1)
        .spu(1, 'P2', 'AM', 0, 0, 0)
        .spt('P2', 5000, 10000, 10000)
        .spu(1, 'P3', 'PA', 0, 0, 0)
        .spt('P3', 0, 0, 0, 'E', '0826', 1)
        .swr('W1', 5000, 0, 0)
        .swt('W1', 5000)
        .pwr('P1', 'W1')
        .file();
      expect(only(t, ['SPU-F-001', 'SPU-R-002', 'SPU-R-005', 'NWR-T-025', 'NWR-T-017'])).toEqual([]);
    });
  }
});

describe('M2: the record that decides a territory does not depend on record order', () => {
  for (const version of VERSIONS) {
    const rule = version === '2.1' ? 'NWR-T-014' : 'NWR-T-044';
    /** The original publisher collects in the world but not in the UK; the sub-publisher collects in the UK. `swap` writes the OP's two SPTs the other way round. */
    const subPublished = (swap: boolean, ukShare = 5000): Tx => {
      const w = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000);
      const exclude = (seq: number): Work => w.spt('P1', 0, 0, 0, 'E', '0826', seq);
      const world = (seq: number): Work => w.spt('P1', 5000, 10000, 10000, 'I', '2136', seq);
      if (swap) {
        exclude(1);
        world(2);
      } else {
        world(1);
        exclude(2);
      }
      return w.spu(1, 'P9', 'SE', 0, 0, 0).spt('P9', ukShare, 10000, 10000, 'I', '0826').swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
    };

    it(`${version}: the exclusion of the home territory before or after the world include gives the same, clean, answer`, () => {
      expect(ids(subPublished(false))).toEqual([]);
      expect(ids(subPublished(true))).toEqual([]);
    });

    it(`${version}: a sub-publisher collecting less than the ownership in the excluded territory is NWR-T-027 in either order`, () => {
      for (const swap of [false, true]) expect(ids(subPublished(swap, 2500)), `swap ${swap}`).toEqual(['NWR-T-027']);
    });

    it(`${version}: a country record decides over a World record whichever comes first`, () => {
      // 50% in the UK and 25% in the world: the UK point has 50, the rest of the world 25 (NWR-T-027 on the world point), in both orders.
      const run = (swap: boolean): string[] => {
        const w = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000);
        if (swap) w.spt('P1', 2500, 10000, 10000, 'I', '2136', 1).spt('P1', 5000, 10000, 10000, 'I', '0826', 2);
        else w.spt('P1', 5000, 10000, 10000, 'I', '0826', 1).spt('P1', 2500, 10000, 10000, 'I', '2136', 2);
        return ids(w.swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file());
      };
      expect(run(false)).toEqual(['NWR-T-027']);
      expect(run(true)).toEqual(run(false));
    });

    it(`${version}: an include and an exclude of the same territory: the include decides in either order`, () => {
      const run = (swap: boolean): string[] => {
        const w = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 5000, 10000, 10000, 'I', '2136', 1);
        if (swap) w.spt('P1', 0, 0, 0, 'E', '0826', 2).spt('P1', 5000, 10000, 10000, 'I', '0826', 3);
        else w.spt('P1', 5000, 10000, 10000, 'I', '0826', 2).spt('P1', 0, 0, 0, 'E', '0826', 3);
        // The writer collects 60% in the UK: with the publisher's 50% there that is 110%.
        return ids(w.swr('W1', 5000, 0, 0).swt('W1', 5000).swt('W1', 6000, 0, 0, 'I', '0826', 2).pwr('P1', 'W1').file());
      };
      expect(run(false)).toEqual([rule]);
      expect(run(true)).toEqual([rule]);
    });

    it(`${version}: two include records for one territory count the larger share, whichever comes first`, () => {
      const run = (swap: boolean): string[] => {
        const w = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 5000, 10000, 10000, 'I', '2136', 1);
        if (swap) w.spt('P1', 5000, 10000, 10000, 'I', '0826', 2).spt('P1', 1000, 10000, 10000, 'I', '0826', 3);
        else w.spt('P1', 1000, 10000, 10000, 'I', '0826', 2).spt('P1', 5000, 10000, 10000, 'I', '0826', 3);
        return ids(w.swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file());
      };
      expect(run(false)).toEqual([]);
      expect(run(true)).toEqual([]);
    });
  }
});

describe('M3: publisher records are linked to their chain by Publisher Sequence #', () => {
  for (const version of VERSIONS) {
    /** Chain 1 collects 0 at its original publisher and 25 at its administrator, which stands after chain 2; chain 2 collects 25. */
    const adminAfterSecondChain = (adminSeq: number): Tx =>
      twoWriters(
        new Work(version)
          .spu(1, 'P1', 'E', 2500, 0, 0)
          .spt('P1', 0, 0, 0)
          .spu(2, 'P2', 'E', 2500, 0, 0)
          .spt('P2', 2500, 0, 0)
          .spu(adminSeq, 'P3', 'AM', 0, 0, 0)
          .spt('P3', 2500, 0, 0),
      ).file();

    it(`${version}: an administrator that carries the first chain’s number is counted there: one warning for its position, no share errors`, () => {
      const t = adminAfterSecondChain(1);
      expect(ids(t)).toEqual(['SPT-R-001', 'SPU-D-001']);
      const d = t.run().problems.find(p => p.ruleId === 'SPU-D-001')!;
      expect(d.severity).toBe('warning');
      expect(d.line).toBe(t.find('SPU', 2));
      expect(d.message).toContain('Publisher Sequence # 01');
    });

    it(`${version}: an administrator whose number names no chain goes with the chain in front of it, and SPU-R-005 reports the number`, () => {
      const t = adminAfterSecondChain(5);
      const got = ids(t);
      expect(got).toContain('SPU-R-005');
      expect(got).not.toContain('SPU-D-001');
    });

    it(`${version}: a record stays in the chain whose number it carries when that chain is the one in front of it`, () => {
      const t = twoWriters(new Work(version).spu(1, 'P1', 'E', 2500, 0, 0).spt('P1', 0, 0, 0).spu(1, 'P3', 'AM', 0, 0, 0).spt('P3', 2500, 0, 0).spu(2, 'P2', 'E', 2500, 0, 0).spt('P2', 2500, 0, 0)).file();
      expect(ids(t)).toEqual(['SPT-R-001']);
    });
  }
});

describe('M4: NWR-T-027 is lifted by a writer whose role is PA', () => {
  for (const version of VERSIONS) {
    const subPublisherCollects25 = (designation: string): Tx =>
      new Work(version)
        .spu(1, 'P1', 'E', 5000, 10000, 10000)
        .spt('P1', 5000, 10000, 10000, 'I', '2136', 1)
        .spt('P1', 0, 0, 0, 'E', '0826', 2)
        .spu(1, 'P9', 'SE', 0, 0, 0)
        .spt('P9', 2500, 10000, 10000, 'I', '0826')
        .swr('W1', 4000, 0, 0)
        .swt('W1', 4000)
        .pwr('P1', 'W1')
        .swr('W2', 1000, 0, 0, { writerDesignationCode: designation }, 'OWR')
        .file();

    it(`${version}: with an ordinary co-writer the sub-publisher’s 25% against 50% ownership is NWR-T-027`, () => {
      expect(only(subPublisherCollects25('CA'), ['NWR-T-027'])).toEqual(['NWR-T-027']);
    });

    it(`${version}: with a co-writer designated PA the edit does not apply`, () => {
      expect(ids(subPublisherCollects25('PA'))).toEqual([]);
    });
  }
});

describe('M5: SWR-R-002 does not ask for a PWR on a work with no publisher', () => {
  for (const version of VERSIONS) {
    it(`${version}: a writer-only work with PR 50% is NWR-T-011's finding alone`, () => {
      const t = new Work(version).swr('W1', 5000, 0, 0).swt('W1', 5000).file();
      expect(ids(t)).toEqual(['NWR-T-011']);
    });

    it(`${version}: a controlled writer with no PWR on a work that has a publisher still gets SWR-R-002, with the writers’ totals`, () => {
      const t = new Work(version).spu(1, 'P1', 'E', 5000, 0, 0).spt('P1', 5000, 0, 0).swr('W1', 2500, 0, 0).swt('W1', 2500).pwr('P1', 'W1').swr('W2', 2500, 0, 0).swt('W2', 2500).file();
      const p = t.run().problems;
      expect(p.map(x => x.ruleId)).toEqual(['SWR-R-002']);
      expect(p[0]!.line).toBe(t.find('SWR', 1));
      expect(p[0]!.message).toContain('the writers hold PR 50.00%, MR 0.00%, SR 0.00%');
    });
  }
});

describe('M6: SPU edit 40 (2.2): the collecting publisher’s IPI Name # is mandatory', () => {
  const spuWithIpi = (version: CwrVersion, ipi: string, withSpt = true): Tx => {
    const w = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000, { publisherIpiNameNumber: ipi });
    if (withSpt) w.spt('P1', 5000, 10000, 10000);
    return w.swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
  };

  it('2.2: an SPU followed by an SPT with a blank IPI Name # is an error on that field', () => {
    const t = spuWithIpi('2.2', '');
    const p = t.run().problems;
    expect(p.map(x => x.ruleId)).toEqual(['SPU-F-040']);
    expect(p[0]).toMatchObject({ severity: 'error', line: t.find('SPU', 0), fieldId: 'publisherIpiNameNumber' });
    expect(p[0]!.span).toEqual(t.span(t.find('SPU', 0), 'publisherIpiNameNumber'));
  });

  it('2.2: an all-zero IPI Name # is not entered either', () => {
    expect(ids(spuWithIpi('2.2', '00000000000'))).toEqual(['SPU-F-040']);
  });

  it('2.2: an entered IPI Name # passes, and an SPU with no SPT is not the collecting publisher', () => {
    expect(ids(spuWithIpi('2.2', SYNTH_IPIS[0]!))).toEqual([]);
    expect(only(spuWithIpi('2.2', '', false), ['SPU-F-040'])).toEqual([]);
  });

  it('2.2: an administrator that collects needs its IPI Name # too; a record after an NPN still counts as followed by an SPT', () => {
    const t = new Work('2.2')
      .spu(1, 'P1', 'E', 5000, 10000, 10000)
      .spt('P1', 0, 0, 0, 'E', '0826')
      .spu(1, 'P2', 'AM', 0, 0, 0, { publisherIpiNameNumber: '' })
      .spt('P2', 5000, 10000, 10000)
      .swr('W1', 5000, 0, 0)
      .swt('W1', 5000)
      .pwr('P1', 'W1')
      .file();
    const p = t.run().problems.filter(x => x.ruleId === 'SPU-F-040');
    expect(p).toHaveLength(1);
    expect(p[0]!.line).toBe(t.find('SPU', 1));
  });

  it('2.1: the field text does not require the number, so a blank one is not a finding', () => {
    expect(ids(spuWithIpi('2.1', ''))).toEqual([]);
  });
});

describe('M7: edits 7 and 20 as warnings, under the reading that "has collection shares" means "has an ownership share"', () => {
  for (const version of VERSIONS) {
    it(`${version}: a controlled chain that owns something and has no SPT is NWR-T-007 (warning); its quote and its reading are in the message`, () => {
      const t = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
      const p = t.run().problems;
      expect(p.map(x => [x.ruleId, x.severity])).toEqual([['NWR-T-007', 'warning']]);
      expect(p[0]!.line).toBe(t.find('SPU', 0));
      expect(p[0]!.message).toContain('is the check that a controlled publisher with collection shares has a territory record');
      expect(p[0]!.message).toContain('circular');
    });

    it(`${version}: a chain whose administrator has the SPT, an income participant chain and a chain that owns nothing are not asked`, () => {
      const admin = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spu(1, 'P2', 'AM', 0, 0, 0).spt('P2', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
      expect(only(admin, ['NWR-T-007'])).toEqual([]);
      const income = new Work(version).spu(1, 'P1', 'PA', 0, 0, 0).swr('W1', 10000, 10000, 10000).swt('W1', 10000, 10000, 10000).file();
      expect(only(income, ['NWR-T-007'])).toEqual([]);
    });

    it(`${version}: a controlled writer with an ownership share and no SWT is NWR-T-020 (warning); one with no shares is not asked`, () => {
      const t = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 5000, 10000, 10000).swr('W1', 5000, 0, 0).pwr('P1', 'W1').file();
      const p = t.run().problems;
      expect(p.map(x => [x.ruleId, x.severity])).toEqual([['NWR-T-020', 'warning']]);
      expect(p[0]!.message).toContain('is the check that a controlled writer with collection shares has a territory record');
      const none = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').swr('W2', 0, 0, 0).pwr('P1', 'W2').file();
      expect(only(none, ['NWR-T-020'])).toEqual([]);
    });
  }
});

describe('minors', () => {
  for (const version of VERSIONS) {
    it(`${version}: m1: NWR-T-011 marks every record that holds the right, a 0% one too`, () => {
      // The review's real defect (b): the other publisher's MR and SR were left at 0, so MR and SR total 50%.
      const t = new Work(version)
        .spu(1, 'P1', 'E', 2500, 5000, 5000)
        .spt('P1', 2500, 5000, 5000)
        .opu(2, 'P2', 'E', 2500, 0, 0)
        .swr('W1', 2500, 0, 0)
        .swt('W1', 2500)
        .pwr('P1', 'W1')
        .swr('W2', 2500, 0, 0, {}, 'OWR')
        .file();
      const mr = t.run().problems.find(p => p.ruleId === 'NWR-T-011' && p.message.startsWith('MR'))!;
      const opu = t.find('OPU', 0);
      const span = t.span(opu, 'mrOwnershipShare');
      expect(mr.related!.some(r => r.line === opu && r.start === span.start && r.end === span.end && r.role.includes('0.00%'))).toBe(true);
      expect(mr.message).toContain('Check for a missing writer or publisher record');
    });

    it(`${version}: m4: the territory in NWR-T-027 carries its ISO alpha-2 code from the saved TIS table`, () => {
      const t = new Work(version)
        .spu(1, 'P1', 'E', 5000, 10000, 10000)
        .spt('P1', 5000, 10000, 10000, 'I', '2136', 1)
        .spt('P1', 0, 0, 0, 'E', '0826', 2)
        .spu(1, 'P9', 'SE', 0, 0, 0)
        .spt('P9', 2500, 10000, 10000, 'I', '0826')
        .swr('W1', 5000, 0, 0)
        .swt('W1', 5000)
        .pwr('P1', 'W1')
        .file();
      const p = t.run().problems.find(x => x.ruleId === 'NWR-T-027')!;
      expect(p.message).toContain('TIS 0826 (GB)');
      expect(p.message).toContain('original publisher (and acquirer, if any)');
    });

    it(`${version}: m4: FMT-N shows a left-justified number as written, spaces included`, () => {
      const t = new Work(version).spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 5000, 10000, 10000).swr('W1', 5000, 0, 0, { prOwnershipShare: '5000 ' }).swt('W1', 5000).pwr('P1', 'W1').file();
      const p = t.run().problems.find(x => x.ruleId === 'FMT-N')!;
      expect(p.message).toContain('found "5000 "');
      expect(p.message).toContain('"05000"');
    });

    it(`${version}: m8: a PWR that names an OPU is reported even when some SPU lacks its Interested Party #`, () => {
      if (version !== '2.1') return;
      const t = new Work(version)
        .spu(1, '', 'E', 2500, 5000, 5000)
        .spt('', 2500, 5000, 5000)
        .opu(2, 'P2', 'E', 2500, 5000, 5000)
        .swr('W1', 5000, 0, 0)
        .swt('W1', 5000)
        .pwr('P2', 'W1')
        .file();
      expect(ids(t)).toContain('PWR-F-001');
      const unmatched = new Work(version).spu(1, '', 'E', 5000, 10000, 10000).spt('', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P7', 'W1').file();
      expect(ids(unmatched)).not.toContain('PWR-F-001');
    });
  }
});

describe('AGR-T-005: the shares of the IPA records total 100% (plus or minus .06%) or 0% for each right', () => {
  for (const version of VERSIONS) {
    const withShares = (as: string, ac: string, mr = ['0', '0']): Tx => {
      const t = agrBase(version);
      const ipa = t.find('IPA', 0);
      t.put(ipa, 'prShare', as);
      t.put(ipa + 1, 'prShare', ac);
      t.put(ipa, 'mrShare', mr[0]!);
      t.put(ipa + 1, 'mrShare', mr[1]!);
      return t;
    };
    it(`${version}: 100.00%, 100.06% and 99.94% pass; 99.93% and 100.07% stop`, () => {
      for (const [as, ac, expected] of [['6000', '4000', 0], ['6000', '4006', 0], ['6000', '3994', 0], ['6000', '3993', 1], ['6000', '4007', 1]] as const) {
        expect(only(withShares(as, ac), ['AGR-T-005']).length, `${as}+${ac}`).toBe(expected);
      }
    });
    it(`${version}: a right nobody takes (0%) passes, and each right is asked on its own`, () => {
      expect(only(withShares('6000', '4000', ['0', '0']), ['AGR-T-005'])).toEqual([]);
      const p = withShares('6000', '4000', ['3000', '3000']).run().problems.filter(x => x.ruleId === 'AGR-T-005');
      expect(p).toHaveLength(1);
      expect(p[0]!.message).toContain('MR shares of the 2 IPA records total 60.00%');
    });
  }
});

describe('cases the mutation check of the new rules asked for', () => {
  for (const version of VERSIONS) {
    it(`${version}: a number links a record only to a chain of its own kind: an OPU sub-publisher numbered 1 stays with the OPU chain`, () => {
      const t = new Work(version)
        .spu(1, 'P1', 'E', 2500, 5000, 5000)
        .spt('P1', 2500, 5000, 5000)
        .opu(2, 'P2', 'E', 2500, 5000, 5000)
        .opu(1, 'P3', 'SE', 0, 0, 0)
        .swr('W1', 5000, 0, 0)
        .swt('W1', 5000)
        .pwr('P1', 'W1')
        .file();
      const got = ids(t);
      expect(got).toContain('SPU-R-005');
      expect(got).not.toContain('NWR-T-016');
      expect(got).not.toContain('SPU-D-001');
    });

    it(`${version}: NWR-T-007 counts an acquirer’s ownership, and does not ask an OPU chain`, () => {
      const aq = new Work(version).spu(1, 'P1', 'E', 0, 0, 0).spu(1, 'P2', 'AQ', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
      expect(only(aq, ['NWR-T-007'])).toEqual(['NWR-T-007']);
      const opu = new Work(version).opu(1, 'P1', 'E', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).file();
      expect(only(opu, ['NWR-T-007'])).toEqual([]);
    });
  }

  it('2.2: SPU-F-040 is for an SPU: an OPU with an SPT under it is not asked for an IPI Name #', () => {
    const t = new Work('2.2').opu(1, 'P1', 'E', 5000, 10000, 10000, { publisherIpiNameNumber: '' }).spt('P1', 5000, 10000, 10000).swr('W1', 5000, 0, 0).swt('W1', 5000).file();
    expect(only(t, ['SPU-F-040'])).toEqual([]);
  });

  it('2.2: an OPT is not an SPT for NWR-T-007', () => {
    const t = new Work('2.2').spu(1, 'P1', 'E', 5000, 10000, 10000).spt('P1', 5000, 10000, 10000, 'I', '2136', 1, {}, 'OPT').swr('W1', 5000, 0, 0).swt('W1', 5000).pwr('P1', 'W1').file();
    expect(only(t, ['NWR-T-007'])).toEqual(['NWR-T-007']);
  });
});
