import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyField, findReplace, findReplaceFields, forkDoc, getField, layoutOf, parse, recordText, serialize, setField } from '../../src/index';
import type { CwrVersion, FindReplaceOptions } from '../../src/index';
import { specLayouts } from '../../src/model/specLayout';
import { layoutKeys } from '../../src/spec/index';
import { allOf, enc, onlyWithin, spansOf, synth, withFields } from './support';

const base = synth('2.1', 12, true);
const nwr = allOf(base, 'NWR');
const titleOf = (doc: typeof base, ref: number): string => getField(doc, ref, 'workTitle')!.trimEnd();

const opts = (o: Partial<FindReplaceOptions>): FindReplaceOptions => ({ fields: ['workTitle'], find: 'HARBOUR', replace: 'QUAY', mode: 'substring', caseSensitive: false, ...o });

describe('findReplace: titles and names', () => {
  it('replaces a substring in every matching title and previews it first', () => {
    const preview = findReplace(base, opts({}));
    expect(preview.ok).toBe(true);
    expect(preview.applied).toBe(false);
    expect(preview.doc).toBeUndefined();
    const expected = nwr.filter(r => titleOf(base, r).includes('HARBOUR'));
    expect(expected.length).toBeGreaterThan(0);
    expect(preview.changes.map(c => c.record)).toEqual(expected);
    for (const c of preview.changes) {
      expect(c).toMatchObject({ recordType: 'NWR', fieldId: 'workTitle', fieldName: 'Work Title', start: 19, end: 79, line: base.records[c.record]!.line });
      expect(c.before.trimEnd()).toContain('HARBOUR');
      expect(c.after.trimEnd()).toBe(c.before.trimEnd().replace(/HARBOUR/g, 'QUAY'));
    }
    const applied = findReplace(base, opts({ apply: true }));
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(true);
    expect(applied.changes).toEqual(preview.changes);
    for (const r of nwr) expect(titleOf(applied.doc!, r)).toBe(titleOf(base, r).replace(/HARBOUR/g, 'QUAY'));
  });

  it('whole mode matches the whole field only, ignoring padding, and case unless asked', () => {
    const target = titleOf(base, nwr[2]!);
    const exact = findReplace(base, opts({ mode: 'whole', find: target, replace: 'RENAMED', apply: true }));
    expect(exact.changes.map(c => c.record)).toEqual([nwr[2]]);
    expect(titleOf(exact.doc!, nwr[2]!)).toBe('RENAMED');
    // A part of the title is not the whole field.
    expect(findReplace(base, opts({ mode: 'whole', find: target.slice(0, 8), replace: 'X' })).changes).toEqual([]);
    // Case is ignored by default.
    expect(findReplace(base, opts({ mode: 'whole', find: target.toLowerCase(), replace: 'X' })).changes).toHaveLength(1);
    expect(findReplace(base, opts({ mode: 'whole', find: target.toLowerCase(), replace: 'X', caseSensitive: true })).changes).toEqual([]);
    expect(findReplace(base, opts({ find: 'harbour', caseSensitive: true })).changes).toEqual([]);
    expect(findReplace(base, opts({ find: 'harbour', caseSensitive: false })).changes.length).toBeGreaterThan(0);
  });

  it('takes the find text literally, not as a pattern, and the replacement literally', () => {
    const doc = withFields(base, [[nwr[0]!, 'workTitle', 'A.B (LIVE) $1 [X]']]);
    const r = findReplace(doc, opts({ find: '.', replace: '$&$&' }));
    expect(r.changes.map(c => c.after.trimEnd())).toEqual(['A$&$&B (LIVE) $1 [X]']);
    expect(findReplace(doc, opts({ find: '(LIVE)', replace: '' })).changes.map(c => c.after.trimEnd())).toEqual(['A.B  $1 [X]']);
    expect(findReplace(doc, opts({ find: '[X]', replace: '[Y]' })).changes.map(c => c.after.trimEnd())).toEqual(['A.B (LIVE) $1 [Y]']);
  });

  it('works on names and publisher names, with a record type in front or without', () => {
    const swr = allOf(base, 'SWR');
    const owr = allOf(base, 'OWR');
    expect(owr.length).toBeGreaterThan(0);
    const last = getField(base, swr[0]!, 'writerLastName')!.trim();
    const any = findReplace(base, opts({ fields: ['writerLastName'], find: last, replace: 'RENAMED', mode: 'whole' }));
    // The same surname belongs to every work that rotates to the same writer, on SWR and on OWR records alike.
    expect(any.changes.every(c => c.fieldId === 'writerLastName')).toBe(true);
    expect(any.changes.length).toBeGreaterThan(1);
    const only = findReplace(base, opts({ fields: ['SWR.writerLastName'], find: last, replace: 'RENAMED', mode: 'whole' }));
    expect(only.changes.every(c => c.recordType === 'SWR')).toBe(true);
    const alias = findReplace(base, opts({ fields: ['OWR.writerLastName'], find: last, replace: 'RENAMED', mode: 'whole' }));
    expect(alias.changes.every(c => c.recordType === 'SWR' || c.recordType === 'OWR')).toBe(true);
    const pub = findReplace(base, opts({ fields: ['publisherName'], find: 'SONGS', replace: 'TUNES', apply: true }));
    expect(pub.changes.length).toBeGreaterThan(0);
    for (const c of pub.changes) expect(getField(pub.doc!, c.record, 'publisherName')!.trimEnd()).toContain('TUNES');
  });

  it('can write the replacement in upper case', () => {
    const r = findReplace(base, opts({ find: 'HARBOUR', replace: 'quay', uppercase: true }));
    expect(r.changes[0]!.after.trimEnd()).toContain('QUAY');
    const raw = findReplace(base, opts({ find: 'HARBOUR', replace: 'quay' }));
    expect(raw.changes[0]!.after.trimEnd()).toContain('quay');
  });
});

describe('findReplace: a field named more than once is edited once', () => {
  // The replacement contains the find text, so a second edit of the same field would be visible as a longer title.
  const grow = { find: 'HARBOUR', replace: 'HARBOUR HARBOUR' } as const;
  const single = findReplace(base, opts({ ...grow, apply: true }));

  it('the same field given as a bare id and as a record-qualified id changes once', () => {
    expect(single.changes.length).toBeGreaterThan(0);
    const both = findReplace(base, opts({ ...grow, fields: ['workTitle', 'NWR.workTitle'], apply: true }));
    expect(both.ok).toBe(true);
    expect(both.changes).toEqual(single.changes);
    expect(both.refused).toEqual(single.refused);
    for (const r of nwr) expect(titleOf(both.doc!, r)).toBe(titleOf(single.doc!, r));
    expect(Buffer.from(serialize(both.doc!)).equals(Buffer.from(serialize(single.doc!)))).toBe(true);
  });

  it('the same spec given twice, and an alias of a layout already named, change once', () => {
    for (const fields of [['workTitle', 'workTitle'], ['NWR.workTitle', 'NWR.workTitle'], ['workTitle', 'NWR.workTitle', 'REV.workTitle', 'workTitle']]) {
      const r = findReplace(base, opts({ ...grow, fields, apply: true }));
      expect(r.changes, fields.join()).toEqual(single.changes);
      expect(Buffer.from(serialize(r.doc!)).equals(Buffer.from(serialize(single.doc!))), fields.join()).toBe(true);
    }
  });

  it('a preview lists each field once, and the order of the specs does not matter', () => {
    const a = findReplace(base, opts({ ...grow, fields: ['workTitle', 'NWR.workTitle'] }));
    const b = findReplace(base, opts({ ...grow, fields: ['NWR.workTitle', 'workTitle'] }));
    expect(a.changes).toEqual(single.changes);
    expect(b.changes).toEqual(single.changes);
    const keys = a.changes.map(c => `${c.record}:${c.fieldId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('overlapping specs for names, and with only, also edit once', () => {
    const swr = allOf(base, 'SWR')[0]!;
    const last = getField(base, swr, 'writerLastName')!.trim();
    const one = findReplace(base, opts({ fields: ['writerLastName'], find: last, replace: last + last, mode: 'whole' }));
    const two = findReplace(base, opts({ fields: ['writerLastName', 'SWR.writerLastName', 'OWR.writerLastName'], find: last, replace: last + last, mode: 'whole' }));
    expect(two.changes).toEqual(one.changes);
    const named = findReplace(base, opts({ ...grow, fields: ['workTitle', 'NWR.workTitle'], only: [{ record: nwr[0]!, fieldId: 'workTitle' }], apply: true }));
    const namedOne = findReplace(base, opts({ ...grow, only: [{ record: nwr[0]!, fieldId: 'workTitle' }], apply: true }));
    expect(named.changes).toEqual(namedOne.changes);
    expect(titleOf(named.doc!, nwr[0]!)).toBe(titleOf(namedOne.doc!, nwr[0]!));
  });
});

describe('findReplace: fields it refuses', () => {
  const cases: Array<[string, string]> = [
    ['recordType', 'prefix'],
    ['transactionSequence', 'prefix'],
    ['recordSequence', 'prefix'],
    ['prOwnershipShare', 'share'],
    ['mrOwnershipShare', 'share'],
    ['srCollectionShare', 'share'],
    ['copyrightDate', 'numeric'],
    ['duration', 'numeric'],
    ['groupId', 'numeric'],
    ['languageCode', 'code'],
    ['titleType', 'code'],
    ['publisherType', 'code'],
    ['tisNumericCode', 'code'],
    ['inclusionExclusionIndicator', 'code'],
    ['recordedIndicator', 'code'],
    ['iswc', 'identifier'],
    ['publisherIpiNameNumber', 'identifier'],
    ['writerIpiBaseNumber', 'identifier'],
    ['interestedPartyNumber', 'identifier'],
    ['submitterWorkNumber', 'identifier'],
    ['submitterAgreementNumber', 'identifier'],
    ['taxIdNumber', 'identifier'],
    ['isrc', 'identifier'],
    ['senderName', 'unsupported'],
    ['messageText', 'unsupported'],
    ['filler', 'unsupported'],
  ];

  it.each(cases)('%s is refused as %s with an error and no change', (field, kind) => {
    const r = findReplace(base, opts({ fields: [field], find: '1', replace: '2', apply: true }));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('field-refused');
    expect(r.error?.fields).toEqual([expect.objectContaining({ field, kind })]);
    expect(r.error?.message).toContain(field);
    expect(r.changes).toEqual([]);
    expect(r.doc).toBeUndefined();
    expect(r.applied).toBe(false);
  });

  it('refuses the whole request when one of several fields is not allowed, and changes nothing', () => {
    const r = findReplace(base, opts({ fields: ['workTitle', 'prOwnershipShare', 'iswc'], find: 'HARBOUR', replace: 'QUAY', apply: true }));
    expect(r.ok).toBe(false);
    expect(r.error?.fields?.map(f => f.field)).toEqual(['prOwnershipShare', 'iswc']);
    expect(r.doc).toBeUndefined();
  });

  it('reports a field that does not exist, an empty find, and an empty field list', () => {
    expect(findReplace(base, opts({ fields: ['nope'] })).error?.code).toBe('unknown-field');
    expect(findReplace(base, opts({ fields: ['XYZ.workTitle'] })).error?.code).toBe('unknown-field');
    expect(findReplace(base, opts({ find: '' })).error?.code).toBe('empty-find');
    // Blank text in whole-field mode would match, and fill in, every empty field.
    expect(findReplace(base, opts({ fields: ['contactName'], find: '   ', replace: 'X', mode: 'whole' })).error?.code).toBe('empty-find');
    expect(findReplace(base, opts({ fields: [] })).error?.code).toBe('no-fields');
    // A text field of another record type does not count for a record that does not have it.
    expect(findReplace(base, opts({ fields: ['NWR.publisherName'] })).error?.code).toBe('unknown-field');
  });

  it('allows exactly the fields classifyField calls text, in every record of both versions', () => {
    const versions: CwrVersion[] = ['2.1', '2.2'];
    const doc = { '2.1': synth('2.1', 2), '2.2': synth('2.2', 2) };
    let checked = 0;
    let allowed = 0;
    for (const version of versions) {
      const listed = new Set(findReplaceFields(version).flatMap(f => f.records.map(r => `${r}.${f.id}`)));
      for (const key of layoutKeys(version)) {
        const layout = specLayouts.getLayout(version, key)!;
        for (const field of layout.fields) {
          const cls = classifyField(field);
          const r = findReplace(doc[version], opts({ fields: [`${key}.${field.id}`], find: 'ZZZZ', replace: 'Y' }));
          checked++;
          if (cls === 'text') {
            allowed++;
            expect(r.ok, `${version} ${key}.${field.id}`).toBe(true);
            expect(listed.has(`${key}.${field.id}`)).toBe(true);
          } else {
            expect(r.ok, `${version} ${key}.${field.id}`).toBe(false);
            expect(r.error?.fields?.[0]?.kind, `${version} ${key}.${field.id}`).toBe(cls);
            expect(listed.has(`${key}.${field.id}`)).toBe(false);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(600);
    expect(allowed).toBeGreaterThan(40);
  });

  it('never lists a numeric, share, code, identifier or prefix field as replaceable', () => {
    for (const version of ['2.1', '2.2'] as const) {
      for (const f of findReplaceFields(version)) {
        for (const rec of f.records) {
          const layout = specLayouts.getLayout(version, rec)!;
          const def = layout.fields.find(x => x.id === f.id)!;
          expect(['A']).toContain(def.format);
          expect(def.lookup).toBeUndefined();
          expect(f.id).not.toMatch(/Share$|Number$|Sequence$|^recordType$|^iswc|^isrc/);
        }
      }
    }
  });
});

describe('findReplace: changes it will not write', () => {
  it('refuses a result that does not fit the field, and applies nothing when anything is refused', () => {
    const long = 'Q'.repeat(70);
    const preview = findReplace(base, opts({ replace: long }));
    expect(preview.ok).toBe(true);
    expect(preview.changes).toEqual([]);
    expect(preview.refused.length).toBeGreaterThan(0);
    for (const c of preview.refused) expect(c).toMatchObject({ reason: 'overflow', fieldId: 'workTitle', recordType: 'NWR' });
    const applied = findReplace(base, opts({ replace: long, apply: true }));
    expect(applied.ok).toBe(false);
    expect(applied.error?.code).toBe('changes-refused');
    expect(applied.applied).toBe(false);
    expect(applied.doc).toBeUndefined();
  });

  it('applies none of the changes when only some overflow', () => {
    // 'HARBOUR' appears in several titles. Give one of them a title that is nearly full, so only that one overflows.
    const hit = nwr.find(r => titleOf(base, r).includes('HARBOUR'))!;
    const doc = withFields(base, [[hit, 'workTitle', 'HARBOUR ' + 'X'.repeat(51)]]);
    const preview = findReplace(doc, opts({ replace: 'HARBOUR-AND-MORE-LETTERS' }));
    expect(preview.refused.map(c => c.record)).toEqual([hit]);
    expect(preview.changes.length).toBeGreaterThan(0);
    const applied = findReplace(doc, opts({ replace: 'HARBOUR-AND-MORE-LETTERS', apply: true }));
    expect(applied.ok).toBe(false);
    expect(applied.doc).toBeUndefined();
    expect(applied.changes).toEqual(preview.changes);
  });

  it('refuses to leave a mandatory field empty', () => {
    const target = titleOf(base, nwr[1]!);
    const r = findReplace(base, opts({ mode: 'whole', find: target, replace: '' }));
    expect(r.changes).toEqual([]);
    expect(r.refused).toEqual([expect.objectContaining({ reason: 'would-blank-mandatory', record: nwr[1] })]);
    // An optional field may be emptied.
    const withContact = withFields(base, [[nwr[1]!, 'contactName', 'SOMEONE']]);
    const ok = findReplace(withContact, opts({ fields: ['contactName'], mode: 'whole', find: 'SOMEONE', replace: '' }));
    expect(ok.refused).toEqual([]);
    expect(ok.changes).toHaveLength(1);
  });

  it('refuses a character the file cannot hold', () => {
    const r = findReplace(base, opts({ replace: 'QUAY É' }));
    expect(r.changes).toEqual([]);
    expect(r.refused[0]).toMatchObject({ reason: 'not-encodable' });
    // The same replacement is fine in a UTF-8 file.
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...base.bytes]);
    const utf8 = parse(bytes);
    expect(utf8.encoding).toBe('utf8');
    expect(findReplace(utf8, opts({ replace: 'QUAY É' })).refused).toEqual([]);
  });

  it('refuses a replacement with a line break, and leaves a record that ends inside the field alone', () => {
    expect(findReplace(base, opts({ replace: 'A\nB' })).error?.code).toBe('changes-refused');
    const text = recordText(base, nwr[0]!);
    const cut = parse(enc(base.lines.map((l, i) => (i === base.records[nwr[0]!]!.line ? text.slice(0, 40) : l.text)).join('\r\n') + '\r\n'));
    const r = findReplace(cut, opts({ mode: 'whole', find: getField(cut, nwr[0]!, 'workTitle')!.trim(), replace: 'NEW' }));
    expect(r.changes).toEqual([]);
    expect(r.refused[0]).toMatchObject({ reason: 'record-too-short' });
  });
});

describe('findReplace: what it leaves alone', () => {
  it('does not touch the input, and a doc is returned only when applied', () => {
    const before = serialize(base);
    expect(findReplace(base, opts({})).doc).toBeUndefined();
    const r = findReplace(base, opts({ apply: true }));
    expect(r.doc).not.toBe(base);
    expect(base.edits.size).toBe(0);
    expect(Buffer.from(serialize(base)).equals(Buffer.from(before))).toBe(true);
  });

  it('changes only the characters of the changed fields (byte diff)', () => {
    for (const mode of ['substring', 'whole'] as const) {
      const find = mode === 'whole' ? titleOf(base, nwr[4]!) : 'HARBOUR';
      const r = findReplace(base, opts({ mode, find, replace: 'NEW TITLE', apply: true }));
      expect(r.changes.length).toBeGreaterThan(0);
      const out = serialize(r.doc!);
      expect(out.length).toBe(base.bytes.length);
      expect(onlyWithin(base.bytes, out, spansOf(base, r.changes))).toBe(true);
      expect(layoutOf(parse(out), nwr[0]!)).not.toBeNull();
    }
  });

  it('finds nothing to do and changes no byte when the text is absent', () => {
    const r = findReplace(base, opts({ find: 'NO SUCH TEXT', apply: true }));
    expect(r.ok).toBe(true);
    expect(r.changes).toEqual([]);
    expect(Buffer.from(serialize(r.doc!)).equals(Buffer.from(base.bytes))).toBe(true);
  });
});

describe('findReplace: preview and apply agree (property)', () => {
  const words = ['HARBOUR', 'AMBER', 'SONGS', 'SYNTHETIC', 'QUILLFEATHER', 'a', 'E', ' ', '0', 'MUSIC', 'ER'];
  const fields = [['workTitle'], ['publisherName'], ['writerLastName'], ['writerFirstName'], ['workTitle', 'publisherName', 'writerLastName', 'writerFirstName']];
  const text = fc.oneof(fc.constantFrom(...words), fc.string({ unit: fc.constantFrom(...'ABCDEFGH .$&()[]*+?\\'), minLength: 1, maxLength: 6 }));

  it('the preview lists exactly what apply writes, nothing else changes, and the result is stable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...fields),
        text,
        fc.oneof(fc.constant(''), text),
        fc.constantFrom('whole', 'substring'),
        fc.boolean(),
        fc.boolean(),
        (fieldList, find, replace, mode, caseSensitive, uppercase) => {
          const o = { fields: fieldList, find, replace, mode, caseSensitive, uppercase } as FindReplaceOptions;
          const preview = findReplace(base, o);
          const apply = findReplace(base, { ...o, apply: true });
          if (preview.error) {
            // A request refused as a whole is refused the same way with or without apply, and writes nothing.
            expect(apply.error?.code).toBe(preview.error.code);
            expect(apply.doc).toBeUndefined();
            return;
          }
          expect(preview.changes).toEqual(apply.changes);
          expect(preview.refused).toEqual(apply.refused);
          expect(preview.doc).toBeUndefined();
          if (preview.refused.length > 0) {
            expect(apply.doc).toBeUndefined();
            return;
          }
          expect(apply.doc).toBeDefined();
          const out = serialize(apply.doc!);
          expect(out.length).toBe(base.bytes.length);
          expect(onlyWithin(base.bytes, out, spansOf(base, apply.changes))).toBe(true);
          const back = parse(out);
          for (const c of apply.changes) expect(recordText(back, c.record).slice(c.start, c.end)).toBe(c.after);
          // Fields the preview did not list are exactly as they were.
          const changed = new Set(apply.changes.map(c => `${c.record}.${c.fieldId}`));
          for (const ref of allOf(base, 'NWR')) {
            if (!changed.has(`${ref}.workTitle`)) expect(getField(back, ref, 'workTitle')).toBe(getField(base, ref, 'workTitle'));
          }
        },
      ),
      { numRuns: 300, seed: 20261026 },
    );
  });
});

describe('findReplace: upper case writes the whole field, and counts as a change', () => {
  const lower = withFields(base, [
    [nwr[2]!, 'workTitle', 'Even Lantern 00005'],
    [nwr[3]!, 'workTitle', 'MIXED Case Title'],
    [nwr[4]!, 'workTitle', 'ALL UPPER ALREADY'],
  ]);
  const after = (r: { changes: Array<{ after: string }> }, i = 0): string => r.changes[i]!.after.trimEnd();

  it('writes the whole field in upper case, not only the replacement (what the option has always done)', () => {
    const r = findReplace(lower, opts({ find: 'LANTERN', replace: 'lamp', uppercase: true }));
    expect(r.changes.map(c => c.record)).toEqual([nwr[2]]);
    expect(after(r)).toBe('EVEN LAMP 00005');
    // Without the option the replacement stays as typed and the rest of the field is not touched.
    expect(after(findReplace(lower, opts({ find: 'LANTERN', replace: 'lamp' })))).toBe('Even lamp 00005');
  });

  it('searching a field for its own text, with upper case on, writes the field in upper case (it used to change nothing)', () => {
    for (const mode of ['whole', 'substring'] as const) {
      const preview = findReplace(lower, opts({ mode, find: 'Even Lantern 00005', replace: 'Even Lantern 00005', uppercase: true }));
      expect(preview.ok, mode).toBe(true);
      expect(preview.changes.map(c => c.record), mode).toEqual([nwr[2]]);
      expect(preview.changes[0], mode).toMatchObject({ before: expect.stringContaining('Even Lantern 00005'), recordType: 'NWR', fieldId: 'workTitle' });
      expect(after(preview), mode).toBe('EVEN LANTERN 00005');
      expect(preview.refused, mode).toEqual([]);
      const applied = findReplace(lower, opts({ mode, find: 'Even Lantern 00005', replace: 'Even Lantern 00005', uppercase: true, apply: true }));
      expect(applied.changes, mode).toEqual(preview.changes);
      expect(titleOf(applied.doc!, nwr[2]!), mode).toBe('EVEN LANTERN 00005');
      // Only that field's characters changed.
      expect(onlyWithin(lower.bytes, serialize(applied.doc!), spansOf(lower, applied.changes)), mode).toBe(true);
    }
  });

  it('the same holds when the find text is only a part of the field and the replacement is the same part', () => {
    const r = findReplace(lower, opts({ find: 'Lantern', replace: 'Lantern', uppercase: true, caseSensitive: true }));
    expect(r.changes.map(c => c.record)).toEqual([nwr[2]]);
    expect(after(r)).toBe('EVEN LANTERN 00005');
  });

  it('a field of mixed case is changed and a field already in upper case is left alone', () => {
    const r = findReplace(lower, opts({ mode: 'whole', find: 'MIXED Case Title', replace: 'MIXED Case Title', uppercase: true }));
    expect(r.changes).toHaveLength(1);
    expect(after(r)).toBe('MIXED CASE TITLE');
    const upper = findReplace(lower, opts({ mode: 'whole', find: 'ALL UPPER ALREADY', replace: 'ALL UPPER ALREADY', uppercase: true }));
    expect(upper.ok).toBe(true);
    expect(upper.changes).toEqual([]);
    expect(upper.refused).toEqual([]);
    // A match in a different case that upper-cases to what is there is not a change either.
    const other = findReplace(lower, opts({ mode: 'whole', find: 'all upper already', replace: 'all upper already', uppercase: true }));
    expect(other.changes).toEqual([]);
  });

  it('without upper case, a replacement equal to the field is still no change', () => {
    expect(findReplace(lower, opts({ mode: 'whole', find: 'Even Lantern 00005', replace: 'Even Lantern 00005' })).changes).toEqual([]);
    expect(findReplace(lower, opts({ mode: 'substring', find: 'Lantern', replace: 'Lantern', caseSensitive: true })).changes).toEqual([]);
  });

  it('a result that no longer fits is refused with the upper-case text, and apply writes nothing', () => {
    // 60 characters in a Latin-1 file with one sharp s, which upper case writes as two letters: the field would hold 61.
    const nwrLine = base.records[nwr[0]!]!.line;
    const title = 'ß' + 'X'.repeat(59);
    const text = base.lines.map((l, i) => (i === nwrLine ? l.text.slice(0, 19) + title + l.text.slice(79) : l.text)).join('\r\n') + '\r\n';
    const doc = parse(new Uint8Array(Buffer.from(text, 'latin1')));
    expect(doc.encoding).toBe('latin1');
    const o = opts({ mode: 'whole', find: title, replace: title, uppercase: true });
    const preview = findReplace(doc, o);
    expect(preview.changes).toEqual([]);
    expect(preview.refused).toEqual([expect.objectContaining({ reason: 'overflow', record: nwr[0], after: title.toUpperCase() })]);
    expect(preview.refused[0]!.message).toContain('61');
    const applied = findReplace(doc, { ...o, apply: true });
    expect(applied.error?.code).toBe('changes-refused');
    expect(applied.doc).toBeUndefined();
  });

  it('is a change exactly when upper case makes the field differ (property)', () => {
    const letters = fc.string({ unit: fc.constantFrom(...'abcxyzABCXYZ .-é'), minLength: 1, maxLength: 20 }).filter(s => s.trim() === s);
    fc.assert(
      fc.property(letters, fc.boolean(), (title, caseSensitive) => {
        const bytes = new Uint8Array(Buffer.from(base.lines.map((l, i) => (i === base.records[nwr[0]!]!.line ? l.text.slice(0, 19) + title.padEnd(60) + l.text.slice(79) : l.text)).join('\r\n') + '\r\n', 'latin1'));
        const doc = parse(bytes);
        const r = findReplace(doc, opts({ mode: 'whole', find: title, replace: title, uppercase: true, caseSensitive }));
        expect(r.refused).toEqual([]);
        const changed = r.changes.some(c => c.record === nwr[0]);
        expect(changed).toBe(title !== title.toUpperCase());
        if (changed) expect(after(r)).toBe(title.toUpperCase());
        // And preview and apply agree.
        expect(findReplace(doc, opts({ mode: 'whole', find: title, replace: title, uppercase: true, caseSensitive, apply: true })).changes).toEqual(r.changes);
      }),
      { numRuns: 120, seed: 20261027 },
    );
  });
});

describe('findReplace: upper case that would turn a letter into one of another script', () => {
  const nwrLine = base.records[nwr[0]!]!.line;
  /** A UTF-8 file whose first work has this title. */
  const utf8With = (title: string, other: string[] = []): ReturnType<typeof parse> => {
    const lines = base.lines.map(l => l.text);
    lines[nwrLine] = lines[nwrLine]!.slice(0, 19) + title.padEnd(60) + lines[nwrLine]!.slice(79);
    other.forEach((t, i) => {
      const at = base.records[nwr[i + 1]!]!.line;
      lines[at] = lines[at]!.slice(0, 19) + t.padEnd(60) + lines[at]!.slice(79);
    });
    return parse(new Uint8Array(Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')));
  };
  const upper = (title: string, extra: Partial<FindReplaceOptions> = {}): FindReplaceOptions =>
    opts({ mode: 'whole', find: title, replace: title, uppercase: true, caseSensitive: true, ...extra });

  it('refuses the micro sign, which upper case turns into a Greek capital mu, and shows what it would have written', () => {
    const doc = utf8With('5 µs café');
    expect(doc.encoding).toBe('utf8');
    const preview = findReplace(doc, upper('5 µs café'));
    expect(preview.ok).toBe(true);
    expect(preview.changes).toEqual([]);
    expect(preview.refused).toEqual([expect.objectContaining({ reason: 'uppercase-script', record: nwr[0], fieldId: 'workTitle', recordType: 'NWR', after: '5 ΜS CAFÉ' })]);
    expect(preview.refused[0]!.message).toContain('5 µs café');
    expect(preview.refused[0]!.message).toMatch(/another script/);
    const applied = findReplace(doc, upper('5 µs café', { apply: true }));
    expect(applied.ok).toBe(false);
    expect(applied.error?.code).toBe('changes-refused');
    expect(applied.applied).toBe(false);
    expect(applied.doc).toBeUndefined();
    expect(applied.refused).toEqual(preview.refused);
  });

  it('refuses a combining mark that upper case turns into a Greek letter', () => {
    const doc = utf8With('a\u0345b');
    const r = findReplace(doc, upper('a\u0345b'));
    expect(r.changes).toEqual([]);
    expect(r.refused.map(c => c.reason)).toEqual(['uppercase-script']);
  });

  it.each([
    ['é to É', 'café', 'CAFÉ'],
    ['ÿ to Ÿ, which stays inside Latin', 'cafÿ', 'CAFŸ'],
    ['ß to SS', 'straße', 'STRASSE'],
    ['a ligature to its letters', 'ﬁne', 'FINE'],
    ['ŉ to a modifier apostrophe and N', 'ŉa', 'ʼNA'],
    ['Greek, final sigma included', 'αβγ ς', 'ΑΒΓ Σ'],
    ['Cyrillic', 'привет', 'ПРИВЕТ'],
    ['plain ASCII', 'plain title', 'PLAIN TITLE'],
  ])('does not refuse ordinary upper-casing: %s', (_name, title, expected) => {
    const doc = utf8With(title);
    const r = findReplace(doc, upper(title, { apply: true }));
    expect(r.refused).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.changes.map(c => c.after.trimEnd())).toEqual([expected]);
    expect(titleOf(r.doc!, nwr[0]!)).toBe(expected);
  });

  it('without upper case, the same field is not refused', () => {
    const doc = utf8With('5 µs café');
    const r = findReplace(doc, opts({ mode: 'whole', find: '5 µs café', replace: '5 µs cafe', caseSensitive: true, apply: true }));
    expect(r.refused).toEqual([]);
    expect(titleOf(r.doc!, nwr[0]!)).toBe('5 µs cafe');
  });

  it('lists the other changes and refuses the one field, and apply writes none of them', () => {
    const doc = utf8With('5 µs café', ['plain title']);
    const preview = findReplace(doc, opts({ find: 'a', replace: 'a', mode: 'substring', uppercase: true }));
    expect(preview.refused.map(c => [c.record, c.reason])).toEqual([[nwr[0], 'uppercase-script']]);
    expect(preview.changes.length).toBeGreaterThan(0);
    const applied = findReplace(doc, opts({ find: 'a', replace: 'a', mode: 'substring', uppercase: true, apply: true }));
    expect(applied.error?.code).toBe('changes-refused');
    expect(applied.doc).toBeUndefined();
  });

  it('only the named field is judged, so a quick fix elsewhere in the file still works', () => {
    const doc = utf8With('5 µs café', ['plain title']);
    const o = opts({ find: 'plain title', replace: 'plain title', mode: 'whole', uppercase: true, caseSensitive: true });
    const one = findReplace(doc, { ...o, only: [{ record: nwr[1]!, fieldId: 'workTitle' }], apply: true });
    expect(one.ok).toBe(true);
    expect(titleOf(one.doc!, nwr[1]!)).toBe('PLAIN TITLE');
    const bad = findReplace(doc, { ...o, find: '5 µs café', replace: '5 µs café', only: [{ record: nwr[0]!, fieldId: 'workTitle' }] });
    expect(bad.refused.map(c => c.reason)).toEqual(['uppercase-script']);
  });

  it('a file that cannot hold the capital refuses it as before: not-encodable', () => {
    const text = base.lines.map((l, i) => (i === nwrLine ? l.text.slice(0, 19) + '5 µs'.padEnd(60) + l.text.slice(79) : l.text)).join('\r\n') + '\r\n';
    const latin = parse(new Uint8Array(Buffer.from(text, 'latin1')));
    expect(latin.encoding).toBe('latin1');
    const r = findReplace(latin, upper('5 µs'));
    expect(r.refused.map(c => c.reason)).toEqual(['not-encodable']);
  });
});

describe('findReplace: only', () => {
  // Every title has a run of zeros in its number, so there is a change in every work.
  const o = opts({ find: '00', replace: 'OO' });
  const all = findReplace(base, o);
  const ref = (c: { record: number; fieldId: string }): { record: number; fieldId: string } => ({ record: c.record, fieldId: c.fieldId });

  it('the file has several matching titles to choose between', () => {
    expect(all.changes.length).toBeGreaterThan(2);
  });

  it('one named field: preview and apply list that one change, and only that title changes', () => {
    const pick = all.changes[1]!;
    const preview = findReplace(base, { ...o, only: [ref(pick)] });
    expect(preview.ok).toBe(true);
    expect(preview.changes).toEqual([pick]);
    expect(preview.refused).toEqual([]);
    expect(preview.applied).toBe(false);
    const applied = findReplace(base, { ...o, only: [ref(pick)], apply: true });
    expect(applied.applied).toBe(true);
    expect(applied.changes).toEqual([pick]);
    for (const c of all.changes) {
      const expected = c.record === pick.record ? c.after.trimEnd() : titleOf(base, c.record);
      expect(titleOf(applied.doc!, c.record)).toBe(expected);
    }
    expect(onlyWithin(base.bytes, serialize(applied.doc!), spansOf(base, [pick]))).toBe(true);
    expect(base.edits.size).toBe(0);
  });

  it('applying the changes one at a time through only gives the bytes of applying them all at once', () => {
    let doc = base;
    for (const c of all.changes) {
      const step = findReplace(doc, { ...o, only: [ref(c)], apply: true });
      expect(step.changes).toHaveLength(1);
      doc = step.doc!;
    }
    const once = findReplace(base, { ...o, apply: true });
    expect(Buffer.from(serialize(doc)).equals(Buffer.from(serialize(once.doc!)))).toBe(true);
  });

  it('names a subset: the result is that subset of the full list, in file order, whatever order or repeats the list has', () => {
    const subset = [all.changes[3]!, all.changes[0]!, all.changes[3]!, all.changes[2]!];
    const r = findReplace(base, { ...o, only: subset.map(ref) });
    expect(r.changes).toEqual([all.changes[0], all.changes[2], all.changes[3]]);
  });

  it('is the quick fix: the whole field, upper case on, one field, the same bytes as writing that field by hand', () => {
    const doc = withFields(base, [[nwr[2]!, 'workTitle', 'Even Lantern 00005'], [nwr[3]!, 'workTitle', 'Another Lower Title']]);
    const quick = findReplace(doc, { fields: ['workTitle'], find: 'Even Lantern 00005', replace: 'Even Lantern 00005', mode: 'whole', caseSensitive: true, uppercase: true, only: [{ record: nwr[2]!, fieldId: 'workTitle' }], apply: true });
    expect(quick.applied).toBe(true);
    expect(quick.changes).toHaveLength(1);
    const by = forkDoc(doc);
    setField(by, nwr[2]!, 'workTitle', 'Even Lantern 00005', { uppercase: true });
    expect(Buffer.from(serialize(quick.doc!)).equals(Buffer.from(serialize(by)))).toBe(true);
    expect(titleOf(quick.doc!, nwr[3]!)).toBe('Another Lower Title');
  });

  it('only fields that are searched can be named: other fields of the same record are left alone', () => {
    const swr = allOf(base, 'SWR')[0]!;
    const last = getField(base, swr, 'writerLastName')!.trim();
    const first = getField(base, swr, 'writerFirstName')!.trim();
    const both = { fields: ['writerLastName', 'writerFirstName'], find: last.slice(0, 2), replace: 'ZZ', mode: 'substring' as const };
    const free = findReplace(base, both);
    expect(free.changes.filter(c => c.record === swr).map(c => c.fieldId)).toContain('writerLastName');
    const named = findReplace(base, { ...both, only: [{ record: swr, fieldId: 'writerLastName' }] });
    expect(named.changes.map(c => [c.record, c.fieldId])).toEqual([[swr, 'writerLastName']]);
    expect(first.length).toBeGreaterThan(0);
    // The same record's first name is not looked at, even when it would match.
    const firstOnly = findReplace(base, { ...both, find: first.slice(0, 2), only: [{ record: swr, fieldId: 'writerFirstName' }] });
    expect(firstOnly.changes.every(c => c.record === swr && c.fieldId === 'writerFirstName')).toBe(true);
  });

  it('entries that name nothing this call searches are ignored', () => {
    const good = ref(all.changes[0]!);
    const junk = [
      { record: -1, fieldId: 'workTitle' },
      { record: 999999, fieldId: 'workTitle' },
      { record: 1.5, fieldId: 'workTitle' },
      { record: Number.NaN, fieldId: 'workTitle' },
      { record: good.record, fieldId: 'publisherName' }, // a text field, but not one of `fields`
      { record: good.record, fieldId: 'noSuchField' },
      { record: 0, fieldId: 'workTitle' }, // the file header has no work title
      { record: allOf(base, 'SPU')[0]!, fieldId: 'workTitle' },
      { record: good.record, fieldId: 7 as unknown as string },
    ];
    const r = findReplace(base, { ...o, only: [...junk, good] });
    expect(r.changes).toEqual([all.changes[0]]);
    const none = findReplace(base, { ...o, only: junk });
    expect(none.ok).toBe(true);
    expect(none.changes).toEqual([]);
    expect(none.refused).toEqual([]);
  });

  it('an empty list names nothing: no changes, and an apply returns a copy that is the original', () => {
    const preview = findReplace(base, { ...o, only: [] });
    expect(preview).toMatchObject({ ok: true, changes: [], refused: [], applied: false });
    const applied = findReplace(base, { ...o, only: [], apply: true });
    expect(applied).toMatchObject({ ok: true, changes: [], refused: [], applied: true });
    expect(Buffer.from(serialize(applied.doc!)).equals(Buffer.from(base.bytes))).toBe(true);
    expect(applied.doc).not.toBe(base);
  });

  it('the request is still checked: the same refusals with an empty or a full list', () => {
    const bad: Array<Partial<FindReplaceOptions>> = [{ fields: [] }, { find: '' }, { fields: ['iswc'] }, { fields: ['prOwnershipShare'] }, { fields: ['nope'] }, { replace: 'A\nB' }];
    for (const b of bad) {
      for (const only of [[], [ref(all.changes[0]!)]]) {
        const withOnly = findReplace(base, opts({ ...b, only, apply: true }));
        const without = findReplace(base, opts({ ...b, apply: true }));
        expect(withOnly.ok).toBe(false);
        expect(withOnly.error).toEqual(without.error);
      }
    }
  });

  it('a change that cannot be written blocks an apply only when it is one of the named fields', () => {
    const [first, second] = all.changes;
    const doc = withFields(base, [[first!.record, 'workTitle', '00' + 'X'.repeat(58)]]);
    const wide = opts({ find: '00', replace: '000' }); // one more character each time: only the full title overflows
    const everything = findReplace(doc, wide);
    expect(everything.refused.map(c => c.record)).toEqual([first!.record]);
    const fine = findReplace(doc, { ...wide, only: [ref(second!)], apply: true });
    expect(fine.ok).toBe(true);
    expect(fine.changes.map(c => c.record)).toEqual([second!.record]);
    expect(fine.refused).toEqual([]);
    const blocked = findReplace(doc, { ...wide, only: [ref(first!)], apply: true });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe('changes-refused');
    expect(blocked.refused.map(c => c.record)).toEqual([first!.record]);
  });

  it('any subset of the changes is listed as itself, and preview and apply agree (property)', () => {
    fc.assert(
      fc.property(fc.subarray(all.changes), fc.boolean(), (subset, uppercase) => {
        const full = findReplace(base, { ...o, uppercase });
        const picked = new Set(subset.map(c => c.record));
        const expected = full.changes.filter(c => picked.has(c.record));
        const preview = findReplace(base, { ...o, uppercase, only: subset.map(ref) });
        const applied = findReplace(base, { ...o, uppercase, only: subset.map(ref), apply: true });
        expect(preview.changes).toEqual(expected);
        expect(applied.changes).toEqual(expected);
        expect(applied.applied).toBe(true);
        const out = serialize(applied.doc!);
        expect(onlyWithin(base.bytes, out, spansOf(base, expected))).toBe(true);
        for (const c of expected) expect(recordText(parse(out), c.record).slice(c.start, c.end)).toBe(c.after);
      }),
      { numRuns: 80, seed: 20261027 },
    );
  });
});
