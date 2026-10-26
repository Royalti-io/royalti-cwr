import { LOOKUPS } from '../../spec/lookups/index';
import type { LookupTable } from '../../spec/lookups/types';
import { CRF, L30, S21, S22, valueOf } from '../locate';
import { defineRule } from '../registry';
import type { RuleDef } from '../types';
import { isBlankAt } from '../util';
import { reportField } from './format';

/**
 * Lookup rules: every field the spec names a table for, against that table (src/spec/lookups).
 *
 * LKP-TBL    value not in its table: error (the record's edit says TR, RR or FR; FR is a warning, see fieldEdits.ts).
 * LKP-SOC    society code in neither CRF020 nor the 3.0 transmitter list: warning. The two lists disagree on 57
 *            societies, and neither source says which receivers use.
 * LKP-TIS    TIS code not in the saved TIS list: info. The saved list omits countries,
 *            and the engine must not reject a territory the list merely lacks.
 * LKP-RET    code that is in the table but marked as no longer valid: warning.
 *
 * Fields with no table are not checked. Blank is "not entered": FMT-M reports a mandatory blank.
 * The record-type field is STR-F-001's.
 */

const BOTH = ['2.1', '2.2'] as const;
const TABLES = LOOKUPS as Readonly<Record<string, LookupTable>>;

/**
 * Values the spec's edit allows and the saved table lacks. ARI Type of Right: CRF020 lists MEC, PER and SYN only, and the
 * edit reads: [S: cisac/cwr-functional-spec-2-1] "ALL" for all.
 *
 */
const EXTRA_CODES: Readonly<Record<string, readonly string[]>> = { typeOfRight: ['ALL'] };

function humanize(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const retired = new Map<string, Map<string, string>>();
function retiredIn(id: string): Map<string, string> {
  let m = retired.get(id);
  if (!m) {
    m = new Map();
    const table = TABLES[id];
    if (table) for (const row of table.rows) if (row.status !== undefined && row.status.split(' ').includes('retired')) m.set(row.code, row.description);
    retired.set(id, m);
  }
  return m;
}

const lkpTbl = defineRule({
  id: 'LKP-TBL',
  title: 'Value is in its lookup table',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { lookup: true, excludeLookupIds: ['societyCode', 'tis', 'recordType'] },
  message: '{field} "{value}" is not in the {table} table.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: CRF, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    const table = TABLES[f.lookup!];
    if (!table || isBlankAt(ctx.text, f.start, f.end)) return;
    const value = valueOf(ctx).trim();
    if (table.has(value) || EXTRA_CODES[f.lookup!]?.includes(value)) return;
    const borrowed = table.rows[0]?.scope === '3.0-borrowed';
    reportField(
      ctx,
      '{field} "{value}" is not in the {table} table.' + (borrowed ? ' CRF020 has no such table; this one is taken from the CWR 3.0 lookup tables.' : ''),
      { table: humanize(f.lookup!) },
    );
  },
});

const lkpSoc = defineRule({
  id: 'LKP-SOC',
  title: 'Society code is in a saved society list',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { lookupIds: ['societyCode'] },
  message:
    '{field} "{value}" is in neither the CRF020 society code table nor the CWR 3.0 transmitter code list. ' +
    'The two lists disagree on some societies, so this is a warning.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: CRF, quote: '' },
    { slug: L30, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    if (isBlankAt(ctx.text, f.start, f.end)) return;
    const code = valueOf(ctx).trim();
    if (TABLES.societyCode!.has(code) || TABLES.transmitterCode!.has(code)) return;
    reportField(ctx, lkpSoc.message, {}, false);
  },
});

const lkpTis = defineRule({
  id: 'LKP-TIS',
  title: 'TIS code is in the saved TIS list',
  severity: 'info',
  scope: 'field',
  versions: BOTH,
  fields: { lookupIds: ['tis'] },
  message:
    '{field} "{value}" is not in the TIS list saved from the CWR 3.0 lookup tables. That list is known to omit some countries, ' +
    'so this is a note and not an error.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: L30, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    if (isBlankAt(ctx.text, f.start, f.end) || TABLES.tis!.has(valueOf(ctx).trim())) return;
    reportField(ctx, lkpTis.message, {}, false);
  },
});

const lkpRet = defineRule({
  id: 'LKP-RET',
  title: 'Code is not marked as retired',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { lookup: true, excludeLookupIds: ['recordType', 'tis'] },
  message: '{field} "{value}" is marked in the {table} table as retired.',
  source: { slug: CRF, quote: '' },
  alsoSource: [
    { slug: CRF, quote: '' },
    { slug: CRF, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    const retiredCodes = retiredIn(f.lookup!);
    if (retiredCodes.size === 0 || isBlankAt(ctx.text, f.start, f.end)) return;
    const code = valueOf(ctx).trim();
    const description = retiredCodes.get(code);
    if (description === undefined) return;
    reportField(ctx, lkpRet.message, { table: humanize(f.lookup!), description: description.replace(/\s+/g, ' ') }, false);
  },
});

export const LOOKUP_RULES: readonly RuleDef[] = [lkpTbl, lkpSoc, lkpTis, lkpRet];
