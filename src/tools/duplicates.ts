import { getField } from '../model/fields';
import { WORK_HEADERS } from '../model/group';
import { drain } from '../model/progress';
import type { Progress, RunOptions } from '../model/progress';
import type { CwrDoc, RecRef } from '../model/types';
import { workSummary } from '../rules/workSummary';
import type { Severity } from '../rules/types';
import { stepper, WORK_STEP } from './steps';

/**
 * Flag duplicate works. Read-only: it groups the works of a file (the NWR, REV, ISW and EXC transactions) that look
 * like the same work, and says why each group was formed. It is a heuristic, so every group is informational
 * (`severity: 'info'`): two works can share a number on purpose (an NWR and the REV that revises it), and two different
 * works can share a title and writers.
 *
 * A work is grouped when
 *  - `work-number`: it has the same Submitter Work # as another (blank numbers are ignored), or
 *  - `iswc`: it has the same ISWC (letters upper-cased, dashes, dots and spaces dropped; blank and all-zero ISWCs are ignored), or
 *  - `title-and-writers`: its title and its set of writers match another's, ignoring case, accents, punctuation and spacing.
 *    A work with no named writer is not grouped this way, because there is nothing to compare besides the title.
 *
 * A work can appear in more than one group, one per reason. Members are listed in file order.
 */

export type DuplicateReason = 'work-number' | 'iswc' | 'title-and-writers';

export interface DuplicateMember {
  header: RecRef;
  /** 0-based physical line index of the work's header record. */
  line: number;
  recordType: string;
  title: string;
  workNumber: string;
  iswc: string;
  /** Index into `CwrDoc.file.groups`. */
  group: number;
}

export interface DuplicateGroup {
  reason: DuplicateReason;
  /** One sentence saying why these works are grouped, for a list row. */
  explanation: string;
  /** What the members share: the number, the ISWC, or the normalised title. */
  key: string;
  severity: Severity;
  /** Two or more works, in file order. */
  members: DuplicateMember[];
}

export interface DuplicateReport {
  /** Always `info`: the grouping is a heuristic. */
  severity: Severity;
  /** How many works were looked at. */
  worksChecked: number;
  groups: DuplicateGroup[];
}

const EXPLANATION: Record<DuplicateReason, string> = {
  'work-number': 'These works carry the same Submitter Work #.',
  iswc: 'These works carry the same ISWC.',
  'title-and-writers': 'These works have the same title and the same writers, ignoring case, accents and punctuation.',
};

/** Upper-case, accents and punctuation removed, runs of spaces collapsed. */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeIswcKey(raw: string): string {
  const s = raw.toUpperCase().replace(/[\s\-.]/g, '');
  return s === '' || /^T?0+$/.test(s) ? '' : s;
}

export function findDuplicates(doc: CwrDoc): DuplicateReport {
  return drain(findDuplicatesSteps(doc));
}

/**
 * `findDuplicates` as a generator, shaped like `checkSteps`: it yields a `Progress` (`task: 'duplicates'`) about every 256
 * transactions, with the stage `works` while it reads them and `groups` for the last step, and returns the same report
 * `findDuplicates` returns. The document is only read. A host that has to stay responsive gives the event loop a turn between
 * `next()` calls; stopping is not calling `next()` again (or `return()`), and leaves nothing behind.
 */
export function* findDuplicatesSteps(doc: CwrDoc, options: RunOptions = {}): Generator<Progress, DuplicateReport, void> {
  const step = stepper('duplicates', options);
  const total = doc.file.groups.reduce((sum, g) => sum + g.transactions.length, 0);
  yield step('works', 0, total, 0, 0.95);
  let seen = 0;
  const byNumber = new Map<string, DuplicateMember[]>();
  const byIswc = new Map<string, DuplicateMember[]>();
  const byTitle = new Map<string, DuplicateMember[]>();
  const titleOf = new Map<string, string>();
  const add = (map: Map<string, DuplicateMember[]>, key: string, member: DuplicateMember): void => {
    const list = map.get(key);
    if (list) list.push(member);
    else map.set(key, [member]);
  };

  let worksChecked = 0;
  for (let groupIndex = 0; groupIndex < doc.file.groups.length; groupIndex++) {
    const group = doc.file.groups[groupIndex]!;
    for (const txn of group.transactions) {
      seen++;
      if (seen % WORK_STEP === 0) yield step('works', seen, total, 0, 0.95);
      if (!WORK_HEADERS.has(doc.records[txn.header]!.type)) continue;
      worksChecked++;
      const summary = workSummary(doc, txn);
      const iswc = (getField(doc, txn.header, 'iswc') ?? '').trim();
      const member: DuplicateMember = {
        header: txn.header,
        line: summary.line,
        recordType: summary.recordType,
        title: summary.title,
        workNumber: summary.workNumber,
        iswc,
        group: groupIndex,
      };
      if (summary.workNumber !== '') add(byNumber, summary.workNumber, member);
      const iswcKey = normalizeIswcKey(iswc);
      if (iswcKey !== '') add(byIswc, iswcKey, member);

      const title = normalizeTitle(summary.title);
      const writers = new Set<string>();
      for (const party of summary.parties) {
        if (party.kind !== 'writer') continue;
        const name = normalizeTitle(`${party.name} ${party.firstName ?? ''}`);
        if (name !== '') writers.add(name);
      }
      if (title !== '' && writers.size > 0) {
        const key = `${title}\u0000${[...writers].sort().join('\u0001')}`;
        titleOf.set(key, title);
        add(byTitle, key, member);
      }
    }
  }

  const groups: DuplicateGroup[] = [];
  const collect = (map: Map<string, DuplicateMember[]>, reason: DuplicateReason, label: (key: string) => string): void => {
    for (const [key, members] of map) {
      if (members.length < 2) continue;
      groups.push({ reason, explanation: EXPLANATION[reason], key: label(key), severity: 'info', members });
    }
  };
  collect(byNumber, 'work-number', k => k);
  collect(byIswc, 'iswc', k => k);
  collect(byTitle, 'title-and-writers', k => titleOf.get(k) ?? k);
  groups.sort((a, b) => a.members[0]!.line - b.members[0]!.line || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));
  yield step('groups', 1, 1, 0.95, 1);
  return { severity: 'info', worksChecked, groups };
}

/**
 * Header refs of every work except the later members of a duplicate group: the first work of each group stays, the
 * others are left out. A work that is a later member of any group is left out. Pass the result to `extractWorks` to
 * write a file without the repeats. Transactions that are not works (AGR, ACK) are always kept.
 */
export function withoutLaterDuplicates(doc: CwrDoc, report: DuplicateReport = findDuplicates(doc)): RecRef[] {
  const drop = new Set<RecRef>();
  for (const group of report.groups) for (const member of group.members.slice(1)) drop.add(member.header);
  const keep: RecRef[] = [];
  for (const group of doc.file.groups) for (const txn of group.transactions) if (!drop.has(txn.header)) keep.push(txn.header);
  return keep;
}
