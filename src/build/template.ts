/**
 * The spreadsheet template for building a CWR 2.2 file: the one place that says what the columns are.
 *
 * One sheet, one row per line item. The first column, "Row type", says what the row describes:
 *
 *   WORK        the work itself (title, ISWC, language, length)
 *   WRITER      a writer of the work, ours (Controlled = Y) or somebody else's (Controlled = N)
 *   PUBLISHER   a publisher of the work, ours or somebody else's
 *   ALT TITLE   another title the work is known by
 *   PERFORMER   an artist who performs the work
 *   RECORDING   a recording of the work, with its ISRC
 *
 * Every row carries a "Work number" that ties it to its work. Shares are plain percentages ("33.33"), one column per right.
 * Everything here is invented text and plain data: no input or output happens in this module, and nothing reads a clock.
 */

import { ipiNameCheckDigits } from '../rules/defs/identifiers';
import { guardCsvCell } from '../tools/works-csv';

export const ROW_TYPES = ['WORK', 'WRITER', 'PUBLISHER', 'ALT TITLE', 'PERFORMER', 'RECORDING'] as const;
export type RowType = (typeof ROW_TYPES)[number];

/** The machine names of the columns. The sheet's own headers are in `TEMPLATE_COLUMNS`. */
export const COLUMN_KEYS = [
  'rowType',
  'workNumber',
  'title',
  'iswc',
  'language',
  'duration',
  'category',
  'partyKey',
  'controlled',
  'role',
  'name',
  'firstName',
  'ipi',
  'prSociety',
  'mrSociety',
  'srSociety',
  'prOwned',
  'mrOwned',
  'srOwned',
  'prCollected',
  'mrCollected',
  'srCollected',
  'territories',
  'publisher',
  'titleType',
  'isrc',
  'releaseDate',
  'album',
  'label',
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export interface TemplateColumn {
  /** The header as it stands in the sheet. */
  header: string;
  key: ColumnKey;
  /** Row types that must fill this column. */
  required: readonly RowType[];
  /** Row types that read this column (the required ones included). A value on any other row type is ignored, with a warning. */
  usedBy: readonly RowType[];
  /** One or two plain sentences for the person filling the sheet. */
  help: string;
  /** Other spellings of the header that are read as this column. */
  aliases?: readonly string[];
}

const ALL: readonly RowType[] = ROW_TYPES;
const PARTY: readonly RowType[] = ['WRITER', 'PUBLISHER'];

export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  {
    header: 'Row type',
    key: 'rowType',
    required: ALL,
    usedBy: ALL,
    help: 'What this row describes: WORK, WRITER, PUBLISHER, ALT TITLE, PERFORMER or RECORDING.',
    aliases: ['Type', 'Record type'],
  },
  {
    header: 'Work number',
    key: 'workNumber',
    required: ALL,
    usedBy: ALL,
    help: 'Your own number for the work, up to 14 characters. Every row of one work carries the same number, and each work has one WORK row.',
    aliases: ['Work no', 'Work #', 'Submitter work number'],
  },
  {
    header: 'Title',
    key: 'title',
    required: ['WORK', 'ALT TITLE'],
    usedBy: ['WORK', 'ALT TITLE', 'RECORDING'],
    help: 'The title of the work (WORK), the other title (ALT TITLE) or the title of the recording (RECORDING). Up to 60 characters.',
  },
  {
    header: 'ISWC',
    key: 'iswc',
    required: [],
    usedBy: ['WORK'],
    help: 'The work code, if it has one: T and ten digits. Dashes and dots are fine.',
  },
  {
    header: 'Language',
    key: 'language',
    required: [],
    usedBy: ['WORK', 'ALT TITLE'],
    help: 'Two-letter language code of the title, for example EN or FR.',
  },
  {
    header: 'Duration',
    key: 'duration',
    required: [],
    usedBy: ['WORK', 'RECORDING'],
    help: 'Length as minutes:seconds (3:25) or hours:minutes:seconds (1:03:25).',
  },
  {
    header: 'Category',
    key: 'category',
    required: [],
    usedBy: ['WORK'],
    help: 'POP, JAZ or UNC. Left empty, the file says UNC (unclassified).',
  },
  {
    header: 'Party key',
    key: 'partyKey',
    required: [],
    usedBy: PARTY,
    help: 'A short label of your choice for a publisher, such as P1, so a writer can name it in the Publisher column. Optional.',
    aliases: ['Row key', 'Key'],
  },
  {
    header: 'Controlled',
    key: 'controlled',
    required: PARTY,
    usedBy: PARTY,
    help: 'Y if you represent this writer or publisher and collect for them, N if not.',
  },
  {
    header: 'Role',
    key: 'role',
    required: ['WRITER'],
    usedBy: PARTY,
    help: 'Writer: C composer, A author of the words, CA both, AR arranger, AD adaptor, SR sub-arranger, SA sub-author, TR translator. Publisher: E (original publisher); empty means E.',
  },
  {
    header: 'Name',
    key: 'name',
    required: ['WRITER', 'PUBLISHER', 'PERFORMER'],
    usedBy: ['WRITER', 'PUBLISHER', 'PERFORMER'],
    help: 'A writer or performer: the last name, or the one name they go by. A publisher: the company name. Up to 45 characters.',
    aliases: ['Last name', 'Surname'],
  },
  {
    header: 'First name',
    key: 'firstName',
    required: [],
    usedBy: ['WRITER', 'PERFORMER'],
    help: 'The first name, if there is one. Up to 30 characters.',
  },
  {
    header: 'IPI name number',
    key: 'ipi',
    required: [],
    usedBy: ['WRITER', 'PUBLISHER', 'PERFORMER'],
    help: 'The 11-digit IPI name number. Required for a publisher you control. Leading zeros that a spreadsheet dropped are put back only when the padded number passes the check-digit test.',
    aliases: ['IPI', 'IPI name #', 'IPI number'],
  },
  {
    header: 'PR society',
    key: 'prSociety',
    required: [],
    usedBy: PARTY,
    help: 'Three-digit code of the society that handles performing rights for this party. Optional.',
  },
  {
    header: 'MR society',
    key: 'mrSociety',
    required: [],
    usedBy: PARTY,
    help: 'Three-digit code of the society that handles mechanical rights for this party. Optional.',
  },
  {
    header: 'SR society',
    key: 'srSociety',
    required: [],
    usedBy: PARTY,
    help: 'Three-digit code of the society that handles synchronization rights for this party. Optional.',
  },
  {
    header: 'PR owned %',
    key: 'prOwned',
    required: [],
    usedBy: PARTY,
    help: 'Share of the performing right this party owns, as a percentage such as 33.33. Empty means 0.',
  },
  {
    header: 'MR owned %',
    key: 'mrOwned',
    required: [],
    usedBy: PARTY,
    help: 'Share of the mechanical right this party owns, as a percentage. Empty means 0.',
  },
  {
    header: 'SR owned %',
    key: 'srOwned',
    required: [],
    usedBy: PARTY,
    help: 'Share of the synchronization right this party owns, as a percentage. Empty means 0.',
  },
  {
    header: 'PR collected %',
    key: 'prCollected',
    required: [],
    usedBy: PARTY,
    help: 'Controlled parties only: the performing share you collect for them. Empty means the same as PR owned %.',
  },
  {
    header: 'MR collected %',
    key: 'mrCollected',
    required: [],
    usedBy: PARTY,
    help: 'Controlled parties only: the mechanical share you collect for them. Empty means the same as MR owned %.',
  },
  {
    header: 'SR collected %',
    key: 'srCollected',
    required: [],
    usedBy: PARTY,
    help: 'Controlled parties only: the synchronization share you collect for them. Empty means the same as SR owned %.',
  },
  {
    header: 'Territories',
    key: 'territories',
    required: [],
    usedBy: PARTY,
    help: 'Controlled parties only: four-digit territory codes (TIS) separated by semicolons. Empty means 2136, the whole world.',
    aliases: ['Territory'],
  },
  {
    header: 'Publisher',
    key: 'publisher',
    required: [],
    usedBy: ['WRITER'],
    help: 'Controlled writers only: the publisher the writer is published by, named by that publisher row\'s Party key or its IPI name number. Several can be separated by semicolons.',
  },
  {
    header: 'Title type',
    key: 'titleType',
    required: [],
    usedBy: ['ALT TITLE'],
    help: 'Kind of alternative title: AT (alternative, the default), TE, FT, IT, TT, PT, RT, ET, OL or AL. OL and AL need a Language. The original title goes on the WORK row, so OT is not accepted.',
  },
  {
    header: 'ISRC',
    key: 'isrc',
    required: ['RECORDING'],
    usedBy: ['RECORDING'],
    help: 'The recording code: 12 letters and digits. Dashes are fine.',
  },
  {
    header: 'Release date',
    key: 'releaseDate',
    required: [],
    usedBy: ['RECORDING'],
    help: 'First release date as YYYY-MM-DD.',
  },
  {
    header: 'Album',
    key: 'album',
    required: [],
    usedBy: ['RECORDING'],
    help: 'Title of the album the recording first came out on. Up to 60 characters.',
  },
  {
    header: 'Label',
    key: 'label',
    required: [],
    usedBy: ['RECORDING'],
    help: 'The record label. Up to 60 characters.',
  },
];

const COLUMN_BY_KEY: ReadonlyMap<ColumnKey, TemplateColumn> = new Map(TEMPLATE_COLUMNS.map(c => [c.key, c]));

/** The column for a key. */
export function columnOf(key: ColumnKey): TemplateColumn {
  return COLUMN_BY_KEY.get(key)!;
}

/** The text values of one spreadsheet row, by column key. A cell with nothing in it is the empty string. */
export type TemplateValues = { [K in ColumnKey]: string };

export interface TemplateRow extends TemplateValues {
  /** The row's place in the spreadsheet: 1 is the header row, so the first line of data is 2. */
  rowNumber: number;
}

/** A row made from some of its values; the rest are empty. */
export function templateRow(values: Partial<TemplateValues>, rowNumber = 0): TemplateRow {
  const row = { rowNumber } as TemplateRow;
  for (const key of COLUMN_KEYS) row[key] = values[key] ?? '';
  return row;
}

// ------------------------------------------------------------------ CSV out

/**
 * One CSV cell: quoted when it holds a comma, a quote or a line break. A cell that starts with =, +, - or @ gets a leading
 * apostrophe so that a spreadsheet does not read it as a formula (the same guard the works CSV uses).
 */
function csvCell(value: string): string {
  const safe = guardCsvCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows of cells as CSV text, one CRLF-ended line per row. */
export function formatCsv(table: ReadonlyArray<readonly string[]>): string {
  return table.map(r => r.map(csvCell).join(',') + '\r\n').join('');
}

/** The header row of the template, as cells. */
export const TEMPLATE_HEADERS: readonly string[] = TEMPLATE_COLUMNS.map(c => c.header);

/** A blank template: the header row and nothing else. */
export function templateCsv(): string {
  return formatCsv([TEMPLATE_HEADERS]);
}

/** Rows as CSV text with the template's header row on top. */
export function rowsCsv(rows: readonly TemplateRow[]): string {
  return formatCsv([TEMPLATE_HEADERS, ...rows.map(r => COLUMN_KEYS.map(k => r[k]))]);
}

// ------------------------------------------------------------------ the filled example

/** An invented IPI name number for the example: nine digits in a range no real person is known to hold, and its check digits. */
function exampleIpi(n: number): string {
  const body = `9990${String(n).padStart(5, '0')}`;
  return body + ipiNameCheckDigits(body);
}

const E = {
  ana: exampleIpi(1),
  ben: exampleIpi(2),
  cleo: exampleIpi(3),
  pubOne: exampleIpi(4),
  pubTwo: exampleIpi(5),
  pubThree: exampleIpi(6),
};

/**
 * A filled example: three invented works with invented people, in the order the template expects. It builds into a file with no
 * errors from the checker. Every name, number and code in it is made up.
 */
export const EXAMPLE_ROWS: readonly TemplateRow[] = (
  [
    // Work 1: two controlled writers published by one controlled publisher, plus an alternative title, a performer and a recording.
    { rowType: 'WORK', workNumber: 'EX-0001', title: 'Paper Lanterns', iswc: 'T-999.000.001-0', language: 'EN', duration: '3:25', category: 'POP' },
    {
      rowType: 'PUBLISHER', workNumber: 'EX-0001', partyKey: 'P1', controlled: 'Y', role: 'E', name: 'Example Songs Publishing', ipi: E.pubOne,
      prOwned: '25', mrOwned: '50', srOwned: '50', territories: '2136',
    },
    {
      rowType: 'PUBLISHER', workNumber: 'EX-0001', partyKey: 'P2', controlled: 'Y', role: 'E', name: 'Sample Tunes Limited', ipi: E.pubTwo,
      prOwned: '25', mrOwned: '50', srOwned: '50', territories: '2136',
    },
    {
      rowType: 'WRITER', workNumber: 'EX-0001', controlled: 'Y', role: 'CA', name: 'Quillfeather', firstName: 'Ana', ipi: E.ana,
      prOwned: '25', publisher: 'P1', territories: '2136',
    },
    {
      rowType: 'WRITER', workNumber: 'EX-0001', controlled: 'Y', role: 'C', name: 'Marblehaven', firstName: 'Ben', ipi: E.ben,
      prOwned: '25', publisher: 'P2', territories: '2136',
    },
    { rowType: 'ALT TITLE', workNumber: 'EX-0001', title: 'Lanternes de Papier', titleType: 'AT', language: 'FR' },
    { rowType: 'PERFORMER', workNumber: 'EX-0001', name: 'The Fernbridge Four' },
    {
      rowType: 'RECORDING', workNumber: 'EX-0001', title: 'Paper Lanterns', isrc: 'ZZ-EX1-26-00001', duration: '3:25', releaseDate: '2026-03-06',
      album: 'Example Album', label: 'Example Records',
    },
    // Work 2: three writers split 33.33 / 33.33 / 33.34, one of them ours; the publishers hold the mechanical and sync shares, one of them not ours.
    { rowType: 'WORK', workNumber: 'EX-0002', title: 'Third Window', language: 'EN', duration: '2:58' },
    {
      rowType: 'PUBLISHER', workNumber: 'EX-0002', partyKey: 'P1', controlled: 'Y', name: 'Example Songs Publishing', ipi: E.pubOne,
      mrOwned: '50', srOwned: '50', territories: '0826;0840',
    },
    { rowType: 'PUBLISHER', workNumber: 'EX-0002', controlled: 'N', name: 'Outside Publishing Placeholder', ipi: E.pubThree, mrOwned: '50', srOwned: '50' },
    {
      rowType: 'WRITER', workNumber: 'EX-0002', controlled: 'Y', role: 'C', name: 'Quillfeather', firstName: 'Ana', ipi: E.ana,
      prOwned: '33.33', publisher: E.pubOne, territories: '0826;0840',
    },
    { rowType: 'WRITER', workNumber: 'EX-0002', controlled: 'N', role: 'A', name: 'Nightorchard', firstName: 'Cleo', ipi: E.cleo, prOwned: '33.33' },
    { rowType: 'WRITER', workNumber: 'EX-0002', controlled: 'N', role: 'A', name: 'Tinderwick', prOwned: '33.34' },
    // Work 3: a single writer who is also the only owner, no publisher.
    { rowType: 'WORK', workNumber: 'EX-0003', title: 'Quiet Orchard' },
    {
      rowType: 'WRITER', workNumber: 'EX-0003', controlled: 'Y', role: 'CA', name: 'Marblehaven', firstName: 'Ben', ipi: E.ben,
      prOwned: '100', mrOwned: '100', srOwned: '100',
    },
  ] as Array<Partial<TemplateValues>>
).map((v, i) => templateRow(v, i + 2));

/** The example as CSV text. */
export function exampleCsv(): string {
  return rowsCsv(EXAMPLE_ROWS);
}
