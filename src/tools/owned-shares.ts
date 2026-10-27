import { WORK_HEADERS } from '../model/group';
import { drain } from '../model/progress';
import type { Progress, RunOptions } from '../model/progress';
import type { CwrDoc, RecRef } from '../model/types';
import { buildWork, RIGHTS, territoryTotals, UNREADABLE, WORLD } from '../rules/work';
import type { Right } from '../rules/work';
import { workSummary } from '../rules/workSummary';
import type { PartySummary } from '../rules/workSummary';
import { stepper, WORK_STEP } from './steps';

/**
 * Owned-share calculator. Read-only. For each work (NWR, REV, ISW and EXC transactions) it answers two questions
 * about the sender's own parties, the publishers (SPU) and writers (SWR) the file marks as controlled:
 *
 *  - `owned`: how much of each right (PR, MR, SR) they own, from the ownership shares. The other parties
 *    (OPU, OWR) are shown beside them, so the gap to 100% is visible.
 *  - `collected`: how much of each right they collect in each territory, from the territory records that belong to
 *    them (SPT and SWT; OPT and OWT belong to other parties and are left out). `gap` is owned minus collected.
 *
 * All shares are hundredths of a percent (`5000` is 50.00%; `formatShare` makes text). A share that cannot be read
 * is `null`, and so is anything built on it. A gap can be negative: a publisher may collect more than it owns when it
 * also collects a writer's share.
 *
 * Territories are points, as in the share checks: a code some record names, plus the World record. World is never
 * expanded into countries. A work with a territory record for a group of countries other than World cannot be
 * worked out per territory, and is reported as such: `collected.expanded` is false, `collected.unexpanded` lists the
 * codes and `collected.territories` is empty.
 */

export interface OwnedShare {
  /** Sum over the controlled parties (SPU and SWR). */
  controlled: number | null;
  /** Sum over the other parties (OPU and OWR). */
  others: number | null;
  /** Controlled plus others. */
  total: number | null;
}

export interface CollectedTerritory {
  /** TIS code: the World code, or the country code a record names. */
  code: string;
  /** True for the World point, which stands for every territory no other record names. */
  world: boolean;
  /** What the controlled parties collect here. */
  collected: Record<Right, number | null>;
  /** Owned minus collected. */
  gap: Record<Right, number | null>;
}

export interface WorkOwnedShares {
  header: RecRef;
  line: number;
  recordType: string;
  title: string;
  workNumber: string;
  owned: Record<Right, OwnedShare>;
  /** The controlled parties with their ownership shares, in file order. */
  controlledParties: PartySummary[];
  collected: {
    /** SPT and SWT records in the work. */
    territoryRecords: number;
    /** False when a territory record names a group of countries the tool cannot expand. */
    expanded: boolean;
    /** The group codes that stopped the expansion. */
    unexpanded: string[];
    territories: CollectedTerritory[];
  };
}

export interface OwnedSharesReport {
  works: WorkOwnedShares[];
}

const orNull = (v: number): number | null => (v === UNREADABLE ? null : v);

function sum(values: ReadonlyArray<number | null>): number | null {
  let total = 0;
  for (const v of values) {
    if (v === null) return null;
    total += v;
  }
  return total;
}

export function ownedShares(doc: CwrDoc): OwnedSharesReport {
  return drain(ownedSharesSteps(doc));
}

/**
 * `ownedShares` as a generator, shaped like `checkSteps`: it yields a `Progress` (`task: 'owned-shares'`, stage `works`)
 * about every 256 transactions and returns the same report `ownedShares` returns. The document is only read. A host that has
 * to stay responsive gives the event loop a turn between `next()` calls; stopping is not calling `next()` again (or
 * `return()`), and leaves nothing behind.
 */
export function* ownedSharesSteps(doc: CwrDoc, options: RunOptions = {}): Generator<Progress, OwnedSharesReport, void> {
  const step = stepper('owned-shares', options);
  const total = doc.file.groups.reduce((sum, g) => sum + g.transactions.length, 0);
  yield step('works', 0, total, 0, 1);
  let seen = 0;
  const works: WorkOwnedShares[] = [];
  const version = doc.version.version;
  for (const group of doc.file.groups) {
    for (const txn of group.transactions) {
      seen++;
      if (seen % WORK_STEP === 0) yield step('works', seen, total, 0, 1);
      if (!WORK_HEADERS.has(doc.records[txn.header]!.type)) continue;
      const summary = workSummary(doc, txn);
      const controlledParties = summary.parties.filter(p => p.controlled);
      const others = summary.parties.filter(p => !p.controlled);

      const owned = {} as Record<Right, OwnedShare>;
      for (const right of RIGHTS) {
        const c = sum(controlledParties.map(p => p.shares[right]));
        const o = sum(others.map(p => p.shares[right]));
        owned[right] = { controlled: c, others: o, total: c === null || o === null ? null : c + o };
      }

      const work = buildWork(doc, version, txn);
      const mine = work.terrs.filter(t => t.type === 'SPT' || t.type === 'SWT');
      const result = territoryTotals(mine);
      const unexpanded = [...new Set(result.unexpanded.map(t => t.tis))].sort();
      const territories: CollectedTerritory[] = [];
      for (const point of result.points) {
        const collected = {} as Record<Right, number | null>;
        const gap = {} as Record<Right, number | null>;
        for (const right of RIGHTS) {
          collected[right] = orNull(point.total[right]);
          const own = owned[right].controlled;
          gap[right] = own === null || collected[right] === null ? null : own - collected[right]!;
        }
        const world = point.code === '*';
        territories.push({ code: world ? WORLD : point.code, world, collected, gap });
      }
      // World first, then the countries in code order.
      territories.sort((a, b) => (a.world === b.world ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) : a.world ? -1 : 1));

      works.push({
        header: txn.header,
        line: summary.line,
        recordType: summary.recordType,
        title: summary.title,
        workNumber: summary.workNumber,
        owned,
        controlledParties,
        collected: { territoryRecords: mine.length, expanded: unexpanded.length === 0, unexpanded, territories },
      });
    }
  }
  yield step('works', total, total, 0, 1);
  return { works };
}
