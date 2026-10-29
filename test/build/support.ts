import { check, checkRows, templateRow } from '../../src/index';
import type { BuildHeader, CwrDoc, RowProblem, TemplateRow, TemplateValues } from '../../src/index';

export const HEADER: BuildHeader = {
  senderType: 'PB',
  senderId: '123456789',
  senderName: 'Example Sender',
  creationDate: '20261029',
  creationTime: '120000',
  transmissionDate: '20261029',
};

/** Rows from partial values, numbered from 2 (row 1 is the header row). */
export function rows(...values: Array<Partial<TemplateValues>>): TemplateRow[] {
  return values.map((v, i) => templateRow(v, i + 2));
}

/** One work with one controlled writer who owns everything: a sheet with no problems. */
export function goodRows(): Array<Partial<TemplateValues>> {
  return [
    { rowType: 'WORK', workNumber: 'W1', title: 'Test Song' },
    { rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'CA', name: 'Quillfeather', firstName: 'Ana', prOwned: '100', mrOwned: '100', srOwned: '100' },
  ];
}

/** The goodRows with some rows changed: `patch(i, values)` merges into row i, `add` appends. */
export function withRows(patches: Array<[number, Partial<TemplateValues>]> = [], add: Array<Partial<TemplateValues>> = []): TemplateRow[] {
  const base = goodRows();
  for (const [i, v] of patches) base[i] = { ...base[i]!, ...v };
  return rows(...base, ...add);
}

export const codes = (problems: readonly RowProblem[]): string[] => problems.map(p => p.code);

/** The problems with this code, or fail. */
export function only(problems: readonly RowProblem[], code: string): RowProblem[] {
  return problems.filter(p => p.code === code);
}

export function errorsOf(rowsIn: readonly TemplateRow[]): RowProblem[] {
  return checkRows(rowsIn).filter(p => p.severity === 'error');
}

/** The checker's errors on a built document. */
export function checkerErrors(doc: CwrDoc): string[] {
  return check(doc).problems.filter(p => p.severity === 'error').map(p => `${p.ruleId} line ${p.line + 1}: ${p.message}`);
}
