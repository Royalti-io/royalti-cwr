import { findField } from '../../model/fields';
import type { FieldDef } from '../../model/types';
import { fieldName, S21, S22 } from '../locate';
import { defineRule } from '../registry';
import type { RuleCtx, RuleDef } from '../types';
import { isBlankAt, isDigitsAt, isZerosAt } from '../util';

/**
 * Conditional requirements the spec states in machine-checkable form: "...", "...". A field counts as entered when it holds something
 * other than spaces (or zeroes, for numeric, date and time fields). Each rule skips a record that is too
 * short to reach its fields (STR-LEN reports that) and skips EXC transactions, where the spec allows the
 * mandatory-field edits to be bypassed.
 *
 * Each rule reads its trigger field first and the field it requires only when the trigger holds, and reads
 * in place, so a record that satisfies the rule costs a few character comparisons.
 *
 * A condition the spec states that these rules leave out is not checked.
 */

const BOTH = ['2.1', '2.2'] as const;

/** A field of the current record, or undefined when the record has no such field or is too short to hold it. */
function fld(ctx: RuleCtx, id: string): FieldDef | undefined {
  const layout = ctx.layout;
  if (!layout) return undefined;
  const f = findField(layout, id);
  return f && f.end <= ctx.text.length ? f : undefined;
}

/** Nothing entered: spaces, or zeroes in a numeric, date or time field. */
function isEmpty(ctx: RuleCtx, f: FieldDef): boolean {
  const t = ctx.text;
  if (isBlankAt(t, f.start, f.end)) return true;
  return (f.format === 'N' || f.format === 'D' || f.format === 'T') && isZerosAt(t, f.start, f.end);
}

/** The field holds exactly `code` (a code as wide as its field, or padded with spaces). */
function is(ctx: RuleCtx, f: FieldDef, code: string): boolean {
  const t = ctx.text;
  if (!t.startsWith(code, f.start)) return false;
  return isBlankAt(t, f.start + code.length, f.end);
}

function missing(ctx: RuleCtx, f: FieldDef, params: Record<string, string | number> = {}): void {
  ctx.report({
    line: ctx.line,
    start: f.start,
    end: f.end,
    fieldId: f.id,
    params: { field: fieldName(ctx.version, ctx.layout, f.id), ...params },
  });
}

const spuF002 = defineRule({
  id: 'SPU-F-002',
  title: 'SPU has an Interested Party #',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SPU'],
  specAction: 'TR',
  cisac: 'SPU F 002',
  message: 'This SPU record has no Interested Party #.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'interestedPartyNumber');
    if (f && !ctx.inExc && isEmpty(ctx, f)) missing(ctx, f);
  },
});

const spuF004 = defineRule({
  id: 'SPU-F-004',
  title: 'Publisher Name is entered',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SPU', 'OPU'],
  specAction: 'TR',
  cisac: 'SPU F 004',
  message: 'Publisher Name must be entered on an SPU record, and on an OPU record unless Publisher Unknown Indicator is Y.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'publisherName');
    if (!f || ctx.inExc || !isEmpty(ctx, f)) return;
    if (ctx.rec.type === 'OPU') {
      const unknown = fld(ctx, 'publisherUnknownIndicator');
      if (!unknown || is(ctx, unknown, 'Y')) return;
    }
    missing(ctx, f);
  },
});

const spuF005 = defineRule({
  id: 'SPU-F-005',
  title: 'SPU has a Publisher Type',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SPU'],
  specAction: 'TR',
  cisac: 'SPU F 005',
  message: 'Publisher Type must be entered on an SPU record.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'publisherType');
    if (f && !ctx.inExc && isEmpty(ctx, f)) missing(ctx, f);
  },
});

const spuF007 = defineRule({
  id: 'SPU-F-007',
  title: 'SPU leaves Publisher Unknown Indicator blank',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SPU'],
  specAction: 'TR',
  cisac: 'SPU F 007',
  message: 'Publisher Unknown Indicator must be blank on an SPU record; found "{value}".',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'publisherUnknownIndicator');
    if (f && !isBlankAt(ctx.text, f.start, f.end)) missing(ctx, f, { value: ctx.text.slice(f.start, f.end) });
  },
});

const swrF001 = defineRule({
  id: 'SWR-F-001',
  title: 'SWR has an Interested Party #',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SWR'],
  specAction: 'TR',
  cisac: 'SWR F 001',
  message: 'This SWR record has no Interested Party #.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'interestedPartyNumber');
    if (f && !ctx.inExc && isEmpty(ctx, f)) missing(ctx, f);
  },
});

const swrF003 = defineRule({
  id: 'SWR-F-003',
  title: 'Writer Last Name is entered',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SWR', 'OWR'],
  specAction: 'TR',
  cisac: 'SWR F 003',
  message: 'Writer Last Name must be entered on an SWR record, and on an OWR record unless Writer Unknown Indicator is Y.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'writerLastName');
    if (!f || ctx.inExc || !isEmpty(ctx, f)) return;
    if (ctx.rec.type === 'OWR') {
      const unknown = fld(ctx, 'writerUnknownIndicator');
      if (!unknown || is(ctx, unknown, 'Y')) return;
    }
    missing(ctx, f);
  },
});

const swrF004 = defineRule({
  id: 'SWR-F-004',
  title: 'SWR leaves Writer Unknown Indicator blank',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SWR'],
  specAction: 'TR',
  cisac: 'SWR F 004',
  message: 'Writer Unknown Indicator must be blank on an SWR record; found "{value}".',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'writerUnknownIndicator');
    if (f && !isBlankAt(ctx.text, f.start, f.end)) missing(ctx, f, { value: ctx.text.slice(f.start, f.end) });
  },
});

const swrF007 = defineRule({
  id: 'SWR-F-007',
  title: 'SWR has a Writer Designation Code',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['SWR'],
  specAction: 'TR',
  cisac: 'SWR F 007',
  message: 'Writer Designation Code must be entered on an SWR record.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'writerDesignationCode');
    if (f && !ctx.inExc && isEmpty(ctx, f)) missing(ctx, f);
  },
});

const nwrF007 = defineRule({
  id: 'NWR-F-007',
  title: 'SER work has a duration',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR F 007',
  message: 'A work in the SER distribution category needs a duration above zero.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const cat = fld(ctx, 'musicalWorkDistributionCategory');
    if (!cat || !is(ctx, cat, 'SER')) return;
    // Any entered value is FMT-T's to judge; this rule is the zero (or blank) duration.
    const dur = fld(ctx, 'duration');
    if (dur && isEmpty(ctx, dur)) missing(ctx, dur);
  },
});

const nwrF014 = defineRule({
  id: 'NWR-F-014',
  title: 'MOD version has a Music Arrangement',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR F 014',
  message: 'Music Arrangement must be entered when the Version Type is MOD.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const v = fld(ctx, 'versionType');
    if (!v || !is(ctx, v, 'MOD')) return;
    const r = fld(ctx, 'musicArrangement');
    if (r && isEmpty(ctx, r)) missing(ctx, r);
  },
});

const nwrF015 = defineRule({
  id: 'NWR-F-015',
  title: 'MOD version has a Lyric Adaptation',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR F 015',
  message: 'Lyric Adaptation must be entered when the Version Type is MOD.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const v = fld(ctx, 'versionType');
    if (!v || !is(ctx, v, 'MOD')) return;
    const r = fld(ctx, 'lyricAdaptation');
    if (r && isEmpty(ctx, r)) missing(ctx, r);
  },
});

const nwrF018 = defineRule({
  id: 'NWR-F-018',
  title: 'Composite Type needs a Component Count',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR F 018',
  message: 'Composite Component Count must be entered when Composite Type is entered.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const t = fld(ctx, 'compositeType');
    if (!t || isEmpty(ctx, t)) return;
    const c = fld(ctx, 'compositeComponentCount');
    if (c && isEmpty(ctx, c)) missing(ctx, c);
  },
});

const nwrF019 = defineRule({
  id: 'NWR-F-019',
  title: 'Component Count needs a Composite Type',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR F 019',
  message: 'Composite Type must be entered when Composite Component Count is entered.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const c = fld(ctx, 'compositeComponentCount');
    if (!c || isEmpty(ctx, c)) return;
    const t = fld(ctx, 'compositeType');
    if (t && isEmpty(ctx, t)) missing(ctx, t);
  },
});

const nwrF020 = defineRule({
  id: 'NWR-F-020',
  title: 'Component Count is greater than 1',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NWR', 'REV', 'ISW'],
  specAction: 'TR',
  cisac: 'NWR F 020',
  message: 'A composite work needs a Composite Component Count of 2 or more; found {value}.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    // Non-digits are FMT-N's. A count of zero is "not entered".
    const c = fld(ctx, 'compositeComponentCount');
    if (!c || isEmpty(ctx, c) || !isDigitsAt(ctx.text, c.start, c.end)) return;
    const n = Number(ctx.text.slice(c.start, c.end));
    if (n <= 1) missing(ctx, c, { value: n });
  },
});

const altF006 = defineRule({
  id: 'ALT-F-006',
  title: 'OL and AL titles carry a language',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['ALT'],
  specAction: 'RR',
  cisac: 'ALT F 006',
  message: 'A title of type OL or AL has no Language Code.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.inExc) return;
    const t = fld(ctx, 'titleType');
    if (!t || !(is(ctx, t, 'OL') || is(ctx, t, 'AL'))) return;
    const l = fld(ctx, 'languageCode');
    if (l && isEmpty(ctx, l)) missing(ctx, l);
  },
});

const ornF004 = defineRule({
  id: 'ORN-F-004',
  title: 'LIB origin has a CD Identifier',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['ORN'],
  specAction: 'RR',
  cisac: 'ORN F 004',
  message: 'CD Identifier is required when the Intended Purpose is LIB.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.inExc) return;
    const p = fld(ctx, 'intendedPurpose');
    if (!p || !is(ctx, p, 'LIB')) return;
    const c = fld(ctx, 'cdIdentifier');
    if (c && isEmpty(ctx, c)) missing(ctx, c);
  },
});

const ornF010 = defineRule({
  id: 'ORN-F-010',
  title: 'ORN has a Production Title or Library',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['ORN'],
  specAction: 'RR',
  cisac: 'ORN F 010',
  message: 'An ORN record needs either a Production Title or a Library.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.inExc) return;
    const t = fld(ctx, 'productionTitle');
    const l = fld(ctx, 'library');
    if (t && l && isEmpty(ctx, t) && isEmpty(ctx, l)) missing(ctx, t);
  },
});

const ornF013 = defineRule({
  id: 'ORN-F-013',
  title: 'FIL and TEL origins have a Production Title',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['ORN'],
  specAction: 'TR',
  cisac: 'ORN F 013',
  message: 'Production Title must be entered when the Intended Purpose is FIL or TEL.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.inExc) return;
    const p = fld(ctx, 'intendedPurpose');
    if (!p || !(is(ctx, p, 'FIL') || is(ctx, p, 'TEL'))) return;
    const t = fld(ctx, 'productionTitle');
    if (t && isEmpty(ctx, t)) missing(ctx, t);
  },
});

const recF001 = defineRule({
  id: 'REC-F-001',
  title: 'REC carries at least one value',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['REC'],
  specAction: 'RR',
  cisac: 'REC F 001',
  message: 'A REC record must have at least one of its optional fields entered; this one has none.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const layout = ctx.layout;
    if (!layout || ctx.inExc) return;
    const t = ctx.text;
    for (const f of layout.fields) {
      if (f.start < 19 || f.id === 'filler' || f.id.startsWith('constant')) continue; // the 19-character prefix; fields that must be blank
      if (f.start >= t.length) break;
      const end = Math.min(f.end, t.length);
      if (isBlankAt(t, f.start, end)) continue;
      if ((f.format === 'N' || f.format === 'D' || f.format === 'T') && isZerosAt(t, f.start, end)) continue;
      return;
    }
    ctx.report({ line: ctx.line, start: 0, end: Math.min(3, ctx.text.length), params: {} });
  },
});

const nprF005 = defineRule({
  id: 'NPR-F-005',
  title: 'NPR names an artist, a language or a dialect',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['NPR'],
  specAction: 'RR',
  cisac: 'NPR F 005',
  message: 'An NPR record names no artist, no language and no dialect; it needs at least one of them.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.inExc) return;
    const a = fld(ctx, 'performingArtistName');
    const l = fld(ctx, 'performanceLanguage');
    const d = fld(ctx, 'performanceDialect');
    if (a && l && d && isEmpty(ctx, a) && isEmpty(ctx, l) && isEmpty(ctx, d)) missing(ctx, a);
  },
});

const ariR001 = defineRule({
  id: 'ARI-R-001',
  title: 'ARI has a Work # or a Note',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['ARI'],
  specAction: 'RR',
  cisac: 'ARI R 001',
  message: 'An ARI record has no Work # and no Note; it needs one of them.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    if (ctx.inExc) return;
    const w = fld(ctx, 'workNumber');
    const n = fld(ctx, 'note');
    if (w && n && isEmpty(ctx, w) && isEmpty(ctx, n)) missing(ctx, w);
  },
});

const ackF009 = defineRule({
  id: 'ACK-F-009',
  title: 'Creation Title on an ACK for a work',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['ACK'],
  specAction: 'TR',
  cisac: 'ACK F 009',
  message: 'This ACK answers an NWR or REV transaction but carries no Creation Title.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const o = fld(ctx, 'originalTransactionType');
    if (!o || !(is(ctx, o, 'NWR') || is(ctx, o, 'REV'))) return;
    const t = fld(ctx, 'creationTitle');
    if (t && isEmpty(ctx, t)) missing(ctx, t);
  },
});

const hdrF002 = defineRule({
  id: 'HDR-F-002',
  title: 'Sender Type is PB, SO, WR or AA, or two digits',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['HDR'],
  specAction: 'ER',
  cisac: 'HDR F 002',
  message: 'Sender Type must be PB, SO, WR or AA, or two digits when it carries the leading digits of an 11-digit sender number; found "{value}".',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = fld(ctx, 'senderType');
    if (!f) return;
    const v = ctx.text.slice(f.start, f.end);
    if (v === 'PB' || v === 'SO' || v === 'WR' || v === 'AA' || isDigitsAt(ctx.text, f.start, f.end)) return;
    missing(ctx, f, { value: v });
  },
});

const hdrF009 = defineRule({
  id: 'HDR-F-009',
  title: 'EDI Standard Version Number is 01.10',
  severity: 'error',
  scope: 'record',
  versions: BOTH,
  records: ['HDR'],
  specAction: 'ER',
  cisac: 'HDR F 009',
  message: 'EDI Standard Version Number is "{value}", and 01.10 is the only value accepted.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = fld(ctx, 'ediStandardVersionNumber');
    if (f && !ctx.text.startsWith('01.10', f.start)) missing(ctx, f, { value: ctx.text.slice(f.start, f.end).trim() });
  },
});

export const CONDITIONAL_RULES: readonly RuleDef[] = [
  hdrF002, hdrF009,
  spuF002, spuF004, spuF005, spuF007,
  swrF001, swrF003, swrF004, swrF007,
  nwrF007, nwrF014, nwrF015, nwrF018, nwrF019, nwrF020,
  altF006, ornF004, ornF010, ornF013, recF001, nprF005, ariR001, ackF009,
];
