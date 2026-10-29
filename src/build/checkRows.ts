/**
 * Checks template rows before anything is built. Every problem points at a spreadsheet row and column and says, in plain words,
 * what was found. A problem with severity `error` stops the build; a `warning` does not.
 */

import { analyse } from './analyse';
import type { RowProblem } from './csv';
import type { TemplateRow } from './template';

/**
 * The problems in a set of rows, sorted by row and then by column. No problems means these checks found none: it does not mean
 * the file the rows build will be accepted by anyone. Run the checker on the file as well.
 */
export function checkRows(rows: readonly TemplateRow[]): RowProblem[] {
  const { works, problems } = analyse(rows);
  if (works.length === 0) {
    const none: RowProblem = { row: 1, column: 'Row type', severity: 'error', code: 'no-works', message: 'The sheet has no usable WORK row. Add one WORK row for each work you want in the file.' };
    return [none, ...problems];
  }
  return problems;
}

/** One problem as a line of text: where it is, then what is wrong. */
export function formatRowProblem(p: RowProblem): string {
  const where = p.column === '' ? `Row ${p.row}` : `Row ${p.row}, "${p.column}"`;
  return `${where}: ${p.message}`;
}
