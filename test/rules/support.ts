import { check, generateCwrText, parse, renumber, serialize } from '../../src/index';
import { LOOKUPS } from '../../src/spec/lookups/index';
import type { CheckResult, CwrVersion, Problem } from '../../src/index';
import { fieldsOf, layoutFor, layoutLength } from '../../src/spec/index';

/** Text to bytes, one byte per character (so a character above 127 becomes a Latin-1 byte). */
export function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, c => c.charCodeAt(0));
}

/** The 0-based span of a field on its line, from the generated spec. */
export function spanOf(version: CwrVersion, recordType: string, fieldId: string): { start: number; end: number } {
  const layout = layoutFor(version, recordType);
  if (layout === null) throw new Error(`no layout for ${recordType} in ${version}`);
  const f = fieldsOf(version, layout).find(x => x.id === fieldId);
  if (!f) throw new Error(`no field ${recordType}.${fieldId} in ${version}`);
  return { start: f.start - 1, end: f.start - 1 + f.size };
}

const HEADERS = new Set(['AGR', 'NWR', 'REV', 'ISW', 'EXC', 'ACK']);

/** A file as lines with their endings, so one defect can be planted and everything else left alone. */
export class Tx {
  lines: string[];
  eols: string[];
  constructor(
    readonly version: CwrVersion,
    lines: string[],
  ) {
    this.lines = [...lines];
    this.eols = lines.map(() => '\r\n');
  }

  /** Index of the nth line whose record type is `type`. */
  find(type: string, nth = 0): number {
    let n = 0;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i]!.startsWith(type) && n++ === nth) return i;
    }
    throw new Error(`no ${type} #${nth}`);
  }

  /** Overwrites characters starting at `start`. */
  poke(line: number, start: number, text: string): this {
    const l = this.lines[line]!;
    this.lines[line] = l.slice(0, start) + text + l.slice(start + text.length);
    return this;
  }

  /** Writes a value into a field, left-justified and space padded (or right-justified and zero filled for digits). */
  put(line: number, fieldId: string, value: string): { start: number; end: number } {
    const type = this.lines[line]!.slice(0, 3);
    const span = spanOf(this.version, type, fieldId);
    const width = span.end - span.start;
    const cell = /^\d+$/.test(value) && value.length < width ? value.padStart(width, '0') : value.padEnd(width, ' ');
    if (cell.length !== width) throw new Error(`${value} does not fit ${type}.${fieldId}`);
    let l = this.lines[line]!;
    if (l.length < span.end) l = l.padEnd(span.end, ' ');
    this.lines[line] = l.slice(0, span.start) + cell + l.slice(span.end);
    return span;
  }

  /** The characters of a field. */
  get(line: number, fieldId: string): string {
    const type = this.lines[line]!.slice(0, 3);
    const span = spanOf(this.version, type, fieldId);
    return this.lines[line]!.slice(span.start, span.end);
  }

  span(line: number, fieldId: string): { start: number; end: number } {
    return spanOf(this.version, this.lines[line]!.slice(0, 3), fieldId);
  }

  remove(line: number): this {
    this.lines.splice(line, 1);
    this.eols.splice(line, 1);
    return this;
  }

  insertAfter(line: number, text: string): this {
    this.lines.splice(line + 1, 0, text);
    this.eols.splice(line + 1, 0, '\r\n');
    return this;
  }

  /** Renumbers every Transaction Sequence # and Record Sequence # by position, as the spec's prefix rules say. */
  resequence(): this {
    let t = -1;
    let r = 0;
    let ack: 'none' | 'open' | 'inner' = 'none';
    const pad = (n: number): string => String(n).padStart(8, '0');
    for (let i = 0; i < this.lines.length; i++) {
      const type = this.lines[i]!.slice(0, 3);
      if (type === 'GRH') {
        t = -1;
        ack = 'none';
        continue;
      }
      if (type === 'HDR' || type === 'GRT' || type === 'TRL') continue;
      if (type === 'ACK') {
        t++;
        r = 0;
        ack = 'open';
      } else if (HEADERS.has(type)) {
        const continues = (ack === 'open' && type !== 'EXC') || (ack === 'inner' && type === 'EXC');
        if (continues) {
          r++;
          ack = 'inner';
        } else {
          t++;
          r = 0;
          ack = 'none';
        }
      } else {
        r++;
      }
      this.lines[i] = type + pad(t) + pad(r) + this.lines[i]!.slice(19);
    }
    return this;
  }

  /** Recomputes the GRT and TRL counts with the engine's own renumber. */
  recount(): this {
    const doc = parse(this.bytes(), { version: this.version });
    renumber(doc);
    const fixed = Array.from(serialize(doc), c => String.fromCharCode(c)).join('').split('\r\n');
    if (fixed[fixed.length - 1] === '') fixed.pop();
    this.lines = fixed;
    return this;
  }

  /** resequence + recount: after inserting or removing records. */
  fix(): this {
    return this.resequence().recount();
  }

  text(): string {
    let out = '';
    for (let i = 0; i < this.lines.length; i++) out += this.lines[i]! + (this.eols[i] ?? '\r\n');
    return out;
  }

  bytes(): Uint8Array {
    return bytesOf(this.text());
  }

  /** Parses and checks. */
  run(options: { disable?: string[] } = {}): CheckResult {
    return check(parse(this.bytes(), { version: this.version }), options);
  }
}

/**
 * The synthetic generator's file, with the one thing it leaves blank that the spec wants zero filled
 * (SWR/OWR Personal Number) filled in, so the baseline has no problems at all.
 */
export function cleanLines(version: CwrVersion, works = 3): string[] {
  const text = generateCwrText({ version, works, otherParties: true });
  return text
    .split('\r\n')
    .filter((l, i, a) => !(i === a.length - 1 && l === ''))
    .map(l => (l.startsWith('SWR') || l.startsWith('OWR') ? l.slice(0, 167) + '000000000000' + l.slice(179) : l));
}

export function clean(version: CwrVersion, works = 3): Tx {
  return new Tx(version, cleanLines(version, works));
}

/**
 * Two groups: the NWR group with works 0 and 1, and a REV group holding work 2 as a REV with its
 * Transaction Sequence # restarted at 0. Counts are recomputed by the engine's own renumber, so the
 * baseline is consistent.
 */
export function cleanTwoGroups(version: CwrVersion): Tx {
  const lines = cleanLines(version, 3);
  const nwr = lines.map((l, i) => (l.startsWith('NWR') ? i : -1)).filter(i => i >= 0);
  const grt = lines.findIndex(l => l.startsWith('GRT'));
  const w2 = lines.slice(nwr[2]!, grt).map(l => l.slice(0, 3) + '00000000' + l.slice(11));
  w2[0] = 'REV' + w2[0]!.slice(3);
  const out = [
    ...lines.slice(0, 2),
    ...lines.slice(2, nwr[2]),
    'GRT' + '00001' + '00000000' + '00000000',
    'GRH' + 'REV' + '00002' + lines[1]!.slice(11),
    ...w2,
    'GRT' + '00002' + '00000000' + '00000000',
    lines[grt + 1]!,
  ];
  const doc = parse(bytesOf(out.join('\r\n') + '\r\n'), { version });
  renumber(doc);
  const fixed = Array.from(serialize(doc), c => String.fromCharCode(c)).join('').split('\r\n');
  if (fixed[fixed.length - 1] === '') fixed.pop();
  return new Tx(version, fixed);
}

export interface Hit {
  rule: string;
  severity: string;
  line: number;
  start: number | null;
  end: number | null;
}

export function hitsOf(problems: readonly Problem[]): Hit[] {
  return problems.map(p => ({ rule: p.ruleId, severity: p.severity, line: p.line, start: p.span ? p.span.start : null, end: p.span ? p.span.end : null }));
}

const L_FILL: Record<string, string> = {
  inclusionExclusionIndicator: 'I',
  typeOfRight: 'PER',
  messageType: 'E',
  messageLevel: 'F',
  originalTransactionType: 'AGR',
  recordingFormat: 'A',
};

/**
 * A record of `type` that satisfies the format rules by construction: mandatory fields hold a plausible
 * value (the first row of the field's table for lookups), optional ones are blank or zero. Override any
 * field by id. The caller sets the sequence numbers, or calls `Tx.resequence`.
 */
export function rec(version: CwrVersion, type: string, over: Record<string, string> = {}, tseq = 0, rseq = 0): string {
  const layout = layoutFor(version, type);
  if (layout === null) throw new Error(`no layout for ${type}`);
  const fields = fieldsOf(version, layout).filter(f => f.status !== 'aggregate');
  const chars: string[] = new Array<string>(layoutLength(version, layout)!).fill(' ');
  for (const f of fields) {
    const width = f.size;
    let v: string;
    if (f.id === 'recordType') v = type;
    else if (f.id === 'transactionSequence') v = String(tseq).padStart(8, '0');
    else if (f.id === 'recordSequence') v = String(rseq).padStart(8, '0');
    else if (over[f.id] !== undefined) v = over[f.id]!;
    else if (f.id === 'filler' || f.id.startsWith('constant')) v = '';
    else if (f.format === 'N') v = '0'.repeat(width);
    else if (f.format === 'D') v = f.req === 'M' ? '20260101' : '0'.repeat(width);
    else if (f.format === 'T') v = '0'.repeat(width);
    else if (f.format === 'B' || f.format === 'F') v = f.req === 'M' ? 'N' : '';
    else if (f.format === 'L') {
      const table = f.lookup ? (LOOKUPS as Record<string, { rows: readonly { code: string }[] }>)[f.lookup] : undefined;
      const first = table?.rows.find(r => r.code !== '[blank]')?.code;
      v = f.req === 'M' ? (first ?? L_FILL[f.id] ?? '') : '';
    } else v = f.req === 'M' ? 'X' : '';
    const cell = f.format === 'N' && /^\d+$/.test(v) ? v.padStart(width, '0') : v.padEnd(width, ' ');
    if (cell.length !== width) throw new Error(`${type}.${f.id}: "${v}" does not fit ${width}`);
    for (let k = 0; k < width; k++) chars[f.start - 1 + k] = cell[k]!;
  }
  return chars.join('');
}

/** An ACK with the NWR it answers (a continuation) and an EXC that continues it. */
export function ackBase(version: CwrVersion): Tx {
  const c = cleanLines(version, 1);
  const lines = [
    c[0]!,
    'GRH' + 'ACK' + '00001' + c[1]!.slice(11),
    rec(version, 'ACK', { originalTransactionType: 'NWR', creationTitle: 'AMBER HARBOUR 00001' }),
    ...c.slice(2, 10),
    rec(version, 'EXC'),
    'GRT' + '00001' + '00000000' + '00000000',
    c[11]!,
  ];
  return new Tx(version, lines).resequence().recount();
}

/** An AGR with one TER and an assignor and an acquirer IPA. */
export function agrBase(version: CwrVersion): Tx {
  const c = cleanLines(version, 1);
  const lines = [
    c[0]!,
    'GRH' + 'AGR' + '00001' + c[1]!.slice(11),
    rec(version, 'AGR', { agreementType: 'OS', numberOfWorks: '1' }),
    rec(version, 'TER'),
    rec(version, 'IPA', { agreementRoleCode: 'AS' }),
    rec(version, 'IPA', { agreementRoleCode: 'AC' }),
    'GRT' + '00001' + '00000000' + '00000000',
    c[11]!,
  ];
  return new Tx(version, lines).resequence().recount();
}

