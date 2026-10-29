import { describe, expect, it } from 'vitest';
import {
  COLUMN_KEYS,
  EXAMPLE_ROWS,
  ROW_TYPES,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  buildDoc,
  checkRows,
  exampleCsv,
  identifierCheck,
  parseCsv,
  readTemplateRows,
  rowsCsv,
  templateCsv,
  templateRow,
} from '../../src/index';
import { HEADER, checkerErrors } from './support';

describe('template columns', () => {
  it('has one column per key, in key order, with a header and a help text', () => {
    expect(TEMPLATE_COLUMNS.map(c => c.key)).toEqual([...COLUMN_KEYS]);
    expect(new Set(TEMPLATE_COLUMNS.map(c => c.header.toLowerCase())).size).toBe(TEMPLATE_COLUMNS.length);
    for (const c of TEMPLATE_COLUMNS) {
      expect(c.header.trim()).toBe(c.header);
      expect(c.help.length).toBeGreaterThan(10);
      for (const t of c.required) expect(c.usedBy).toContain(t);
    }
  });

  it('asks for a row type and a work number on every row type', () => {
    for (const key of ['rowType', 'workNumber'] as const) {
      expect(TEMPLATE_COLUMNS.find(c => c.key === key)!.required).toEqual([...ROW_TYPES]);
    }
  });

  it('puts the required columns where the plan says', () => {
    const req = (t: (typeof ROW_TYPES)[number]): string[] => TEMPLATE_COLUMNS.filter(c => c.required.includes(t)).map(c => c.key);
    expect(req('WORK')).toEqual(['rowType', 'workNumber', 'title']);
    expect(req('WRITER')).toEqual(['rowType', 'workNumber', 'controlled', 'role', 'name']);
    expect(req('PUBLISHER')).toEqual(['rowType', 'workNumber', 'controlled', 'name']);
    expect(req('ALT TITLE')).toEqual(['rowType', 'workNumber', 'title']);
    expect(req('PERFORMER')).toEqual(['rowType', 'workNumber', 'name']);
    expect(req('RECORDING')).toEqual(['rowType', 'workNumber', 'isrc']);
  });

  it('writes a blank template that is only the header row', () => {
    const table = parseCsv(templateCsv());
    expect(table).toEqual([[...TEMPLATE_HEADERS]]);
    expect(templateCsv().endsWith('\r\n')).toBe(true);
    const read = readTemplateRows(table);
    expect(read.rows).toEqual([]);
    expect(read.problems).toEqual([]);
  });
});

describe('the filled example', () => {
  it('uses every row type', () => {
    const types = new Set(EXAMPLE_ROWS.map(r => r.rowType));
    for (const t of ROW_TYPES) expect(types.has(t)).toBe(true);
    expect(EXAMPLE_ROWS.map(r => r.rowNumber)).toEqual(EXAMPLE_ROWS.map((_, i) => i + 2));
  });

  it('uses invented IPI name numbers that pass the check-digit test', () => {
    const ipis = EXAMPLE_ROWS.map(r => r.ipi).filter(v => v !== '');
    expect(ipis.length).toBeGreaterThan(5);
    for (const ipi of ipis) {
      expect(ipi).toMatch(/^999\d{8}$/);
      expect(identifierCheck('ipiName', ipi).ok).toBe(true);
    }
  });

  it('comes back from its own CSV unchanged', () => {
    const read = readTemplateRows(parseCsv(exampleCsv()));
    expect(read.problems).toEqual([]);
    expect(read.rows).toEqual(EXAMPLE_ROWS);
    expect(rowsCsv(EXAMPLE_ROWS)).toBe(exampleCsv());
  });

  it('guards a user cell that starts like a formula when rows are written as CSV', () => {
    const csv = rowsCsv([templateRow({ rowType: 'WORK', workNumber: 'W1', title: '=HYPERLINK("http://x")' }), templateRow({ rowType: 'WORK', workNumber: '+1', title: '@a, b' }), templateRow({ rowType: 'WORK', workNumber: '-2', title: 'Fine' })]);
    const table = parseCsv(csv);
    expect(table[1]![2]).toBe(`'=HYPERLINK("http://x")`);
    expect(table[2]![1]).toBe(`'+1`);
    expect(table[2]![2]).toBe(`'@a, b`);
    expect(table[3]![1]).toBe(`'-2`);
    expect(table[3]![2]).toBe('Fine');
  });

  it('has no problems from the row checks, warnings included', () => {
    expect(checkRows(EXAMPLE_ROWS)).toEqual([]);
  });

  it('builds a file the checker finds no problems in', () => {
    const { doc } = buildDoc(EXAMPLE_ROWS, HEADER);
    expect(checkerErrors(doc)).toEqual([]);
  });

  it('holds a work of each shape the plan lists', () => {
    const rows = EXAMPLE_ROWS;
    const of = (n: string) => rows.filter(r => r.workNumber === n);
    expect(of('EX-0001').some(r => r.rowType === 'RECORDING' && r.isrc !== '')).toBe(true);
    expect(of('EX-0002').some(r => r.rowType === 'WRITER' && r.controlled === 'N')).toBe(true);
    expect(of('EX-0002').some(r => r.rowType === 'PUBLISHER' && r.controlled === 'N')).toBe(true);
    expect(of('EX-0002').some(r => r.territories.includes(';'))).toBe(true);
    expect(templateRow({}).rowType).toBe('');
  });
});
