/** Small pure helpers shared by the rules. */

/** Fills `{name}` placeholders. A missing param becomes an empty string. */
export function fill(template: string, params: Record<string, string | number> | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = params[key];
    return v === undefined ? '' : String(v);
  });
}

/** Only spaces (or empty). */
export function isBlank(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) !== 32) return false;
  return true;
}

/** Only digits (and not empty). */
export function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function leap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** YYYYMMDD that names a real calendar day (year 0001 to 9999). */
export function isRealDate(s: string): boolean {
  if (s.length !== 8 || !isDigits(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const max = m === 2 && leap(y) ? 29 : DAYS[m - 1]!;
  return d <= max;
}

/** HHMMSS with minutes and seconds under 60. Hours are limited to 23 only for a time of day. */
export function isRealTime(s: string, timeOfDay: boolean): boolean {
  if (s.length !== 6 || !isDigits(s)) return false;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2, 4));
  const sec = Number(s.slice(4, 6));
  if (m > 59 || sec > 59) return false;
  return !timeOfDay || h <= 23;
}

/** Counts text in a number with thousands separators, for the summary sentence. */
export function groupDigits(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

// The *At helpers look at text[start, end) without slicing it: the common case is a field with nothing wrong,
// and a check that finds nothing should not allocate.

export function isBlankAt(t: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) if (t.charCodeAt(i) !== 32) return false;
  return true;
}

export function isZerosAt(t: string, start: number, end: number): boolean {
  if (end <= start) return false;
  for (let i = start; i < end; i++) if (t.charCodeAt(i) !== 48) return false;
  return true;
}

export function isDigitsAt(t: string, start: number, end: number): boolean {
  if (end <= start) return false;
  for (let i = start; i < end; i++) {
    const c = t.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

export function hasLowerCaseAt(t: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = t.charCodeAt(i);
    if (c >= 97 && c <= 122) return true;
    if (c > 127) {
      const ch = t[i]!;
      if (ch !== ch.toUpperCase()) return true;
    }
  }
  return false;
}

/** The 8 characters at `start` are a real YYYYMMDD date (see isRealDate). */
export function isRealDateAt(t: string, start: number): boolean {
  if (!isDigitsAt(t, start, start + 8)) return false;
  const d = (k: number): number => t.charCodeAt(start + k) - 48;
  const y = d(0) * 1000 + d(1) * 100 + d(2) * 10 + d(3);
  const m = d(4) * 10 + d(5);
  const day = d(6) * 10 + d(7);
  if (y < 1 || m < 1 || m > 12 || day < 1) return false;
  return day <= (m === 2 && leap(y) ? 29 : DAYS[m - 1]!);
}

/** The 6 characters at `start` are a real HHMMSS (see isRealTime). */
export function isRealTimeAt(t: string, start: number, timeOfDay: boolean): boolean {
  if (!isDigitsAt(t, start, start + 6)) return false;
  const d = (k: number): number => t.charCodeAt(start + k) - 48;
  const h = d(0) * 10 + d(1);
  const m = d(2) * 10 + d(3);
  const sec = d(4) * 10 + d(5);
  return m <= 59 && sec <= 59 && (!timeOfDay || h <= 23);
}
