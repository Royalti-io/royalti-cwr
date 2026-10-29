/**
 * Reading a filled-in template: CSV text to a table of cells, and a table to typed template rows.
 * Pure functions on strings; the page decides where the text comes from.
 */

import { COLUMN_KEYS, TEMPLATE_COLUMNS, templateRow } from './template';
import type { ColumnKey, TemplateColumn, TemplateRow } from './template';

export interface RowProblem {
  /** Spreadsheet row, counted as the sheet counts it: 1 is the header row. */
  row: number;
  /** The header of the column the problem is about, or '' when it is about the whole row. */
  column: string;
  severity: 'error' | 'warning';
  /** A short stable code, for example `bad-ipi`. */
  code: string;
  /** Plain English: what was found and what to do. */
  message: string;
}

/**
 * CSV text to rows of cells (RFC 4180). A leading byte order mark is dropped. Lines end in CRLF, LF or CR. A field in double quotes
 * can hold the delimiter, line breaks and doubled quotes. A quote inside an unquoted field stays as it is, and a quoted field that
 * is never closed runs to the end of the text. A line break at the very end of the text does not start a row; an empty line in
 * the middle is a row with one empty cell, so the rows keep their place in the sheet.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false; // something has been read on this row since its start
  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      started = true;
    } else if (ch === delimiter) {
      endField();
      started = true;
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
      started = true;
    }
  }
  if (started || field !== '' || row.length > 0) endRow();
  return rows;
}

/** A header as it is compared: lower case, with spaces, dashes, underscores and dots all treated alike. */
const norm = (header: string): string =>
  header
    .replace(/[​-‍﻿]/g, '')
    .toLowerCase()
    .replace(/[\s_\-.]+/g, ' ')
    .trim();

const BY_HEADER: ReadonlyMap<string, TemplateColumn> = (() => {
  const m = new Map<string, TemplateColumn>();
  for (const c of TEMPLATE_COLUMNS) {
    m.set(norm(c.header), c);
    for (const a of c.aliases ?? []) m.set(norm(a), c);
  }
  return m;
})();

/** A cell as the checks read it: invisible characters dropped, runs of white space made one space, ends trimmed. */
export function cleanCell(value: string | undefined): string {
  return (value ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim().normalize('NFC');
}

export interface TemplateColumnMatch {
  /** The header as the sheet wrote it. */
  header: string;
  /** Zero-based position in the header row. */
  index: number;
  /** The template column it was read as, or null for a column the template does not have. */
  key: ColumnKey | null;
}

export interface ReadTemplateResult {
  /** Rows with something in them, in sheet order. Entirely empty rows are left out; the rest keep their spreadsheet row numbers. */
  rows: TemplateRow[];
  /** Every column of the header row, in order. */
  columns: TemplateColumnMatch[];
  /** Headers that are not template columns. Their cells are not read. */
  unknownColumns: string[];
  /** Template columns the sheet does not have. Their cells read as empty. */
  missingColumns: TemplateColumn[];
  /** Problems with the header row: unknown, repeated and missing columns. Row 1 is the header. */
  problems: RowProblem[];
}

/**
 * Maps a table of cells to template rows. The first row with anything in it is the header row. Column order, header case and spaces
 * around a header do not matter, and a few other spellings of a header are read (for example "IPI" for "IPI name number").
 * Columns the template does not have are listed, not read. A repeated column is read from its first place.
 */
export function readTemplateRows(table: ReadonlyArray<ReadonlyArray<string>>): ReadTemplateResult {
  const problems: RowProblem[] = [];
  const headerAt = table.findIndex(r => r.some(c => cleanCell(c) !== ''));
  if (headerAt < 0) {
    return { rows: [], columns: [], unknownColumns: [], missingColumns: [...TEMPLATE_COLUMNS], problems: [{ row: 1, column: '', severity: 'error', code: 'empty-sheet', message: 'The sheet is empty. Start from the template, which has a header row.' }] };
  }
  const headerRow = table[headerAt]!;
  const headerNumber = headerAt + 1;
  const columns: TemplateColumnMatch[] = [];
  const indexOf = new Map<ColumnKey, number>();
  const unknownColumns: string[] = [];
  headerRow.forEach((raw, index) => {
    const header = cleanCell(raw);
    if (header === '') return;
    const col = BY_HEADER.get(norm(header));
    if (!col) {
      columns.push({ header, index, key: null });
      unknownColumns.push(header);
      problems.push({ row: headerNumber, column: header, severity: 'warning', code: 'unknown-column', message: `"${header}" is not a column of the template. It is left out.` });
      return;
    }
    if (indexOf.has(col.key)) {
      columns.push({ header, index, key: null });
      problems.push({ row: headerNumber, column: header, severity: 'warning', code: 'repeated-column', message: `"${header}" appears more than once. Only the first one is read.` });
      return;
    }
    indexOf.set(col.key, index);
    columns.push({ header, index, key: col.key });
  });

  const missingColumns = TEMPLATE_COLUMNS.filter(c => !indexOf.has(c.key));
  for (const c of missingColumns) {
    const must = c.key === 'rowType' || c.key === 'workNumber';
    problems.push({
      row: headerNumber,
      column: c.header,
      severity: must ? 'error' : 'warning',
      code: 'missing-column',
      message: must ? `The sheet has no "${c.header}" column. Every row needs it.` : `The sheet has no "${c.header}" column. Its cells are read as empty.`,
    });
  }

  const rows: TemplateRow[] = [];
  for (let r = headerAt + 1; r < table.length; r++) {
    const cells = table[r]!;
    const values: Partial<Record<ColumnKey, string>> = {};
    let any = false;
    for (const key of COLUMN_KEYS) {
      const at = indexOf.get(key);
      const v = at === undefined ? '' : cleanCell(cells[at]);
      if (v !== '') any = true;
      values[key] = v;
    }
    if (!any) continue;
    rows.push(templateRow(values, r + 1));
  }
  return { rows, columns, unknownColumns, missingColumns, problems };
}
