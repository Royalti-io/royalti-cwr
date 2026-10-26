import { findField, lineText } from '../../model/fields';
import { S21, S22 } from '../locate';
import { defineRule } from '../registry';
import type { RuleDef } from '../types';
import { isBlankAt, isDigitsAt, isZerosAt } from '../util';

/**
 * Differences between CWR 2.1 and 2.2, and what a file declares about itself.
 *
 *  GRH-F-004  the Version Number on every GRH is 02.10 (2.1) or 02.20 (2.2). The 2.2 field description still says 02.10; the 2.2 edit says
 *             02.20. The edit is followed.
 *  HDR-F-015  2.2 only: the HDR Version, when entered, is 2.2.
 *  HDR-F-016  2.2 only: the HDR Revision, when entered, is 1 or 2.
 *  VER-002    the file is read as one version but holds content that exists only in the other. A warning with a hint to check it again.
 *  VER-005    2.2 only: ORN characters 163 to 187, which were the V-ISAN fields in 2.1 and are reserved in 2.2, are blank.
 *  XRF-F-002  2.2 only: an XRF Identifier Type of V.
 *
 * Record types that exist only in 2.2 (OPT, OWT, XRF) and fields past the 2.1 length are reported by STR-F-001 and STR-LEN in a file read as 2.1;
 * VER-002 adds the one-line explanation for the file as a whole.
 */

const BOTH = ['2.1', '2.2'] as const;

const grhF004 = defineRule({
  id: 'GRH-F-004',
  title: 'GRH Version Number is 02.10 (2.1) or 02.20 (2.2)',
  severity: 'error',
  scope: 'group',
  versions: BOTH,
  specAction: 'GR',
  cisac: 'GRH F 004',
  message: 'Version Number "{found}" on the GRH should be {expected} for a CWR {version} file.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const grh = ctx.group!.grh;
    const rec = ctx.doc.records[grh]!;
    const layout = ctx.doc.layouts.getLayout(ctx.version, 'GRH');
    const f = layout ? findField(layout, 'versionNumberForThisTransactionType') : undefined;
    if (!f) return;
    const t = lineText(ctx.doc, rec.line);
    if (t.length < f.end) return; // STR-LEN
    const expected = ctx.version === '2.2' ? '02.20' : '02.10';
    const found = t.slice(f.start, f.end);
    if (found === expected) return;
    ctx.report({ line: rec.line, start: f.start, end: f.end, fieldId: f.id, params: { found: found.trim(), expected, version: ctx.version } });
  },
});

const hdrF015 = defineRule({
  id: 'HDR-F-015',
  title: 'HDR Version, when entered, is 2.2',
  severity: 'error',
  scope: 'record',
  versions: ['2.2'],
  records: ['HDR'],
  specAction: 'ER',
  cisac: 'HDR F 015',
  message: 'Version is "{found}"; when entered it must be 2.2.',
  source: { slug: S22, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = ctx.layout ? findField(ctx.layout, 'version') : undefined;
    if (!f || f.end > ctx.text.length || isBlankAt(ctx.text, f.start, f.end)) return;
    const v = ctx.text.slice(f.start, f.end).trim();
    if (v === '2.2') return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { found: v } });
  },
});

const hdrF016 = defineRule({
  id: 'HDR-F-016',
  title: 'HDR Revision, when entered, is 1 or 2',
  severity: 'error',
  scope: 'record',
  versions: ['2.2'],
  records: ['HDR'],
  specAction: 'ER',
  cisac: 'HDR F 016',
  message:
    'Revision is {found}. The 2.2 specification names 1 as the current value, although the document itself is Revision 2; ' +
    'this tool accepts 1 and 2 and reports anything else.',
  source: { slug: S22, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = ctx.layout ? findField(ctx.layout, 'revision') : undefined;
    if (!f || f.end > ctx.text.length) return;
    const t = ctx.text;
    if (isBlankAt(t, f.start, f.end) || isZerosAt(t, f.start, f.end) || !isDigitsAt(t, f.start, f.end)) return; // not entered, or FMT-N's
    const n = Number(t.slice(f.start, f.end));
    if (n === 1 || n === 2) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { found: n } });
  },
});

// ------------------------------------------------------------------ VER-002

interface Evidence {
  line: number;
  what: string;
}

/** Characters from `from` to the end of the line, if any are not spaces. */
function tail(t: string, from: number): boolean {
  return t.length > from && !isBlankAt(t, from, t.length);
}

const ver002 = defineRule({
  id: 'VER-002',
  title: 'The file holds content from the other CWR version',
  severity: 'warning',
  scope: 'file',
  versions: BOTH,
  message: 'The file holds content from the other CWR version. {why}',
  source: { slug: S22, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const { doc } = ctx;
    const grh0 = doc.file.groups[0]?.grh;
    const anchor = (): { line: number; start: number; end: number } => {
      if (grh0 !== undefined) {
        const layout = doc.layouts.getLayout(ctx.version, 'GRH');
        const f = layout ? findField(layout, 'versionNumberForThisTransactionType') : undefined;
        if (f) return { line: doc.records[grh0]!.line, start: f.start, end: f.end };
      }
      return { line: -1, start: 0, end: 0 };
    };
    const declared = ctx.version;
    const other = declared === '2.1' ? '2.2' : '2.1';
    const evidence: Evidence[] = [];

    if (declared === '2.1') {
      for (let ref = 0; ref < doc.records.length; ref++) {
        const rec = doc.records[ref]!;
        const t = lineText(doc, rec.line);
        switch (rec.type) {
          case 'HDR':
            if (tail(t, 101)) evidence.push({ line: rec.line, what: 'the HDR has characters after position 101 (Version, Revision and Software Package fields exist in 2.2 only)' });
            break;
          case 'PWR':
            if (tail(t, 110)) evidence.push({ line: rec.line, what: 'a PWR has a Publisher Sequence # (characters 111 to 112, 2.2 only)' });
            break;
          case 'REC':
            if (tail(t, 266)) evidence.push({ line: rec.line, what: 'a REC record has characters after position 266 (2.2 only)' });
            break;
          case 'ORN':
            if (tail(t, 301)) evidence.push({ line: rec.line, what: 'an ORN record has characters after position 301 (ISAN and EIDR fields, 2.2 only)' });
            break;
          case 'OPT':
          case 'OWT':
          case 'XRF':
            evidence.push({ line: rec.line, what: `a ${rec.type} record (a record type of CWR 2.2 only)` });
            break;
          default:
        }
        if (evidence.length >= 50) break;
      }
      if (evidence.length === 0) return;
    } else {
      // A 2.2 file has a longer HDR and a PWR with a Publisher Sequence #. A file with neither, that has PWR records, is built as 2.1.
      const hdr = doc.file.hdr;
      if (hdr === undefined) return;
      if (lineText(doc, doc.records[hdr]!.line).length > 101 && tail(lineText(doc, doc.records[hdr]!.line), 101)) return;
      let pwr = 0;
      for (let ref = 0; ref < doc.records.length; ref++) {
        const rec = doc.records[ref]!;
        if (rec.type === 'OPT' || rec.type === 'OWT' || rec.type === 'XRF') return;
        if (rec.type !== 'PWR') continue;
        pwr++;
        if (tail(lineText(doc, rec.line), 110)) return;
      }
      if (pwr === 0) return;
      evidence.push({ line: doc.records[hdr]!.line, what: `the HDR has no 2.2 fields (nothing after position 101) and none of the ${pwr} PWR records has a Publisher Sequence #` });
    }

    const a = anchor();
    const shown = [...new Set(evidence.slice(0, 3).map(e => `${e.what} (line ${e.line + 1})`))].join('; ');
    const more = evidence.length > 3 ? `; and ${evidence.length - 3} more` : '';
    ctx.report({
      line: a.line,
      ...(a.line >= 0 ? { start: a.start, end: a.end } : {}),
      params: {
        why: `It is checked as CWR ${declared}, but ${shown}${more}. That looks like CWR ${other}; if it is, check it again as ${other}.`,
      },
      related: evidence.slice(0, 20).map(e => ({ line: e.line, start: 0, end: 3, role: 'evidence' })),
    });
  },
});

const ver005 = defineRule({
  id: 'VER-005',
  title: 'ORN characters 163 to 187 are blank in 2.2',
  severity: 'warning',
  scope: 'record',
  versions: ['2.2'],
  records: ['ORN'],
  message:
    'ORN characters 163 to 187 hold "{found}". In CWR 2.1 they held the V-ISAN fields; in 2.2 they are reserved for future use, and the ISAN fields moved to position 302.',
  source: { slug: S22, quote: '' },
  alsoSource: [{ slug: S21, quote: '' }],
  run(ctx) {
    const f = ctx.layout ? findField(ctx.layout, 'filler') : undefined;
    if (!f || f.end > ctx.text.length) return;
    const t = ctx.text;
    if (isBlankAt(t, f.start, f.end) || isZerosAt(t, f.start, f.end)) return;
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: { found: t.slice(f.start, f.end).trim() } });
  },
});

const xrfF002 = defineRule({
  id: 'XRF-F-002',
  title: 'XRF Identifier Type is W, R or P',
  severity: 'warning',
  scope: 'field',
  versions: ['2.2'],
  records: ['XRF'],
  fields: { ids: ['identifierType'] },
  specAction: 'RR',
  cisac: 'XRF F 002',
  message:
    'Identifier Type is V. The field description lists W, R, P and V, but edit 2 says the Identifier Type must be W, R or P (RR). ' +
    'The two disagree, so this is a warning; the CWR 3.0 lookup table has all four.',
  source: { slug: S22, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    const f = ctx.field!;
    if (ctx.text.charCodeAt(f.start) !== 86) return; // V
    ctx.report({ line: ctx.line, start: f.start, end: f.end, fieldId: f.id, params: {} });
  },
});

export const VERSION_RULES: readonly RuleDef[] = [grhF004, hdrF015, hdrF016, ver002, ver005, xrfF002];
