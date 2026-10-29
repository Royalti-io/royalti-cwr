import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOOKUPS } from '../../src/spec/lookups/index';
import { checkRows, formatRowProblem, identifierCheck } from '../../src/index';
import type { RowProblem, TemplateRow, TemplateValues } from '../../src/index';
import { errorsOf, goodRows, rows, withRows } from './support';

type V = Partial<TemplateValues>;

const PUB: V = { rowType: 'PUBLISHER', workNumber: 'W1', partyKey: 'P1', controlled: 'Y', name: 'Test Publishing', ipi: '99900000452' };
const IPI_OK = '99900000158';

/** The first problem with this code, or a failure that lists what was found. */
const exercised = new Set<string>();

function find(rowsIn: readonly TemplateRow[], code: string): RowProblem {
  exercised.add(code);
  const all = checkRows(rowsIn);
  const hit = all.find(p => p.code === code);
  if (!hit) throw new Error(`no ${code} problem; found: ${all.map(p => `${p.code}@${p.row}`).join(', ') || 'none'}`);
  return hit;
}

/** A pair of publisher and writer rows that make a clean work, for the checks that need a publisher. */
function pubWork(over: { pub?: V; writer?: V; extra?: V[] } = {}): TemplateRow[] {
  return rows(
    { rowType: 'WORK', workNumber: 'W1', title: 'Test Song' },
    { ...PUB, prOwned: '50', mrOwned: '100', srOwned: '100', ...over.pub },
    { rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'CA', name: 'Quillfeather', ipi: IPI_OK, prOwned: '50', publisher: 'P1', ...over.writer },
    ...(over.extra ?? []),
  );
}

describe('a clean sheet', () => {
  it('has no problems', () => {
    expect(checkRows(withRows())).toEqual([]);
    expect(checkRows(pubWork())).toEqual([]);
  });

  it('is not told it is valid, and its messages say what and where', () => {
    const bad = checkRows(withRows([[0, { title: '' }], [1, { ipi: '12ab' }]]));
    for (const p of bad) {
      expect(p.message).not.toMatch(/\bvalid\b/i);
      expect(p.message.length).toBeGreaterThan(15);
      expect(formatRowProblem(p)).toContain(`Row ${p.row}`);
    }
    expect(formatRowProblem({ row: 4, column: 'ISWC', severity: 'error', code: 'x', message: 'M.' })).toBe('Row 4, "ISWC": M.');
    expect(formatRowProblem({ row: 4, column: '', severity: 'error', code: 'x', message: 'M.' })).toBe('Row 4: M.');
  });

  it('numbers problems by spreadsheet row and names the column by its header', () => {
    const p = find(withRows([[1, { prOwned: 'abc' }]]), 'bad-share');
    expect(p).toMatchObject({ row: 3, column: 'PR owned %', severity: 'error' });
  });

  it('lists problems by row, then by column', () => {
    const all = checkRows(withRows([[0, { title: '', iswc: 'x' }], [1, { name: '', ipi: 'y' }]]));
    const rowsSeen = all.map(p => p.row);
    expect(rowsSeen).toEqual([...rowsSeen].sort((a, b) => a - b));
    const row2 = all.filter(p => p.row === 2).map(p => p.column);
    expect(row2).toEqual(['Title', 'ISWC']);
  });
});

describe('rows and works', () => {
  it('unknown-row-type: a row type that is empty or not one of the six', () => {
    expect(find(withRows([[1, { rowType: 'SONG' }]]), 'unknown-row-type')).toMatchObject({ row: 3, column: 'Row type', severity: 'error' });
    expect(find(withRows([[1, { rowType: '' }]]), 'unknown-row-type').message).toContain('empty');
  });

  it('reads row types in any case and a few other spellings', () => {
    const r = rows(
      { rowType: 'work', workNumber: 'W1', title: 'T' },
      { rowType: ' Writer ', workNumber: 'W1', controlled: 'y', role: 'ca', name: 'Q', prOwned: '100', mrOwned: '100', srOwned: '100' },
      { rowType: 'alt_title', workNumber: 'W1', title: 'Other' },
      { rowType: 'Alternative title', workNumber: 'W1', title: 'Other two' },
      { rowType: 'artist', workNumber: 'W1', name: 'Band' },
    );
    expect(checkRows(r)).toEqual([]);
  });

  it('missing-work-number: a row with no work number', () => {
    expect(find(withRows([[1, { workNumber: '' }]]), 'missing-work-number')).toMatchObject({ row: 3, column: 'Work number', severity: 'error' });
  });

  it('work-number-too-long: more than 14 characters', () => {
    expect(find(withRows([[0, { workNumber: 'ABCDEFGHIJKLMNO' }]]), 'work-number-too-long')).toMatchObject({ row: 2, column: 'Work number', severity: 'error' });
  });

  it('duplicate-work-number: two WORK rows with one number, compared without regard to case', () => {
    const p = find(withRows([], [{ rowType: 'WORK', workNumber: 'w1', title: 'Again' }]), 'duplicate-work-number');
    expect(p).toMatchObject({ row: 4, column: 'Work number', severity: 'error' });
    expect(p.message).toContain('row 2');
  });

  it('no-work-row: a row whose work number has no WORK row', () => {
    expect(find(withRows([[1, { workNumber: 'W2' }]]), 'no-work-row')).toMatchObject({ row: 3, column: 'Work number', severity: 'error' });
  });

  it('no-works: nothing to build', () => {
    expect(checkRows([])[0]).toMatchObject({ code: 'no-works', severity: 'error' });
    expect(find(rows({ rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'C', name: 'X' }), 'no-works').severity).toBe('error');
  });

  it('missing-title: a work or an alternative title without a title', () => {
    expect(find(withRows([[0, { title: '' }]]), 'missing-title')).toMatchObject({ row: 2, column: 'Title', severity: 'error' });
    expect(find(withRows([], [{ rowType: 'ALT TITLE', workNumber: 'W1' }]), 'missing-title').row).toBe(4);
  });

  it('text-too-long: a title past 60 characters is cut, with a warning', () => {
    const p = find(withRows([[0, { title: 'A'.repeat(70) }]]), 'text-too-long');
    expect(p).toMatchObject({ row: 2, column: 'Title', severity: 'warning' });
    expect(p.message).toContain('70');
  });

  it('unsupported-character: a letter the builder does not write, and one that cannot be capitalised in place', () => {
    expect(find(withRows([[0, { title: 'Привет' }]]), 'unsupported-character')).toMatchObject({ row: 2, column: 'Title', severity: 'error' });
    expect(find(withRows([[0, { title: 'µ song' }]]), 'unsupported-character').row).toBe(2);
  });

  it('bad-character: a control character in a cell', () => {
    expect(find(withRows([[0, { title: 'Bad\u0001title' }]]), 'bad-character')).toMatchObject({ row: 2, column: 'Title' });
  });

  it('ignored-value: a value in a column the row type does not use', () => {
    expect(find(withRows([[0, { controlled: 'Y' }]]), 'ignored-value')).toMatchObject({ row: 2, column: 'Controlled', severity: 'warning' });
    expect(find(withRows([[1, { isrc: 'GBAYE0601498' }]]), 'ignored-value').column).toBe('ISRC');
  });

  it('ignored-value: collection columns on a party you do not control', () => {
    const p = find(withRows([[1, { controlled: 'N', territories: '2136' }]]), 'ignored-value');
    expect(p).toMatchObject({ row: 3, column: 'Territories', severity: 'warning' });
  });
});

describe('writers and publishers', () => {
  it('missing-name', () => {
    expect(find(withRows([[1, { name: '' }]]), 'missing-name')).toMatchObject({ row: 3, column: 'Name', severity: 'error' });
    expect(find(withRows([], [{ rowType: 'PERFORMER', workNumber: 'W1' }]), 'missing-name').row).toBe(4);
  });

  it('bad-controlled-flag', () => {
    expect(find(withRows([[1, { controlled: '' }]]), 'bad-controlled-flag')).toMatchObject({ row: 3, column: 'Controlled', severity: 'error' });
    expect(find(withRows([[1, { controlled: 'maybe' }]]), 'bad-controlled-flag').message).toContain('maybe');
  });

  it('missing-role: a writer without a role', () => {
    expect(find(withRows([[1, { role: '' }]]), 'missing-role')).toMatchObject({ row: 3, column: 'Role', severity: 'error' });
  });

  it('unknown-writer-role and unsupported-writer-role', () => {
    expect(find(withRows([[1, { role: 'ZZ' }]]), 'unknown-writer-role')).toMatchObject({ row: 3, column: 'Role', severity: 'error' });
    expect(find(withRows([[1, { role: 'PA' }]]), 'unsupported-writer-role')).toMatchObject({ row: 3, column: 'Role', severity: 'error' });
  });

  it('unknown-publisher-role and unsupported-publisher-role; an empty publisher role means E', () => {
    expect(find(pubWork({ pub: { role: 'ZZ' } }), 'unknown-publisher-role')).toMatchObject({ row: 3, column: 'Role', severity: 'error' });
    expect(find(pubWork({ pub: { role: 'AM' } }), 'unsupported-publisher-role')).toMatchObject({ row: 3, column: 'Role', severity: 'error' });
    expect(checkRows(pubWork({ pub: { role: '' } }))).toEqual([]);
  });

  it('no-writer: a work with no WRITER row', () => {
    expect(find(rows({ rowType: 'WORK', workNumber: 'W1', title: 'T' }), 'no-writer')).toMatchObject({ row: 2, severity: 'error' });
  });

  it('no-creator: writers, but none a composer or author', () => {
    const p = find(withRows([[1, { role: 'AR' }]]), 'no-creator');
    expect(p).toMatchObject({ row: 2, severity: 'error' });
  });

  it('no-controlled-party: nobody on the work is yours', () => {
    expect(find(withRows([[1, { controlled: 'N' }]]), 'no-controlled-party')).toMatchObject({ row: 2, severity: 'warning' });
  });

  it('creator-without-share: a modification where the creator has no share and no controlled arranger has one', () => {
    const r = withRows([[1, { prOwned: '', mrOwned: '', srOwned: '' }]], [{ rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'AR', name: 'Arranger', prOwned: '100', mrOwned: '100', srOwned: '100' }]);
    expect(find(r, 'creator-without-share')).toMatchObject({ row: 3, column: 'Role', severity: 'error' });
    const fixed = withRows([[1, { prOwned: '', mrOwned: '', srOwned: '' }]], [{ rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'AR', name: 'Arranger', prOwned: '100', mrOwned: '100', srOwned: '100' }]);
    expect(checkRows(fixed).filter(p => p.severity === 'error')).toEqual([]);
  });
});

describe('identifiers', () => {
  it('bad-ipi: not digits, all zeros, scientific notation, or short in a way that cannot be repaired', () => {
    expect(find(withRows([[1, { ipi: '12ab' }]]), 'bad-ipi')).toMatchObject({ row: 3, column: 'IPI name number', severity: 'error' });
    expect(find(withRows([[1, { ipi: '0' }]]), 'bad-ipi').message).toContain('zeros');
    expect(find(withRows([[1, { ipi: '1.23457E+10' }]]), 'bad-ipi').message).toContain('scientific');
    expect(find(withRows([[1, { ipi: '123456789012' }]]), 'bad-ipi').row).toBe(3);
    const short = find(withRows([[1, { ipi: '12345' }]]), 'bad-ipi');
    expect(short.message).toContain('not been guessed');
  });

  it('puts back leading zeros that a spreadsheet dropped, only when the number then passes the check-digit test', () => {
    let short = '';
    for (let n = 1; n < 100 && short === ''; n++) {
      const padded = String(n * 7919).padStart(9, '0');
      for (let c = 0; c < 100; c++) {
        const candidate = padded + String(c).padStart(2, '0');
        if (candidate.startsWith('00') && identifierCheck('ipiName', candidate).ok) {
          short = candidate.replace(/^0+/, '');
          break;
        }
      }
    }
    expect(short.length).toBeLessThan(11);
    expect(checkRows(withRows([[1, { ipi: short }]]))).toEqual([]);
  });

  it('ipi-check-digits: eleven digits that fail the test are a warning, as in the checker', () => {
    const p = find(withRows([[1, { ipi: '99900000199' }]]), 'ipi-check-digits');
    expect(p).toMatchObject({ row: 3, column: 'IPI name number', severity: 'warning' });
    expect(checkRows(withRows([[1, { ipi: '999.000.001-58' }]]))).toEqual([]);
  });

  it('bad-iswc: shape only, no check digit', () => {
    expect(find(withRows([[0, { iswc: 'T123' }]]), 'bad-iswc')).toMatchObject({ row: 2, column: 'ISWC', severity: 'error' });
    expect(checkRows(withRows([[0, { iswc: 'T-034.524.680-1' }]]))).toEqual([]);
    expect(checkRows(withRows([[0, { iswc: 'T0345246800' }]]))).toEqual([]);
    for (const p of checkRows(withRows([[0, { iswc: 'x' }]]))) expect(p.message).not.toMatch(/check.?digit/i);
  });

  it('bad-isrc and missing-isrc', () => {
    expect(find(withRows([], [{ rowType: 'RECORDING', workNumber: 'W1', isrc: 'ABC' }]), 'bad-isrc')).toMatchObject({ row: 4, column: 'ISRC', severity: 'error' });
    expect(find(withRows([], [{ rowType: 'RECORDING', workNumber: 'W1' }]), 'missing-isrc')).toMatchObject({ row: 4, column: 'ISRC', severity: 'error' });
    expect(checkRows(withRows([], [{ rowType: 'RECORDING', workNumber: 'W1', isrc: 'gb-aye-06-01498' }]))).toEqual([]);
  });

  it('missing-ipi: a publisher you control has no IPI name number', () => {
    expect(find(pubWork({ pub: { ipi: '' } }), 'missing-ipi')).toMatchObject({ row: 3, column: 'IPI name number', severity: 'error' });
  });

  it('publisher-needs-ipi: a publisher you do not control, named like a society, has no IPI name number', () => {
    const r = pubWork({ extra: [{ rowType: 'PUBLISHER', workNumber: 'W1', controlled: 'N', name: 'ACUM' }] });
    expect(find(r, 'publisher-needs-ipi')).toMatchObject({ row: 5, column: 'IPI name number', severity: 'error' });
  });

  it('bad-society and unknown-society', () => {
    expect(find(withRows([[1, { prSociety: 'BMI' }]]), 'bad-society')).toMatchObject({ row: 3, column: 'PR society', severity: 'error' });
    let unknown = '';
    for (let n = 999; n > 0 && unknown === ''; n--) {
      const code = String(n).padStart(3, '0');
      if (!LOOKUPS.societyCode.has(code) && !LOOKUPS.transmitterCode.has(code)) unknown = code;
    }
    expect(find(withRows([[1, { mrSociety: unknown }]]), 'unknown-society')).toMatchObject({ row: 3, column: 'MR society', severity: 'warning' });
    expect(checkRows(withRows([[1, { prSociety: '21' }]]))).toEqual([]);
  });
});

describe('other cells', () => {
  it('unknown-language', () => {
    expect(find(withRows([[0, { language: 'XX' }]]), 'unknown-language')).toMatchObject({ row: 2, column: 'Language', severity: 'error' });
    expect(checkRows(withRows([[0, { language: 'en' }]]))).toEqual([]);
  });

  it('unknown-category and unsupported-category', () => {
    expect(find(withRows([[0, { category: 'ROCK' }]]), 'unknown-category')).toMatchObject({ row: 2, column: 'Category', severity: 'error' });
    expect(find(withRows([[0, { category: 'SER' }]]), 'unsupported-category')).toMatchObject({ row: 2, column: 'Category', severity: 'error' });
  });

  it('bad-duration', () => {
    expect(find(withRows([[0, { duration: '3:99' }]]), 'bad-duration')).toMatchObject({ row: 2, column: 'Duration', severity: 'error' });
    expect(find(withRows([[0, { duration: '205' }]]), 'bad-duration').row).toBe(2);
    expect(checkRows(withRows([[0, { duration: '1:03:25' }]]))).toEqual([]);
  });

  it('bad-date', () => {
    const r = withRows([], [{ rowType: 'RECORDING', workNumber: 'W1', isrc: 'GBAYE0601498', releaseDate: '2026-02-30' }]);
    expect(find(r, 'bad-date')).toMatchObject({ row: 4, column: 'Release date', severity: 'error' });
  });

  it('unknown-title-type and alt-title-needs-language', () => {
    expect(find(withRows([], [{ rowType: 'ALT TITLE', workNumber: 'W1', title: 'X', titleType: 'XX' }]), 'unknown-title-type')).toMatchObject({ row: 4, column: 'Title type', severity: 'error' });
    expect(find(withRows([], [{ rowType: 'ALT TITLE', workNumber: 'W1', title: 'X', titleType: 'OL' }]), 'alt-title-needs-language')).toMatchObject({ row: 4, column: 'Language', severity: 'error' });
    expect(checkRows(withRows([], [{ rowType: 'ALT TITLE', workNumber: 'W1', title: 'X', titleType: 'OL', language: 'EN' }]))).toEqual([]);
  });
});

describe('territories', () => {
  it('bad-territory', () => {
    expect(find(withRows([[1, { territories: 'UK' }]]), 'bad-territory')).toMatchObject({ row: 3, column: 'Territories', severity: 'error' });
  });

  it('unknown-territory is an error that says the code is not a current territory code', () => {
    const p = find(withRows([[1, { territories: '9999' }]]), 'unknown-territory');
    expect(p).toMatchObject({ row: 3, column: 'Territories', severity: 'error' });
    expect(p.message).toContain('not a current territory code');
    expect(errorsOf(withRows([[1, { territories: '0826; 9999' }]])).map(x => x.code)).toEqual(['unknown-territory']);
  });

  it('duplicate-territory and territory-group are warnings', () => {
    expect(find(withRows([[1, { territories: '2136;2136' }]]), 'duplicate-territory').severity).toBe('warning');
    expect(find(withRows([[1, { territories: '2100' }]]), 'territory-group').severity).toBe('warning');
  });

  it('puts back a leading zero a spreadsheet dropped, and splits on semicolons, commas or spaces', () => {
    expect(checkRows(withRows([[1, { territories: '826, 840 2136' }]])).filter(p => p.severity === 'error')).toEqual([]);
  });
});

describe('shares', () => {
  it('bad-share: not a number, or more than two decimals', () => {
    expect(find(withRows([[1, { prOwned: 'half' }]]), 'bad-share')).toMatchObject({ row: 3, column: 'PR owned %', severity: 'error' });
    expect(find(withRows([[1, { mrOwned: '33.333' }]]), 'bad-share').message).toContain('two decimal');
    expect(find(withRows([[1, { srOwned: '-5' }]]), 'bad-share').row).toBe(3);
  });

  it('reads 33.33, 33,33, 33.33% and 33.330, and a plain 0', () => {
    for (const v of ['33.33', '33,33', '33.33%', ' 33.330 ']) {
      const r = withRows([[1, { prOwned: v, mrOwned: v, srOwned: v }]]);
      expect(find(r, 'share-total').message).toContain('33.33%');
    }
  });

  it('share-out-of-range: over 100%, and a publisher over 50% of the performing right', () => {
    expect(find(withRows([[1, { prOwned: '150' }]]), 'share-out-of-range')).toMatchObject({ row: 3, column: 'PR owned %', severity: 'error' });
    expect(find(pubWork({ pub: { prOwned: '60' }, writer: { prOwned: '40' } }), 'share-out-of-range')).toMatchObject({ row: 3, column: 'PR owned %', severity: 'error' });
    expect(find(pubWork({ pub: { prCollected: '60' } }), 'share-out-of-range').column).toBe('PR collected %');
  });

  it('share-total: a right that does not add up to 100% or 0%, named per right', () => {
    const p = find(withRows([[1, { prOwned: '60' }]]), 'share-total');
    expect(p).toMatchObject({ row: 2, column: 'PR owned %', severity: 'error' });
    expect(p.message).toContain('60%');
    const r = checkRows(withRows([[1, { prOwned: '60', mrOwned: '99', srOwned: '100' }]])).filter(x => x.code === 'share-total');
    expect(r.map(x => x.column)).toEqual(['PR owned %', 'MR owned %']);
  });

  it('share-total: the checker allows 0.06% either way', () => {
    expect(checkRows(withRows([[1, { prOwned: '99.94', mrOwned: '100.00', srOwned: '100' }]]))).toEqual([]);
    expect(find(withRows([[1, { prOwned: '99.93' }]]), 'share-total').row).toBe(2);
    expect(checkRows(withRows([[1, { prOwned: '', mrOwned: '', srOwned: '' }]]))).toEqual([]);
  });

  it('share-total: three writers at 33.33, 33.33 and 33.34 add up', () => {
    const w = (n: string, v: string): V => ({ rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'C', name: n, prOwned: v, mrOwned: v, srOwned: v });
    const r = rows({ rowType: 'WORK', workNumber: 'W1', title: 'T' }, w('A', '33.33'), w('B', '33.33'), w('C', '33.34'));
    expect(checkRows(r).filter(p => p.severity === 'error')).toEqual([]);
  });

  it('publisher-pr-total: publishers together over 50% of the performing right', () => {
    const r = rows(
      { rowType: 'WORK', workNumber: 'W1', title: 'T' },
      { ...PUB, prOwned: '30', mrOwned: '50', srOwned: '50' },
      { ...PUB, partyKey: 'P2', name: 'Second Publishing', ipi: '99900000550', prOwned: '30', mrOwned: '50', srOwned: '50' },
      { rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'CA', name: 'Q', prOwned: '40' },
    );
    expect(find(r, 'publisher-pr-total')).toMatchObject({ row: 2, column: 'PR owned %', severity: 'error' });
  });

  it('writer-pr-total: writers with a performing share that is under half', () => {
    const r = rows(
      { rowType: 'WORK', workNumber: 'W1', title: 'T' },
      { rowType: 'PUBLISHER', workNumber: 'W1', controlled: 'N', name: 'Other Publishing', ipi: '99900000550', prOwned: '50', mrOwned: '100', srOwned: '100' },
      { rowType: 'PUBLISHER', workNumber: 'W1', controlled: 'N', name: 'Third Publishing', ipi: '99900000648', prOwned: '10', mrOwned: '0', srOwned: '0' },
      { rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'CA', name: 'Q', prOwned: '40' },
    );
    expect(find(r, 'writer-pr-total')).toMatchObject({ row: 2, severity: 'error' });
  });

  it('publisher-no-ownership: a publisher you control owns nothing', () => {
    const r = pubWork({ pub: { prOwned: '', mrOwned: '', srOwned: '' }, writer: { prOwned: '100', mrOwned: '100', srOwned: '100' } });
    expect(find(r, 'publisher-no-ownership')).toMatchObject({ row: 3, severity: 'error' });
  });

  it('collection-not-ownership: the performing share collected for a publisher differs from the one it owns', () => {
    expect(find(pubWork({ pub: { prCollected: '25' } }), 'collection-not-ownership')).toMatchObject({ row: 3, column: 'PR collected %', severity: 'error' });
  });

  it('collection-over-100: shares collected in one territory add up to more than 100%', () => {
    const w = (n: string): V => ({ rowType: 'WRITER', workNumber: 'W1', controlled: 'Y', role: 'C', name: n, prOwned: '50', prCollected: '60' });
    const r = rows({ rowType: 'WORK', workNumber: 'W1', title: 'T' }, w('A'), w('B'));
    expect(find(r, 'collection-over-100')).toMatchObject({ row: 2, column: 'PR collected %', severity: 'error' });
    const apart = rows({ rowType: 'WORK', workNumber: 'W1', title: 'T' }, { ...w('A'), territories: '0826' }, { ...w('B'), territories: '0840' });
    expect(checkRows(apart).some(p => p.code === 'collection-over-100')).toBe(false);
  });
});

describe('publisher links', () => {
  it('publisher-not-found', () => {
    expect(find(pubWork({ writer: { publisher: 'P9' } }), 'publisher-not-found')).toMatchObject({ row: 4, column: 'Publisher', severity: 'error' });
  });

  it('links by Party key (any case) or by IPI name number, several at once', () => {
    expect(checkRows(pubWork({ writer: { publisher: 'p1' } }))).toEqual([]);
    expect(checkRows(pubWork({ writer: { publisher: '99900000452' } }))).toEqual([]);
    expect(checkRows(pubWork({ writer: { publisher: '99900000452; P1' } }))).toEqual([]);
  });

  it('ambiguous-publisher-link: two publisher rows match', () => {
    const r = pubWork({ writer: { publisher: '99900000452' }, extra: [{ ...PUB, partyKey: 'P2', prOwned: '' , mrOwned: '', srOwned: '' }] });
    expect(find(r, 'ambiguous-publisher-link')).toMatchObject({ row: 4, column: 'Publisher', severity: 'error' });
  });

  it('duplicate-party-key', () => {
    const r = pubWork({ extra: [{ ...PUB, ipi: '99900000550', name: 'Second', prOwned: '', mrOwned: '', srOwned: '' }] });
    expect(find(r, 'duplicate-party-key')).toMatchObject({ row: 5, column: 'Party key', severity: 'error' });
  });

  it('link-to-uncontrolled-publisher', () => {
    expect(find(pubWork({ pub: { controlled: 'N' } }), 'link-to-uncontrolled-publisher')).toMatchObject({ row: 4, column: 'Publisher', severity: 'error' });
  });

  it('writer-needs-publisher: writers do not own everything and a controlled writer names no publisher', () => {
    const p = find(pubWork({ writer: { publisher: '' } }), 'writer-needs-publisher');
    expect(p).toMatchObject({ row: 4, column: 'Publisher', severity: 'error' });
    // Writers who own every right in full need no link.
    const full = pubWork({ pub: { prOwned: '', mrOwned: '', srOwned: '' }, writer: { publisher: '', prOwned: '100', mrOwned: '100', srOwned: '100' } });
    expect(checkRows(full).some(x => x.code === 'writer-needs-publisher')).toBe(false);
  });

  it('a link on a writer you do not control is ignored, with a warning', () => {
    const p = find(pubWork({ writer: { controlled: 'N' } }), 'ignored-value');
    expect(p).toMatchObject({ row: 4, severity: 'warning' });
  });
});

describe('review fixes', () => {
  const alt = (v: V): V => ({ rowType: 'ALT TITLE', workNumber: 'W1', title: 'Other Name', ...v });

  it('refuses the title type OT on an alternative title, and does not offer it', () => {
    const p = find(withRows([], [alt({ titleType: 'OT' })]), 'original-title-not-allowed');
    expect(p).toMatchObject({ row: 4, column: 'Title type', severity: 'error' });
    expect(p.message).toContain('WORK row');
    const unknown = find(withRows([], [alt({ titleType: 'XX' })]), 'unknown-title-type');
    expect(unknown.message).not.toMatch(/\bOT\b/);
    expect(find(withRows([], [alt({ titleType: 'ot' })]), 'original-title-not-allowed').row).toBe(4);
  });

  it('refuses control characters from the C1 range and the soft hyphen, not only the first 32', () => {
    for (const bad of ['Song\u0085Two', 'Song\u0096Two', 'Song\u009fTwo', 'Song\u007fTwo', 'Soft­Hyphen']) {
      expect(find(withRows([[0, { title: bad }]]), 'bad-character')).toMatchObject({ row: 2, column: 'Title', severity: 'error' });
    }
  });

  it('warns about a letter outside plain ASCII, except in a national-language alternative title', () => {
    expect(find(withRows([[0, { title: 'Café' }]]), 'non-ascii-text')).toMatchObject({ row: 2, column: 'Title', severity: 'warning' });
    expect(find(withRows([[1, { name: 'Müller' }]]), 'non-ascii-text')).toMatchObject({ row: 3, column: 'Name', severity: 'warning' });
    expect(find(withRows([[0, { workNumber: 'WÉ1' }], [1, { workNumber: 'WÉ1' }]]), 'non-ascii-text')).toMatchObject({ row: 2, column: 'Work number', severity: 'warning' });
    const ordinary = checkRows(withRows([], [alt({ title: 'Café', titleType: 'AT' })]));
    expect(ordinary.filter(p => p.code === 'non-ascii-text')).toHaveLength(1);
    for (const titleType of ['OL', 'AL']) {
      expect(checkRows(withRows([], [alt({ title: 'Café', titleType, language: 'FR' })])).filter(p => p.code === 'non-ascii-text')).toEqual([]);
    }
  });

  it('counts width in capitals, so a letter that grows is measured as written', () => {
    const title = find(withRows([[0, { title: 'ß'.repeat(40) }]]), 'text-too-long');
    expect(title).toMatchObject({ row: 2, column: 'Title', severity: 'warning' });
    expect(title.message).toContain('80 characters');
    expect(find(withRows([[0, { workNumber: 'ß'.repeat(8) }], [1, { workNumber: 'ß'.repeat(8) }]]), 'work-number-too-long')).toMatchObject({ row: 2, column: 'Work number', severity: 'error' });
    expect(checkRows(withRows([[0, { workNumber: 'ß'.repeat(7) }], [1, { workNumber: 'ß'.repeat(7) }]])).filter(p => p.code === 'work-number-too-long')).toEqual([]);
  });

  it('refuses more publishers on a work than the file can number', () => {
    const pubs: V[] = Array.from({ length: 100 }, (_, i) => ({ rowType: 'PUBLISHER', workNumber: 'W1', partyKey: `K${i}`, controlled: 'N', name: `Pub ${i}`, prOwned: '0.5', mrOwned: '1', srOwned: '1' }));
    const sheet = withRows([[1, { prOwned: '50', mrOwned: '', srOwned: '' }]], pubs);
    expect(errorsOf(withRows([[1, { prOwned: '50.5', mrOwned: '1', srOwned: '1' }]], pubs.slice(0, 99)))).toEqual([]);
    expect(find(sheet, 'too-many-publishers')).toMatchObject({ row: 2 + 2 + 99, severity: 'error' });
  });

  it('warns when a controlled writer owns a share but collects none, since the file then has no collection record', () => {
    expect(find(withRows([[1, { prCollected: '0', mrCollected: '0', srCollected: '0' }]]), 'writer-no-collection')).toMatchObject({ row: 3, severity: 'warning' });
    expect(checkRows(withRows([[1, { prCollected: '0' }]])).filter(p => p.code === 'writer-no-collection')).toEqual([]);
  });

  it('warns when one IPI name number or name appears twice among the writers or publishers of a work', () => {
    const w: V = { rowType: 'WRITER', workNumber: 'W1', controlled: 'N', role: 'A', name: 'Quillfeather', firstName: 'Ana' };
    expect(find(withRows([[1, { prOwned: '50', mrOwned: '50', srOwned: '50' }]], [{ ...w, prOwned: '50', mrOwned: '50', srOwned: '50' }]), 'duplicate-party')).toMatchObject({ row: 4, column: 'Name', severity: 'warning' });
    const message = checkRows(withRows([[1, { prOwned: '50', mrOwned: '50', srOwned: '50' }]], [{ ...w, prOwned: '50', mrOwned: '50', srOwned: '50' }])).find(p => p.code === 'duplicate-party')!.message;
    expect(message).toContain('CA');
    const pub = (key: string, name: string): V => ({ ...PUB, partyKey: key, name, ipi: '99900000452', prOwned: '25', mrOwned: '50', srOwned: '50' });
    const two = pubWork({ pub: { prOwned: '25', mrOwned: '50', srOwned: '50' }, writer: { prOwned: '75', publisher: 'P1' }, extra: [{ ...pub('P2', 'Other Name Publishing'), workNumber: 'W1' }] });
    expect(find(two, 'duplicate-party')).toMatchObject({ column: 'IPI name number', severity: 'warning' });
    expect(checkRows(withRows())).toEqual([]);
  });
});

describe('second review fixes', () => {
  it('publisher-empty: a Publisher cell of only separators names no publisher', () => {
    for (const cell of [';', ',', ' , ', ';;']) {
      const r = pubWork({ writer: { publisher: cell } });
      expect(find(r, 'publisher-empty')).toMatchObject({ row: 4, column: 'Publisher', severity: 'error' });
      // The writers do not own it all, so the writer also needs a link.
      expect(find(r, 'writer-needs-publisher')).toMatchObject({ row: 4, severity: 'error' });
      expect(errorsOf(r).length).toBeGreaterThan(0);
    }
  });

  it('publisher-empty also refuses separators where the writers own everything, and a real name is not affected', () => {
    const full = pubWork({ pub: { prOwned: '', mrOwned: '', srOwned: '' }, writer: { publisher: ';', prOwned: '100', mrOwned: '100', srOwned: '100' } });
    const found = checkRows(full).map(p => p.code);
    expect(found).toContain('publisher-empty');
    expect(found).not.toContain('writer-needs-publisher');
    expect(checkRows(pubWork({ writer: { publisher: 'P1;' } }))).toEqual([]);
    expect(checkRows(pubWork({ writer: { publisher: ' , P1' } }))).toEqual([]);
  });

  it('publisher-no-collection: a controlled publisher that owns a share but collects none', () => {
    const r = pubWork({ pub: { mrCollected: '0', srCollected: '0', prOwned: '50', prCollected: '50' } });
    // The performing share to collect must equal the owned share, so every right is not nil here.
    expect(checkRows(r).some(p => p.code === 'publisher-no-collection')).toBe(false);
    const nil = pubWork({ pub: { prOwned: '0', prCollected: '0', mrOwned: '100', mrCollected: '0', srOwned: '100', srCollected: '0' }, writer: { prOwned: '100', mrOwned: '0', srOwned: '0' } });
    expect(find(nil, 'publisher-no-collection')).toMatchObject({ row: 3, column: 'MR collected %', severity: 'warning' });
    expect(checkRows(nil).filter(p => p.severity === 'error')).toEqual([]);
    // An uncontrolled publisher has no collection to speak of.
    expect(checkRows(pubWork({ pub: { controlled: 'N', prOwned: '0', mrOwned: '100', srOwned: '100' }, writer: { prOwned: '100', mrOwned: '0', srOwned: '0', publisher: '' } })).some(p => p.code === 'publisher-no-collection')).toBe(false);
  });

  it('reads decomposed accents like the composed letter', () => {
    const composed = checkRows(withRows([[0, { title: 'Caf\u00e9' }]]));
    const decomposed = checkRows(withRows([[0, { title: 'Cafe\u0301' }]]));
    expect(decomposed).toEqual(composed);
    expect(decomposed.map(p => p.code)).toEqual(['non-ascii-text']);
    expect(decomposed[0]!.message).toContain('"Caf\u00e9"');
  });

  it('says the capital form cannot be written for a Latin letter whose capital is above U+00FF', () => {
    const p = find(withRows([[0, { title: 'Na\u00ffve' }]]), 'unsupported-character');
    expect(p).toMatchObject({ row: 2, column: 'Title', severity: 'error' });
    expect(p.message).toContain('capital form');
    expect(p.message).toContain('\u0178');
    expect(p.message).not.toContain('Latin letters only');
    // A letter of another alphabet keeps the older wording.
    expect(find(withRows([[0, { title: '\u674e Song' }]]), 'unsupported-character').message).toContain('Latin letters only');
  });
});

describe('every problem code the checks can give has a test above', () => {
  it('finds each code in the source and in the tests', () => {
    const read = (f: string): string => readFileSync(fileURLToPath(new URL(`../../src/build/${f}`, import.meta.url)), 'utf8');
    const source = ['analyse.ts', 'values.ts', 'checkRows.ts'].map(read).join('\n');
    const found = new Set<string>();
    for (const m of source.matchAll(/(?:'(?:error|warning)',\s*|bad\(\s*|code:\s*)'([a-z]+(?:-[a-z0-9]+)+)'/g)) found.add(m[1]!);
    expect(found.size).toBeGreaterThan(50);
    expect([...found].filter(c => !exercised.has(c)).sort()).toEqual([]);
    expect(goodRows().length).toBe(2);
  });
});
