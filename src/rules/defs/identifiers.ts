import { allFields } from '../../spec/index';
import { S21, S22, valueOf } from '../locate';
import { defineRule } from '../registry';
import type { Citation, RuleCtx, RuleDef } from '../types';
import { isBlankAt, isDigitsAt, isZerosAt } from '../util';

/**
 * Identifiers: IPI name and base numbers, ISWC and EAN, and the IPI number a numeric Sender Type spells out.
 *
 * What the cited sources do and do not say:
 *  - They give the shape of an IP Name Number (11 digits) and an IP Base Number (13 characters, I-NNNNNNNNN-C),
 *    in GEMA's "What is which number" page, and the shape of an ISWC (T and ten digits) in CISAC's ISWC REST specification.
 *    Those are the format rules. A value that is entered but not in that shape is an FR finding (the field is dropped), so a warning.
 *  - They do not give any check-digit weights: not for the IPI name number, the IPI base number, the ISWC or the EAN, and
 *    nothing at all for an ISRC's shape. (The CWR User Manual 2011 does give the moduli of the two IPI numbers, and the base
 *    number's "I weight = 2"; it is cited on those rules.) The IPI name and base number check digits are implemented as SECONDARY-SOURCE
 *    warnings, ported from the IPI validation code in Royalti's server, which says it follows
 *    django-music-publisher's `check_ipi_digit` and `check_iswc_digit`. They carry `secondary: true`, their `source` names that
 *    file under the slug `secondary/ipi-check-digits`, and it is a
 *    code file, not a CISAC document. They are never presented as the specification.
 *  - ISWC and EAN check digits, and the ISRC shape, are not implemented. See docs/RULES.md.
 *
 * A value of all spaces or all zeroes is "not entered" and is never reported here.
 */

const BOTH = ['2.1', '2.2'] as const;
const GEMA = 'gema/what-which-number';
const ISWC_USAGE = 'iswc/iswc-usage';
const ISWC_PAGE = 'iswc/iswc-page';
export const SECONDARY_IPI = 'secondary/ipi-check-digits';

const IPI_NAME_QUOTE = '';
const IPI_BASE_QUOTE = '';

function idsMatching(re: RegExp): string[] {
  const out = new Set<string>();
  for (const v of ['2.1', '2.2'] as const) for (const f of allFields(v)) if (re.test(f.id)) out.add(f.id);
  return [...out].sort();
}

/** Every spec field that holds an IPI name number or an IPI base number, in either version. */
export const IPI_NAME_IDS: readonly string[] = idsMatching(/IpiNameNumber$/);
export const IPI_BASE_IDS: readonly string[] = idsMatching(/^ipiBaseNumber$|IpiBaseNumber$/);

/** Check digits of an IPI name number, from its first nine digits: weights 10 to 2, modulo 101. */
export function ipiNameCheckDigits(body9: string): string {
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(body9[i]) * (10 - i);
  total %= 101;
  if (total !== 0) total = (101 - total) % 100;
  return String(total).padStart(2, '0');
}

/** Check digit of an IPI base number, from its nine body digits: 2 + the sum of position times digit, then 10 minus that modulo 10. */
export function ipiBaseCheckDigit(body9: string): number {
  let total = 2;
  for (let i = 0; i < 9; i++) total += (i + 1) * Number(body9[i]);
  return (10 - (total % 10)) % 10;
}

const USER_MANUAL = 'cisac/cwr-user-manual-2011';
const NAME_MODULUS_QUOTE = '';
const BASE_MODULUS_QUOTE = '';

const SECONDARY_NOTE =
  ' The CWR User Manual (2011) gives the modulus (101 for the name number; 10 for the base number, with I weighted 2), but the weights rest on a secondary source ' +
  '(django-music-publisher, as ported in the Royalti server), not on a CISAC document, ' +
  'so this is a warning; a society’s IPI database has the last word.';

const ipiNameFmt = defineRule({
  id: 'ID-IPI-FMT',
  title: 'IPI Name # is 11 digits',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { ids: IPI_NAME_IDS },
  specAction: 'FR',
  message:
    '{field} "{value}" is not 11 digits. GEMA says check digits make up the last two of the 11; ' +
    'under the specification an entered number missing from the IPI database is rejected (FR) and left blank.',
  source: { slug: GEMA, quote: IPI_NAME_QUOTE },
  alsoSource: [{ slug: S21, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    if (isBlankAt(t, f.start, f.end) || isZerosAt(t, f.start, f.end) || isDigitsAt(t, f.start, f.end)) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: nameOf(ctx), value: valueOf(ctx).trim() } });
  },
});

const ipiNameChk = defineRule({
  id: 'ID-IPI-CHK',
  title: 'IPI Name # check digits (secondary source)',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { ids: IPI_NAME_IDS },
  secondary: true,
  message: '{field} {value} ends in check digits {found}; the algorithm in django-music-publisher gives {expected} for its first nine digits.' + SECONDARY_NOTE,
  source: {
    slug: SECONDARY_IPI,
    quote:
      '',
  },
  alsoSource: [{ slug: GEMA, quote: IPI_NAME_QUOTE }, { slug: USER_MANUAL, quote: NAME_MODULUS_QUOTE }],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    if (!isDigitsAt(t, f.start, f.end) || isZerosAt(t, f.start, f.end) || f.end - f.start !== 11) return;
    const value = t.slice(f.start, f.end);
    const expected = ipiNameCheckDigits(value);
    if (expected === value.slice(9)) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: nameOf(ctx), value, found: value.slice(9), expected } });
  },
});

const BASE_RE = /^I-\d{9}-\d$/;

const ipiBaseFmt = defineRule({
  id: 'ID-IPIB-FMT',
  title: 'IPI Base # is I-NNNNNNNNN-C',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { ids: IPI_BASE_IDS },
  specAction: 'FR',
  message:
    '{field} "{value}" is not in the form I-NNNNNNNNN-C. GEMA gives its length as 13 characters, with two hyphens setting off nine digits between the I and the check digit; ' +
    'under the specification an entered base number missing from the IPI database is rejected (FR).',
  source: { slug: GEMA, quote: IPI_BASE_QUOTE },
  alsoSource: [{ slug: S21, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    if (isBlankAt(t, f.start, f.end) || BASE_RE.test(t.slice(f.start, f.end))) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: nameOf(ctx), value: valueOf(ctx).trim() } });
  },
});

const ipiBaseChk = defineRule({
  id: 'ID-IPIB-CHK',
  title: 'IPI Base # check digit (secondary source)',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  fields: { ids: IPI_BASE_IDS },
  secondary: true,
  message: '{field} {value} ends in check digit {found}; the algorithm in django-music-publisher gives {expected} for its nine digits.' + SECONDARY_NOTE,
  source: {
    slug: SECONDARY_IPI,
    quote:
      '',
  },
  alsoSource: [{ slug: GEMA, quote: IPI_BASE_QUOTE }, { slug: USER_MANUAL, quote: BASE_MODULUS_QUOTE }],
  run(ctx) {
    const f = ctx.field!;
    const value = ctx.text.slice(f.start, f.end);
    if (!BASE_RE.test(value)) return; // ID-IPIB-FMT's
    const expected = ipiBaseCheckDigit(value.slice(2, 11));
    if (expected === Number(value[12])) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: nameOf(ctx), value, found: value[12]!, expected } });
  },
});

function nameOf(ctx: RuleCtx): string {
  const f = ctx.field!;
  // The spec's wording, not the id: "Writer IPI Name #".
  const spec = allFields(ctx.version).find(x => x.id === f.id && ctx.layout !== null && x.record === ctx.layout.name);
  return spec ? spec.name : f.id;
}

const hdrSenderIpi = defineRule({
  id: 'HDR-F-SENDER-IPI',
  title: 'A numeric Sender Type and the Sender ID spell an IPI Name # (secondary source)',
  severity: 'warning',
  scope: 'record',
  versions: BOTH,
  records: ['HDR'],
  secondary: true,
  message:
    'Sender Type "{type}" and Sender ID "{id}" together read as the IPI Name # {value}, which ends in check digits {found}; the algorithm in django-music-publisher gives {expected}.' +
    SECONDARY_NOTE,
  source: {
    slug: SECONDARY_IPI,
    quote:
      '',
  },
  alsoSource: [
    { slug: S21, quote: '' },
    { slug: S22, quote: '' },
    { slug: GEMA, quote: IPI_NAME_QUOTE },
    { slug: USER_MANUAL, quote: NAME_MODULUS_QUOTE },
  ],
  run(ctx) {
    const layout = ctx.layout;
    if (!layout) return;
    const t = ctx.text;
    // Sender Type is characters 4-5 and Sender ID 6-14 (0-based 3..5 and 5..14).
    if (t.length < 14 || !isDigitsAt(t, 3, 5) || !isDigitsAt(t, 5, 14)) return;
    const value = t.slice(3, 14);
    if (value === '00000000000') return;
    const expected = ipiNameCheckDigits(value);
    if (expected === value.slice(9)) return;
    ctx.report({ line: ctx.line, start: 3, end: 14, fieldId: 'senderId', params: { type: t.slice(3, 5), id: t.slice(5, 14), value, found: value.slice(9), expected } });
  },
});

// ------------------------------------------------------------------ ISWC and EAN

const ISWC_RE = /^[Tt]\d{10}$/;

function iswcRule(id: string, record: string, fieldId: string, quote: string, label: string): RuleDef {
  const cite: Citation[] = [
    { slug: S22, quote },
    { slug: ISWC_USAGE, quote: '' },
    { slug: ISWC_PAGE, quote: '' },
  ];
  return defineRule({
    id,
    title: `${label} is T and ten digits`,
    severity: 'warning',
    scope: 'field',
    versions: BOTH,
    records: [record],
    fields: { ids: [fieldId] },
    specAction: 'FR',
    cisac: id.replace(/-/g, ' '),
    message:
      '{field} "{value}" is not the letter T followed by ten digits (nine digits and a check digit). The specification rejects an entered ISWC that is not a correct one (FR): the field is dropped. ' +
      'This tool checks the shape only, not the check digit.',
    source: { slug: S21, quote },
    alsoSource: cite,
    run(ctx) {
      const f = ctx.field!;
      const t = ctx.text;
      if (isBlankAt(t, f.start, f.end) || ISWC_RE.test(t.slice(f.start, f.end))) return;
      ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: nameOf(ctx), value: valueOf(ctx).trim() } });
    },
  });
}

const nwrF004 = iswcRule('NWR-F-004', 'NWR', 'iswc', '', 'ISWC');
const ewtF002 = iswcRule('EWT-F-002', 'EWT', 'iswcOfEntireWork', '', 'ISWC of Entire Work');
const verF002 = iswcRule('VER-F-002', 'VER', 'iswcOfOriginalWork', '', 'ISWC of Original Work');
const comF002 = iswcRule('COM-F-002', 'COM', 'iswcOfComponent', '', 'ISWC of Component');

const recF009 = defineRule({
  id: 'REC-F-009',
  title: 'EAN is 13 digits',
  severity: 'warning',
  scope: 'field',
  versions: BOTH,
  records: ['REC'],
  fields: { ids: ['ean'] },
  specAction: 'FR',
  cisac: 'REC F 009',
  message:
    '{field} "{value}" is not 13 digits. The specification calls the field a European Article Number (EAN-13) and rejects an entered EAN that is not a correct one (FR): the field is dropped. ' +
    'This tool checks that the 13 characters are digits, and does not check the check digit.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const f = ctx.field!;
    const t = ctx.text;
    if (isBlankAt(t, f.start, f.end) || isDigitsAt(t, f.start, f.end)) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { field: nameOf(ctx), value: valueOf(ctx).trim() } });
  },
});

export const IDENTIFIER_RULES: readonly RuleDef[] = [ipiNameFmt, ipiNameChk, ipiBaseFmt, ipiBaseChk, hdrSenderIpi, nwrF004, ewtF002, verF002, comF002, recF009];
