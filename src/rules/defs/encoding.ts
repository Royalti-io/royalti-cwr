import { getField } from '../../model/fields';
import { S21, S22 } from '../locate';
import { defineRule } from '../registry';
import { isBlank } from '../util';
import type { RuleDef } from '../types';

/** Line endings, character set and blank lines. */

const enc001 = defineRule({
  id: 'ENC-001',
  title: 'Records end with CR/LF',
  severity: 'warning',
  scope: 'file',
  versions: ['2.1', '2.2'],
  message: '{count} {lines} not end with CR LF ({first}); the specification says records are CR/LF delimited.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    let count = 0;
    let firstLine = -1;
    let firstEol = '';
    for (const line of ctx.doc.lines) {
      // The last line may have no ending at all; that is a delimiter that is not needed.
      if (line.eol === '' || line.eol === '\r\n') continue;
      if (count++ === 0) {
        firstLine = line.index;
        firstEol = line.eol === '\n' ? 'LF' : 'CR';
      }
    }
    if (count === 0) return;
    const text = ctx.doc.lines[firstLine]!.text;
    ctx.report({
      line: firstLine,
      start: text.length,
      end: text.length,
      params: { count, lines: count === 1 ? 'line does' : 'lines do', first: `first at line ${firstLine + 1}: ${firstEol} only` },
    });
  },
});

const enc002 = defineRule({
  id: 'ENC-002',
  title: 'ASCII unless the HDR names a character set',
  severity: 'error',
  scope: 'file',
  versions: ['2.1', '2.2'],
  message: 'Characters outside ASCII, and the HDR does not name a character set.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S21, quote: '' },
  ],
  run(ctx) {
    const { doc } = ctx;
    if (doc.encoding === 'ascii') return;
    const hdr = doc.file.hdr;
    if (hdr !== undefined) {
      const cs = getField(doc, hdr, 'characterSet');
      if (cs !== undefined && !isBlank(cs)) return;
    }
    for (const line of doc.lines) {
      const t = line.text;
      let first = -1;
      let last = -1;
      for (let i = 0; i < t.length; i++) {
        if (t.charCodeAt(i) > 127) {
          if (first < 0) first = i;
          last = i;
        }
      }
      if (first >= 0) ctx.report({ line: line.index, start: first, end: last + 1, params: {} });
    }
  },
});

const enc003 = defineRule({
  id: 'ENC-003',
  title: 'Blank line',
  severity: 'info',
  scope: 'file',
  versions: ['2.1', '2.2'],
  message: 'This line is blank. The specification defines records by record type, and a blank line has none.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    for (const line of ctx.doc.lines) {
      if (ctx.doc.recordOfLine[line.index] === -1) ctx.report({ line: line.index, start: 0, end: line.text.length, params: {} });
    }
  },
});

const enc004 = defineRule({
  id: 'ENC-004',
  title: 'No NUL characters',
  severity: 'error',
  scope: 'file',
  versions: ['2.1', '2.2'],
  message: 'This line contains a NUL character; the specification says nulls are not acceptable in alphanumeric fields.',
  source: { slug: S21, quote: '' },
  alsoSource: [{ slug: S22, quote: '' }],
  run(ctx) {
    for (const line of ctx.doc.lines) {
      const at = line.text.indexOf('\u0000');
      if (at >= 0) ctx.report({ line: line.index, start: at, end: line.text.lastIndexOf('\u0000') + 1, params: {} });
    }
  },
});

export const ENCODING_RULES: readonly RuleDef[] = [enc001, enc002, enc003, enc004];
