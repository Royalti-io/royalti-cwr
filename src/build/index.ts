// The builder (`@royalti/cwr/build`): spreadsheet rows in, a CWR 2.2 file out.
// A separate entry so the checker's lite bundle does not carry it. The full build re-exports it too.
export { buildDoc, checkHeader, BuildError } from './buildDoc';
export type { BuildHeader, BuildResult, HeaderProblem } from './buildDoc';
export { checkRows, formatRowProblem } from './checkRows';
export { parseCsv, readTemplateRows, cleanCell } from './csv';
export type { ReadTemplateResult, RowProblem, TemplateColumnMatch } from './csv';
export {
  COLUMN_KEYS,
  EXAMPLE_ROWS,
  ROW_TYPES,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  exampleCsv,
  formatCsv,
  rowsCsv,
  templateCsv,
  templateRow,
} from './template';
export type { ColumnKey, RowType, TemplateColumn, TemplateRow, TemplateValues } from './template';
