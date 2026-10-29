import { describe, expect, it } from 'vitest';
import { TEMPLATE_HEADERS, formatCsv, parseCsv, readTemplateRows } from '../../src/index';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('accepts CRLF, LF and CR line endings, mixed', () => {
    expect(parseCsv('a,b\r\nc,d\ne,f\rg,h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  it('drops a leading byte order mark', () => {
    expect(parseCsv('﻿a,b\n')).toEqual([['a', 'b']]);
  });

  it('reads quoted fields with commas, doubled quotes and line breaks', () => {
    const text = '"a,b","say ""hi""","line one\r\nline two",plain\r\n';
    expect(parseCsv(text)).toEqual([['a,b', 'say "hi"', 'line one\r\nline two', 'plain']]);
  });

  it('keeps empty cells and empty trailing cells', () => {
    expect(parseCsv('a,,c,\n,,\n')).toEqual([
      ['a', '', 'c', ''],
      ['', '', ''],
    ]);
  });

  it('does not make a row of a final line break, and keeps an empty line in the middle as a row', () => {
    expect(parseCsv('a\n')).toEqual([['a']]);
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
    expect(parseCsv('')).toEqual([]);
  });

  it('keeps a quote in the middle of an unquoted field, and closes a quoted field that never ends', () => {
    expect(parseCsv('a"b,c')).toEqual([['a"b', 'c']]);
    expect(parseCsv('"open,still\nopen')).toEqual([['open,still\nopen']]);
  });

  it('reads a semicolon-separated sheet when told to', () => {
    expect(parseCsv('a;b\n1;"2;3"', ';')).toEqual([
      ['a', 'b'],
      ['1', '2;3'],
    ]);
  });

  it('round-trips what formatCsv writes', () => {
    const table = [
      ['plain', 'with,comma', 'with "quote"', 'two\nlines', ''],
      ['', '', '', '', 'x'],
    ];
    expect(parseCsv(formatCsv(table))).toEqual(table);
  });
});

describe('readTemplateRows', () => {
  it('maps columns by header, in any order, ignoring case and spaces around the header', () => {
    const table = [
      ['  work NUMBER ', 'Row Type', 'TITLE'],
      ['A1', 'work', 'First'],
    ];
    const r = readTemplateRows(table);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ rowNumber: 2, rowType: 'work', workNumber: 'A1', title: 'First', name: '' });
  });

  it('reads the other spellings of a header', () => {
    const r = readTemplateRows([['Type', 'Work #', 'Last name', 'IPI'], ['writer', 'W1', 'Smith', '123']]);
    expect(r.rows[0]).toMatchObject({ rowType: 'writer', workNumber: 'W1', name: 'Smith', ipi: '123' });
    expect(r.unknownColumns).toEqual([]);
  });

  it('lists columns it does not know and does not read them', () => {
    const r = readTemplateRows([['Row type', 'Work number', 'Favourite colour'], ['WORK', 'A1', 'blue']]);
    expect(r.unknownColumns).toEqual(['Favourite colour']);
    expect(r.problems.find(p => p.code === 'unknown-column')).toMatchObject({ row: 1, column: 'Favourite colour', severity: 'warning' });
    expect(Object.values(r.rows[0]!)).not.toContain('blue');
  });

  it('reports missing columns: an error for the row type and work number, a warning for the rest', () => {
    const r = readTemplateRows([['Title'], ['x']]);
    const missing = r.problems.filter(p => p.code === 'missing-column');
    expect(missing.find(p => p.column === 'Row type')!.severity).toBe('error');
    expect(missing.find(p => p.column === 'Work number')!.severity).toBe('error');
    expect(missing.find(p => p.column === 'ISWC')!.severity).toBe('warning');
    expect(r.missingColumns.map(c => c.key)).toContain('iswc');
    expect(r.missingColumns.map(c => c.key)).not.toContain('title');
  });

  it('reads a repeated column from its first place and says so', () => {
    const r = readTemplateRows([['Row type', 'Work number', 'Title', 'title'], ['WORK', 'A1', 'one', 'two']]);
    expect(r.rows[0]!.title).toBe('one');
    expect(r.problems.some(p => p.code === 'repeated-column')).toBe(true);
  });

  it('skips empty rows but keeps the spreadsheet row numbers of the rest', () => {
    const r = readTemplateRows([[...TEMPLATE_HEADERS], ['WORK', 'A1', 'one'], ['', '', ''], [], ['WORK', 'A2', 'two']]);
    expect(r.rows.map(x => x.rowNumber)).toEqual([2, 5]);
  });

  it('takes the first row with anything in it as the header', () => {
    const r = readTemplateRows([[''], ['Row type', 'Work number'], ['WORK', 'A1']]);
    expect(r.rows[0]).toMatchObject({ rowNumber: 3, rowType: 'WORK', workNumber: 'A1' });
    expect(r.problems.find(p => p.code === 'missing-column')!.row).toBe(2);
  });

  it('cleans cells: trims, collapses white space, drops invisible characters', () => {
    const r = readTemplateRows([['Row type', 'Work number', 'Title'], [' WORK ', 'A​1', '  Two   words here ']]);
    expect(r.rows[0]).toMatchObject({ workNumber: 'A1', title: 'Two words here' });
  });

  it('says so when the sheet is empty', () => {
    expect(readTemplateRows([]).problems[0]).toMatchObject({ code: 'empty-sheet', severity: 'error' });
    expect(readTemplateRows([[''], ['']]).problems[0]!.code).toBe('empty-sheet');
  });
});
