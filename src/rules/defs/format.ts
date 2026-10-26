import { getField } from '../../model/fields';
import { frEditFor } from '../fieldEdits';
import { fieldName, inAck22, isNewIn22, S21, S22, valueOf } from '../locate';
import { defineRule } from '../registry';
import type { RuleCtx, RuleDef, Severity } from '../types';
import { hasLowerCaseAt, isBlankAt, isDigitsAt, isRealDateAt, isRealTimeAt, isZerosAt } from '../util';

/**
 * Field-format rules, one implementation per format letter of the spec's legend (section 2.1.1). They run on
 * every field the record is long enough to hold. A field that STR-LEN says is cut is not checked here.
 *
 * Severity: data that breaks a field's format rule is an error. Where the record's own edit for the field is an FR edit
 * (the receiver drops the value and uses a default), the same finding is a warning and names the edit (`fieldEdits.ts`).
 *
 * A blank where the legend asks for zeroes (numeric, date and time fields with no data) is FMT-Z, a warning,
 * not FMT-N/FMT-D/FMT-T: the wording is "must", but the public sample and our own generator both leave such
 * fields blank, and no saved source says what receivers do with them.
 *
 * The rules look at the field's characters in place (`isBlankAt` and friends) and slice only to report.
 */

const BOTH = ['2.1', '2.2'] as const;
const FR_NOTE = ' Edit {edit} is an FR edit: a receiver drops the value and uses a default instead.';

/** Fields the spec says to leave blank or reserve; no format rule applies to them. */
function isFiller(id: string): boolean {
  return id === 'filler' || id.startsWith('constant');
}

function shown(v: string): string {
  const t = v.trim();
  return t.length > 24 ? t.slice(0, 24) + '...' : t;
}

interface Verdict {
  severity: Severity | undefined;
  edit: string | undefined;
  note: string;
}

/** Severity and edit key for a format or lookup finding on the current field. */
export function verdictFor(ctx: RuleCtx): Verdict {
  const f = ctx.field!;
  const layout = ctx.layout!.name;
  // NWR Duration: edit 7 (TR) when the work is SER, edit 8 (FR) otherwise.
  if (layout === 'NWR' && f.id === 'duration') {
    const cat = getField(ctx.doc, ctx.ref, 'musicalWorkDistributionCategory');
    if (cat !== undefined && cat.trim() === 'SER') return { severity: 'error', edit: 'NWR-F-007', note: '' };
  }
  const fr = frEditFor(ctx.version, layout, f.id);
  if (fr) return { severity: 'warning', edit: fr.edit, note: FR_NOTE };
  return { severity: undefined, edit: undefined, note: '' };
}

/** Reports on the current field's span with the field's spec name in the params. */
export function reportField(ctx: RuleCtx, message: string, params: Record<string, string | number> = {}, allowFr = true): void {
  const f = ctx.field!;
  const v = allowFr ? verdictFor(ctx) : { severity: undefined, edit: undefined, note: '' };
  const input: Parameters<RuleCtx['report']>[0] = {
    line: ctx.line,
    start: f.start,
    end: f.end,
    fieldId: f.id,
    params: { field: fieldName(ctx.version, ctx.layout, f.id), value: shown(valueOf(ctx)), ...params, ...(v.edit ? { edit: v.edit } : {}) },
    message: message + v.note,
  };
  if (v.severity) input.severity = v.severity;
  if (v.edit) input.edit = v.edit;
  ctx.report(input);
}

const fmtM = defineRule({
  id: 'FMT-M',
  title: 'Mandatory field is blank',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { reqs: ['M'] },
  message: '{field} is mandatory and is blank.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    // An EXC transaction describes a work that may not have come from CWR: the spec lets those edits be bypassed.
    if (ctx.inExc || isFiller(f.id)) return;
    // The spec lets an ACK in a 2.2 file leave out the 2.2 fields (see STR-LEN).
    if (inAck22(ctx) && isNewIn22(ctx.layout!.name, f.id)) return;
    const t = ctx.text;
    if (isBlankAt(t, f.start, f.end) || (f.format === 'D' && isZerosAt(t, f.start, f.end))) {
      reportField(ctx, '{field} is mandatory and is blank.', {}, false);
    }
  },
});

const fmtN = defineRule({
  id: 'FMT-N',
  title: 'Numeric field holds digits only',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['N'] },
  message: '{field} must be digits only.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    if (isFiller(f.id) || isDigitsAt(t, f.start, f.end) || isBlankAt(t, f.start, f.end)) return; // blank: FMT-M if mandatory, else FMT-Z
    // Show the characters as they are: a trimmed "5000" would hide that they are left justified in a field that wants "05000".
    const raw = valueOf(ctx);
    const digits = raw.trim();
    const padded = isDigitsAt(digits, 0, digits.length) && digits.length < raw.length;
    reportField(
      ctx,
      padded
        ? '{field} must hold digits only, with leading zeros filling the width; found "{raw}" (digits with spaces around them), which should be "{zeroFilled}".'
        : '{field} must hold digits only, with leading zeros filling the width; found "{raw}".',
      { raw: raw.length > 24 ? raw.slice(0, 24) + '...' : raw, zeroFilled: digits.padStart(raw.length, '0') },
    );
  },
});

const fmtZ = defineRule({
  id: 'FMT-Z',
  title: 'Numeric, date or time field with no data holds zeroes',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['N', 'D', 'T'], reqs: ['O', 'C'] },
  message: '{field} is blank. A field of this kind with no data must hold zeroes.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    if (isFiller(f.id) || !isBlankAt(ctx.text, f.start, f.end)) return;
    reportField(ctx, '{field} is blank. A numeric, date or time field with no data must hold zeroes.', {}, false);
  },
});

const fmtD = defineRule({
  id: 'FMT-D',
  title: 'Date is a real YYYYMMDD date',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['D'] },
  message: '{field} must be a date as YYYYMMDD.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    if (isRealDateAt(t, f.start) || isZerosAt(t, f.start, f.end) || isBlankAt(t, f.start, f.end)) return; // no date: zeroes (blank is FMT-Z's, a mandatory one FMT-M's)
    reportField(ctx, '{field} must be a real date as YYYYMMDD, or zeroes when there is none; found "{value}".');
  },
});

const TIME_OF_DAY = new Set(['HDR.creationTime', 'ACK.creationTime']);

const fmtT = defineRule({
  id: 'FMT-T',
  title: 'Time or duration is HHMMSS',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['T'] },
  message: '{field} must be a time or duration as HHMMSS.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    const timeOfDay = TIME_OF_DAY.has(`${ctx.layout!.name}.${f.id}`);
    if (isRealTimeAt(t, f.start, timeOfDay) || isBlankAt(t, f.start, f.end)) return; // blank: FMT-M if mandatory, else FMT-Z
    reportField(
      ctx,
      timeOfDay
        ? '{field} is a time of day: HHMMSS in 24 hour format with minutes and seconds under 60; found "{value}".'
        : '{field} must be HHMMSS with minutes and seconds under 60; found "{value}".',
    );
  },
});

const fmtB = defineRule({
  id: 'FMT-B',
  title: 'Boolean field is Y or N',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['B'] },
  message: '{field} must be Y or N.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    const c = ctx.text.charCodeAt(f.start);
    if (c === 89 || c === 78 || isBlankAt(ctx.text, f.start, f.end)) return; // blank: not entered (FMT-M if mandatory)
    reportField(ctx, '{field} must be Y or N; found "{value}".');
  },
});

const fmtF = defineRule({
  id: 'FMT-F',
  title: 'Flag field is Y, N or U',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['F'] },
  message: '{field} must be Y, N or U.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    const c = ctx.text.charCodeAt(f.start);
    if (c === 89 || c === 78 || c === 85 || isBlankAt(ctx.text, f.start, f.end)) return;
    reportField(ctx, '{field} must be Y, N or U; found "{value}".');
  },
});

// Most lines have no lower-case letter at all, and a regex over the line is much cheaper than a loop over each
// alphabetic field. The result is remembered for the record being checked (its fields come one after another).
const LOWER_OR_NON_ASCII = /[a-z\u0080-\uffff]/;
let ucLastText = '';
let ucLastMaybe = false;

const fmtUc = defineRule({
  id: 'FMT-UC',
  title: 'Alphabetic fields are upper case',
  severity: 'error',
  scope: 'field',
  versions: BOTH,
  fields: { formats: ['A'] },
  message: '{field} has lower-case letters; alphabetic fields hold upper-case letters only.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    if (ctx.text !== ucLastText) {
      ucLastText = ctx.text;
      ucLastMaybe = LOWER_OR_NON_ASCII.test(ucLastText);
    }
    if (!ucLastMaybe) return;
    if (hasLowerCaseAt(ctx.text, f.start, f.end)) {
      reportField(ctx, '{field} has lower-case letters; alphabetic fields hold upper-case letters only. Found "{value}".', {}, false);
    }
  },
});

export const FORMAT_RULES: readonly RuleDef[] = [fmtM, fmtN, fmtZ, fmtD, fmtT, fmtB, fmtF, fmtUc];
