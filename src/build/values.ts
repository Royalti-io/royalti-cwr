/**
 * Reading single cells. Each parser takes the text of a cell and gives back either the value in the form the file needs or a plain
 * description of what is wrong. The checks and the builder share these, so a cell that passes the checks is a cell the builder can write.
 */

import { crossesScript } from '../write/edit';
import { identifierCheck, normalizeIpiName, normalizeIsrc, normalizeIswc } from '../tools/clean-ids';
import { LOOKUPS } from '../spec/lookups/index';
import { isSavedGroup } from '../rules/work';
import { isRealDate } from '../rules/util';
import { ROW_TYPES } from './template';
import type { RowType } from './template';

export interface Note {
  code: string;
  message: string;
}

export type Parsed<T> = { ok: true; value: T; warning?: Note } | { ok: false; code: string; message: string };

const ok = <T>(value: T, warning?: Note): Parsed<T> => (warning ? { ok: true, value, warning } : { ok: true, value });
const bad = <T>(code: string, message: string): Parsed<T> => ({ ok: false, code, message });

// ------------------------------------------------------------------ row type

const ROW_TYPE_NAMES: ReadonlyMap<string, RowType> = new Map<string, RowType>([
  ...ROW_TYPES.map(t => [t, t] as [string, RowType]),
  ['ALTERNATIVE TITLE', 'ALT TITLE'],
  ['ALT', 'ALT TITLE'],
  ['ARTIST', 'PERFORMER'],
]);

export function parseRowType(raw: string): RowType | null {
  const key = raw.toUpperCase().replace(/[\s_\-]+/g, ' ').trim();
  return ROW_TYPE_NAMES.get(key) ?? null;
}

// ------------------------------------------------------------------ yes / no

export function parseFlag(raw: string): boolean | null {
  const v = raw.trim().toUpperCase();
  if (v === 'Y' || v === 'YES' || v === 'TRUE' || v === '1') return true;
  if (v === 'N' || v === 'NO' || v === 'FALSE' || v === '0') return false;
  return null;
}

// ------------------------------------------------------------------ shares

/**
 * A share as a percentage to hundredths: "33.33" gives 3333. A trailing percent sign is allowed, and a comma works as the decimal
 * point when there is no dot. More than two decimal places are refused unless the extra ones are zeros, because the file holds
 * hundredths of a percent and rounding would change the total.
 */
export function parseShare(raw: string): Parsed<number> {
  let v = raw.trim().replace(/\s*%$/, '');
  if (v === '') return ok(0);
  if (!v.includes('.') && /^\d+,\d+$/.test(v)) v = v.replace(',', '.');
  const m = /^(\d{1,3})(?:\.(\d*))?$/.exec(v);
  if (!m) return bad('bad-share', `"${raw.trim()}" is not a percentage. Write a number such as 50 or 33.33.`);
  const frac = m[2] ?? '';
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) {
    return bad('bad-share', `"${raw.trim()}" has more than two decimal places. A CWR file holds shares to 0.01%, so write it as 33.33 or 33.34.`);
  }
  const hundredths = Number(m[1]) * 100 + Number((frac + '00').slice(0, 2));
  if (hundredths > 10000) return bad('share-out-of-range', `${raw.trim()}% is over 100%. A share is between 0 and 100.`);
  return ok(hundredths);
}

/** 3333 as "33.33", 5000 as "50". */
export function showShare(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

// ------------------------------------------------------------------ identifiers

/**
 * An IPI name number as eleven digits, or '' when the cell is empty. A number that lost leading zeros in a spreadsheet is padded back
 * only when the padded number passes the check-digit test; if it does not, the cell is refused rather than guessed. An eleven-digit
 * number that fails the test is accepted with a warning, as the checker does.
 */
export function parseIpi(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  const digits = normalizeIpiName(text);
  if (digits === null) {
    const looksScientific = /^\d+(\.\d+)?e\+?\d+$/i.test(text);
    return bad(
      'bad-ipi',
      looksScientific
        ? `"${text}" looks like a number the spreadsheet rewrote in scientific form. Format the column as text and type the IPI name number again.`
        : `"${text}" is not an IPI name number. It is made of digits only (spaces, dashes and dots are fine) and is at most 11 digits long.`,
    );
  }
  if (/^0+$/.test(digits)) return bad('bad-ipi', `"${text}" is all zeros, which means no number was entered. Leave the cell empty, or enter the real IPI name number.`);
  const typed = text.replace(/[\s\-.]/g, '').length;
  const test = identifierCheck('ipiName', digits);
  if (typed < 11) {
    if (test.ok) return ok(digits);
    return bad(
      'bad-ipi',
      `"${text}" has ${typed} digits and an IPI name number has 11. Adding leading zeros (${digits}) does not give a number that passes the check-digit test, so it has not been guessed. Look the number up and enter all 11 digits.`,
    );
  }
  if (!test.ok) {
    return ok(digits, {
      code: 'ipi-check-digits',
      message: `${digits} ends in check digits ${test.found ?? ''}, but its first nine digits give ${test.expected ?? ''}. Check the number against the society's record.`,
    });
  }
  return ok(digits);
}

/** An ISWC as T and ten digits, or '' when empty. Shape only: the check digit is not tested. */
export function parseIswc(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  const v = normalizeIswc(text);
  return v ? ok(v) : bad('bad-iswc', `"${text}" is not an ISWC. It is the letter T followed by ten digits, for example T-123.456.789-0 or T1234567890.`);
}

/** An ISRC as twelve letters and digits, or '' when empty. */
export function parseIsrc(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  const v = normalizeIsrc(text);
  return v ? ok(v) : bad('bad-isrc', `"${text}" is not an ISRC. It is 12 letters and digits, for example GBAYE0601498 or GB-AYE-06-01498.`);
}

/** A society code as three digits, or '' when empty. */
export function parseSociety(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  if (!/^\d{1,3}$/.test(text)) return bad('bad-society', `"${text}" is not a society code. Society codes are three digits, for example 021.`);
  const code = text.padStart(3, '0');
  const known = (LOOKUPS.societyCode.has(code) || LOOKUPS.transmitterCode.has(code));
  return known ? ok(code) : ok(code, { code: 'unknown-society', message: `${code} is not in either society list this tool holds. Check the code.` });
}

// ------------------------------------------------------------------ territories

export const WORLD_TIS = '2136';

export interface TerritoryList {
  codes: string[];
  warnings: Note[];
}

/**
 * Territory codes (TIS) from a cell: four digits each, separated by semicolons, commas or spaces. An empty cell is the whole world.
 * Codes a spreadsheet shortened (826 for 0826) are padded. A repeated code is kept once. A code that is not a known territory is refused.
 */
export function parseTerritories(raw: string): Parsed<TerritoryList> {
  const text = raw.trim();
  if (text === '') return ok({ codes: [WORLD_TIS], warnings: [] });
  const codes: string[] = [];
  const warnings: Note[] = [];
  for (const token of text.split(/[;,\s]+/).filter(t => t !== '')) {
    if (!/^\d{1,4}$/.test(token)) {
      return bad('bad-territory', `"${token}" is not a territory code. Territory codes are four digits, for example 2136 for the whole world or 0826 for the United Kingdom.`);
    }
    const code = token.padStart(4, '0');
    if (codes.includes(code)) {
      warnings.push({ code: 'duplicate-territory', message: `${code} is listed more than once. It is used once.` });
      continue;
    }
    if (!LOOKUPS.tis.has(code)) {
      return bad('unknown-territory', `"${token}" is not a current territory code. This tool takes current territory codes only, four digits, for example 2136 for the whole world or 0826 for the United Kingdom.`);
    } else if (isSavedGroup(code)) {
      warnings.push({ code: 'territory-group', message: `${code} is a group of territories. The checker cannot add up shares per country for a group, so it will not check the collection shares for this work.` });
    }
    codes.push(code);
  }
  return ok({ codes, warnings });
}

// ------------------------------------------------------------------ language, category, title type

export function parseLanguage(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  const code = text.toUpperCase();
  if (/^[A-Z]{2}$/.test(code) && LOOKUPS.languageCode.has(code)) return ok(code);
  return bad('unknown-language', `"${text}" is not a language code this tool knows. Use the two-letter code, for example EN, FR or ES.`);
}

export const CATEGORIES = ['POP', 'JAZ', 'UNC'] as const;

export function parseCategory(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('UNC');
  const code = text.toUpperCase();
  if ((CATEGORIES as readonly string[]).includes(code)) return ok(code);
  if (code === 'SER') {
    return bad('unsupported-category', 'SER (serious) works need instrumentation details that this template does not collect. Use POP, JAZ or UNC.');
  }
  return bad('unknown-category', `"${text}" is not a category this template writes. Use POP, JAZ or UNC, or leave it empty for UNC.`);
}

/** Title types the template accepts for an alternative title. */
export function parseTitleType(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('AT');
  const code = text.toUpperCase();
  if (code === 'OT') {
    return bad('original-title-not-allowed', 'An alternative title cannot have the type OT (original title). The original title belongs in the Title column of the WORK row. Use AT, or another type from the list: TE, FT, IT, TT, PT, RT, ET, OL, AL.');
  }
  if (/^[A-Z]{2}$/.test(code) && LOOKUPS.titleType.has(code)) return ok(code);
  return bad('unknown-title-type', `"${text}" is not a title type. Use AT for an ordinary alternative title, or one of TE, FT, IT, TT, PT, RT, ET, OL, AL.`);
}

// ------------------------------------------------------------------ writer and publisher roles

/** Writer roles the template writes: creators (C, A, CA) and modifiers (AR, AD, SR, SA, TR). */
export const CREATOR_ROLES: readonly string[] = ['C', 'CA', 'A'];
export const MODIFIER_ROLES: readonly string[] = ['AR', 'AD', 'SR', 'SA', 'TR'];

export function parseWriterRole(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return bad('missing-role', 'The role is empty. Use C for a composer, A for an author of the words, or CA for both.');
  const code = text.toUpperCase();
  if (CREATOR_ROLES.includes(code) || MODIFIER_ROLES.includes(code)) return ok(code);
  if (LOOKUPS.writerDesignation.has(code)) {
    return bad('unsupported-writer-role', `Role ${code} is a real writer role, but this template does not write it yet. Use C, A, CA, AR, AD, SR, SA or TR.`);
  }
  return bad('unknown-writer-role', `"${text}" is not a writer role. Use C, A, CA, AR, AD, SR, SA or TR.`);
}

export function parsePublisherRole(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('E');
  const code = text.toUpperCase();
  if (code === 'E') return ok('E');
  if (LOOKUPS.publisherType.has(code)) {
    return bad('unsupported-publisher-role', `Role ${code} is a real publisher role, but this template writes original publishers (E) only. Use E, or leave the role empty.`);
  }
  return bad('unknown-publisher-role', `"${text}" is not a publisher role. Use E for the original publisher, or leave the role empty.`);
}

// ------------------------------------------------------------------ duration and date

/** A length as the six digits HHMMSS, or '' when empty. Accepts m:ss, mm:ss and h:mm:ss. */
export function parseDuration(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return bad('bad-duration', `"${text}" is not a length. Write minutes and seconds as 3:25, or hours, minutes and seconds as 1:03:25.`);
  const hasHours = m[1] !== undefined;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (seconds > 59 || (hasHours && minutes > 59)) return bad('bad-duration', `"${text}" is not a length: minutes and seconds go up to 59.`);
  const total = (hasHours ? Number(m[1]) * 3600 : 0) + minutes * 60 + seconds;
  if (total >= 100 * 3600) return bad('bad-duration', `"${text}" is longer than the file can hold (99 hours 59 minutes 59 seconds).`);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return ok(`${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}`);
}

/** A date as YYYYMMDD, or '' when empty. Accepts YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD and YYYYMMDD. */
export function parseDate(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === '') return ok('');
  const m = /^(\d{4})([-/.]?)(\d{2})\2(\d{2})$/.exec(text);
  const value = m ? `${m[1]}${m[3]}${m[4]}` : '';
  if (m && isRealDate(value)) return ok(value);
  return bad('bad-date', `"${text}" is not a date. Write it as YYYY-MM-DD, for example 2026-03-06.`);
}

// ------------------------------------------------------------------ text

/** What went wrong with a piece of text that is to be written into a fixed-width field, or null. */
export function textProblem(raw: string): Note | null {
  const text = raw.normalize('NFC');
  if (/[\u0000-\u001f\u007f-\u009f\u00ad]/.test(text)) return { code: 'bad-character', message: 'The text has a control or invisible character in it (a line break, a tab or a soft hyphen, for example). Retype it.' };
  if (crossesScript(text)) return { code: 'unsupported-character', message: `"${text}" cannot be changed to capital letters without changing a letter into one of another alphabet. Retype it in capitals.` };
  for (const letter of text) {
    const capital = letter.toUpperCase();
    if (![...capital].some(ch => ch.codePointAt(0)! > 0xff)) continue;
    if (/^\p{Script=Latin}$/u.test(letter)) {
      const what = capital === letter ? `The letter "${letter}"` : `The capital form of "${letter}" is "${capital}", and that letter`;
      return { code: 'unsupported-character', message: `${what} cannot be written in this file, which holds text in capitals. Replace "${letter}" with a plain letter or leave it out.` };
    }
    return { code: 'unsupported-character', message: `"${letter}" cannot be written by this builder, which writes Latin letters only. Replace it with a Latin letter or leave it out.` };
  }
  return null;
}

/** True when the text, in capitals, has a character outside ASCII. */
export function hasNonAscii(text: string): boolean {
  return /[^\u0000-\u007f]/.test(text.toUpperCase());
}

/** How many characters the text takes up once it is in capitals, which is how the file holds it ("ß" becomes "SS"). */
export function writtenLength(text: string): number {
  return text.toUpperCase().length;
}

/** Upper case, cut to `width`. */
export function fit(text: string, width: number): string {
  const upper = text.toUpperCase();
  return upper.length > width ? upper.slice(0, width) : upper;
}
