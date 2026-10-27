import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  check,
  cleanIdentifiers,
  getField,
  identifierCheck,
  identifierKindOf,
  normalizeIpiBase,
  normalizeIpiName,
  normalizeIsrc,
  normalizeIswc,
  parse,
  recordText,
  serialize,
  SYNTH_IPIS,
} from '../../src/index';
import type { CwrDoc } from '../../src/index';
import { ipiNameCheckDigits } from '../../src/rules/defs/identifiers';
import { fixture, SAMPLE } from '../helpers';
import { allOf, enc, firstOf, onlyWithin, record, spansOf, synth, withFields } from './support';

describe('normalisers', () => {
  it('IPI name number: digits only, zero-padded on the left to 11, leading zeros never stripped', () => {
    expect(normalizeIpiName('12345678')).toBe('00012345678');
    expect(normalizeIpiName('00012345678')).toBe('00012345678');
    expect(normalizeIpiName('0012345678')).toBe('00012345678');
    expect(normalizeIpiName('12345678   ')).toBe('00012345678');
    expect(normalizeIpiName('  123456789')).toBe('00123456789');
    expect(normalizeIpiName('123-456-789')).toBe('00123456789');
    expect(normalizeIpiName('123.456.789')).toBe('00123456789');
    expect(normalizeIpiName('0')).toBe('00000000000');
    expect(normalizeIpiName('A0012345678')).toBeNull();
    expect(normalizeIpiName('I-000000229-7')).toBeNull();
    expect(normalizeIpiName('')).toBeNull();
    expect(normalizeIpiName('123456789012')).toBeNull();
  });

  it('IPI base number: I-NNNNNNNNN-C', () => {
    expect(normalizeIpiBase('I-000000229-7')).toBe('I-000000229-7');
    expect(normalizeIpiBase('i-000000229-7')).toBe('I-000000229-7');
    expect(normalizeIpiBase('I0000002297')).toBe('I-000000229-7');
    expect(normalizeIpiBase('I000000229-7 ')).toBe('I-000000229-7');
    expect(normalizeIpiBase('I 000000229 7')).toBe('I-000000229-7');
    expect(normalizeIpiBase('000000229-7')).toBe('I-000000229-7');
    expect(normalizeIpiBase('I-229-7')).toBeNull();
    expect(normalizeIpiBase('I-00000022X-7')).toBeNull();
    expect(normalizeIpiBase('I-00000022977')).toBeNull();
  });

  it('ISWC: T and ten digits, dashes and dots removed', () => {
    expect(normalizeIswc('T1234567890')).toBe('T1234567890');
    expect(normalizeIswc('t1234567890')).toBe('T1234567890');
    expect(normalizeIswc('T-123.456.789-0')).toBe('T1234567890');
    expect(normalizeIswc('T-034524680-1')).toBe('T0345246801');
    expect(normalizeIswc('1234567890')).toBeNull();
    expect(normalizeIswc('T123456789')).toBeNull();
    expect(normalizeIswc('T12345678901')).toBeNull();
    expect(normalizeIswc('TX23456789')).toBeNull();
  });

  it('ISRC: dashes removed, upper case, twelve letters and digits', () => {
    expect(normalizeIsrc('GBAAA2400001')).toBe('GBAAA2400001');
    expect(normalizeIsrc('gbaaa2400001')).toBe('GBAAA2400001');
    expect(normalizeIsrc('GB-AAA-24-00001')).toBe('GBAAA2400001');
    expect(normalizeIsrc('gb-aaa24-00001')).toBe('GBAAA2400001');
    expect(normalizeIsrc('GB-AAA-24-0')).toBeNull();
    expect(normalizeIsrc('GBAAA24000012')).toBeNull();
    expect(normalizeIsrc('GB AAA 24 00001')).toBeNull();
  });

  it('upper-casing an identifier never writes a letter of another script: the micro sign is not an identifier character', () => {
    expect(normalizeIsrc('US\u00b5RC1234567')).toBeNull();
    expect(normalizeIswc('T-034.524.68\u00b5-1')).toBeNull();
    expect(normalizeIpiBase('I-00\u00b5000000-1')).toBeNull();
  });

  it('kinds come from the field id', () => {
    expect(identifierKindOf('publisherIpiNameNumber')).toBe('ipiName');
    expect(identifierKindOf('interestedPartyIpiNameNumber')).toBe('ipiName');
    expect(identifierKindOf('writer2IpiNameNumber')).toBe('ipiName');
    expect(identifierKindOf('ipiBaseNumber')).toBe('ipiBase');
    expect(identifierKindOf('performingArtistIpiBaseNumber')).toBe('ipiBase');
    expect(identifierKindOf('iswc')).toBe('iswc');
    expect(identifierKindOf('iswcOfEntireWork')).toBe('iswc');
    expect(identifierKindOf('isrc')).toBe('isrc');
    // Not identifiers this tool cleans.
    for (const id of ['isrcValidity', 'interestedPartyNumber', 'senderId', 'ean', 'workTitle', 'submitterWorkNumber']) expect(identifierKindOf(id)).toBeNull();
  });
});

describe('cleanIdentifiers on a synthetic file', () => {
  const base = synth('2.1', 6, true);
  const nwr = allOf(base, 'NWR');
  const spu = allOf(base, 'SPU');
  const swr = allOf(base, 'SWR');
  const messy = withFields(base, [
    [nwr[0]!, 'iswc', 't1234567890'],
    [nwr[1]!, 'iswc', 'T1234567890'],
    [nwr[2]!, 'iswc', 't-123.456.789-0'],
    [spu[0]!, 'publisherIpiNameNumber', '123471'],
    [swr[0]!, 'writerIpiNameNumber', '0000123471'],
    [swr[1]!, 'writerIpiBaseNumber', 'i0000002297'],
    [swr[2]!, 'writerIpiNameNumber', 'N0012345678'],
  ]);

  it('previews every change with line, record, field, before and after, and returns no document', () => {
    const r = cleanIdentifiers(messy);
    expect(r.applied).toBe(false);
    expect(r.doc).toBeUndefined();
    expect(r.changes.map(c => c.fieldId).sort()).toEqual(['iswc', 'publisherIpiNameNumber', 'writerIpiBaseNumber', 'writerIpiNameNumber'].sort());
    const byField = Object.fromEntries(r.changes.map(c => [c.fieldId + c.record, c]));
    const iswc = byField['iswc' + nwr[0]]!;
    expect(iswc).toMatchObject({ line: messy.records[nwr[0]!]!.line, record: nwr[0], recordType: 'NWR', kind: 'iswc', fieldName: 'ISWC', start: 95, end: 106 });
    expect(iswc.before).toBe('t1234567890');
    expect(iswc.after).toBe('T1234567890');
    const ipi = byField['publisherIpiNameNumber' + spu[0]]!;
    expect(ipi.before.trim()).toBe('123471');
    expect(ipi.after).toBe('00000123471');
    const base13 = byField['writerIpiBaseNumber' + swr[1]]!;
    expect(base13.after).toBe('I-000000229-7');
    const padded = byField['writerIpiNameNumber' + swr[0]]!;
    expect(padded.before).toBe('0000123471 ');
    expect(padded.after).toBe('00000123471');
  });

  it('lists a value with no valid form as skipped and leaves it alone', () => {
    const r = cleanIdentifiers(messy, { apply: true });
    const skipped = r.skipped.find(s => s.fieldId === 'writerIpiNameNumber' && s.record === swr[2]);
    expect(skipped).toMatchObject({ reason: 'no-valid-form', kind: 'ipiName', value: 'N0012345678' });
    expect(getField(r.doc!, swr[2]!, 'writerIpiNameNumber')).toBe('N0012345678');
    // A dashed ISWC is cut at the 11 characters of its field, so what the file holds ('t-123.456.7') has no written form.
    const cut = r.skipped.find(s => s.fieldId === 'iswc' && s.record === nwr[2]);
    expect(cut).toMatchObject({ reason: 'no-valid-form', kind: 'iswc', value: 't-123.456.7' });
    expect(getField(r.doc!, nwr[2]!, 'iswc')).toBe('t-123.456.7');
  });

  it('applies on a copy: the input document is untouched', () => {
    const before = serialize(messy);
    const r = cleanIdentifiers(messy, { apply: true });
    expect(r.applied).toBe(true);
    expect(r.doc).toBeDefined();
    expect(r.doc).not.toBe(messy);
    expect(messy.edits.size).toBe(0);
    expect(Buffer.from(serialize(messy)).equals(Buffer.from(before))).toBe(true);
    expect(getField(r.doc!, spu[0]!, 'publisherIpiNameNumber')).toBe('00000123471');
    expect(getField(r.doc!, swr[1]!, 'writerIpiBaseNumber')).toBe('I-000000229-7');
    expect(getField(r.doc!, swr[0]!, 'writerIpiNameNumber')).toBe('00000123471');
  });

  it('never touches a field that is already valid, or a blank one', () => {
    const clean = synth('2.2', 5, true);
    const r = cleanIdentifiers(clean, { apply: true });
    expect(r.changes).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(Buffer.from(serialize(r.doc!)).equals(Buffer.from(clean.bytes))).toBe(true);
    // An IPI name number of eleven zeros is valid as it stands, and a blank base number is not entered.
    const zeros = withFields(clean, [[allOf(clean, 'SWR')[0]!, 'writerIpiNameNumber', '00000000000']]);
    expect(cleanIdentifiers(zeros).changes).toEqual([]);
  });

  it('does not change check digits', () => {
    // 000001234 has check digits 71. Padding keeps them; a wrong pair is never "fixed".
    const doc = withFields(base, [[spu[0]!, 'publisherIpiNameNumber', '123471 ']]);
    const r = cleanIdentifiers(doc, { apply: true });
    expect(getField(r.doc!, spu[0]!, 'publisherIpiNameNumber')).toBe('00000123471');
    expect(getField(r.doc!, spu[0]!, 'publisherIpiNameNumber')!.slice(9)).toBe('71');
    // 900000199 would become 00900000199, whose check digits (99) are not the ones its first nine digits give (27): left as it is.
    const wrong = withFields(base, [[spu[0]!, 'publisherIpiNameNumber', '900000199 ']]);
    const w = cleanIdentifiers(wrong, { apply: true });
    expect(w.changes).toEqual([]);
    expect(getField(w.doc!, spu[0]!, 'publisherIpiNameNumber')).toBe('900000199  ');
    expect(w.needsHuman).toHaveLength(1);
    expect(w.needsHuman[0]).toMatchObject({ padded: '00900000199', found: '99', expected: '27' });
  });

  it('only rewrites the characters of the edited fields', () => {
    const r = cleanIdentifiers(messy, { apply: true });
    const out = serialize(r.doc!);
    expect(out.length).toBe(messy.bytes.length);
    expect(onlyWithin(messy.bytes, out, spansOf(messy, r.changes))).toBe(true);
    expect(r.changes.length).toBeGreaterThan(3);
    // And the result parses back to the same text.
    const back = parse(out);
    for (const c of r.changes) expect(recordText(back, c.record).slice(c.start, c.end)).toBe(c.after);
  });

  it('cleans only the kinds asked for', () => {
    const r = cleanIdentifiers(messy, { kinds: ['iswc'] });
    expect(r.changes.map(c => c.kind)).toEqual(['iswc']);
    expect(cleanIdentifiers(messy, { kinds: [] }).changes).toEqual([]);
  });

  it('applying twice changes nothing the second time', () => {
    const once = cleanIdentifiers(messy, { apply: true });
    const twice = cleanIdentifiers(once.doc!, { apply: true });
    expect(twice.changes).toEqual([]);
    expect(Buffer.from(serialize(twice.doc!)).equals(Buffer.from(serialize(once.doc!)))).toBe(true);
  });
});

describe('cleanIdentifiers on other records', () => {
  /** A 2.2 file with REC records (ISRC at characters 250 to 261), an EWT record and an IPA record. */
  function build(): CwrDoc {
    const lines = [
      'HDRPB000000199SYNTHETIC',
      'GRHNWR00001' + '02.20' + '0000000000',
      record('NWR', 0, 0, 260, [19, 'A TITLE']),
      record('REC', 0, 1, 540, [19, '20260101'], [249, 'gb-aaa-24-000']),
      record('REC', 0, 2, 540, [249, 'gbaaa2400001']),
      record('REC', 0, 3, 540, [249, 'GBAAA2400001']),
      record('EWT', 0, 4, 364, [19, 'ENTIRE'], [79, 't0345246801'], [227, '123471'], [238, 'i-000000229-7']),
      record('IPA', 0, 5, 153, [21, '199'], [32, 'I000000229-7']),
    ];
    return parse(enc(lines.join('\r\n') + '\r\n'));
  }

  it('reads the ISRC of REC records, the ISWC and IPI numbers of EWT, and the IPI numbers of IPA', () => {
    const r = cleanIdentifiers(build(), { apply: true });
    const byKind = (k: string) => r.changes.filter(c => c.kind === k);
    // The first ISRC is longer than its field, so the field holds 'gb-aaa-24-00', which has no written form; the third is already valid.
    expect(byKind('isrc').map(c => c.after)).toEqual(['GBAAA2400001']);
    expect(r.skipped.map(s => [s.fieldId, s.reason, s.value])).toContainEqual(['isrc', 'no-valid-form', 'gb-aaa-24-00']);
    expect(r.skipped.find(s => s.fieldId === 'isrc')!.message).toBe('"gb-aaa-24-00" cannot be turned into an ISRC in its written form without guessing.');
    expect(byKind('iswc').map(c => [c.fieldId, c.after])).toEqual([['iswcOfEntireWork', 'T0345246801']]);
    expect(byKind('ipiName').map(c => [c.recordType, c.fieldId, c.after]).sort()).toEqual([
      ['EWT', 'writer1IpiNameNumber', '00000123471'],
      ['IPA', 'interestedPartyIpiNameNumber', '00000000199'],
    ]);
    expect(byKind('ipiBase').map(c => [c.recordType, c.after.trim()]).sort()).toEqual([
      ['EWT', 'I-000000229-7'],
      ['IPA', 'I-000000229-7'],
    ]);
  });
});

describe('cleanIdentifiers keeps every fixture byte for byte when nothing needs cleaning', () => {
  it('the public sample: any change is inside a field, and the unchanged parts stay identical', () => {
    const doc = parse(fixture(SAMPLE));
    const r = cleanIdentifiers(doc, { apply: true });
    const out = serialize(r.doc!);
    expect(out.length).toBe(doc.bytes.length);
    expect(onlyWithin(doc.bytes, out, spansOf(doc, r.changes))).toBe(true);
  });
});

describe('cleanIdentifiers properties', () => {
  const base = synth('2.1', 4, true);
  const fieldsToHit: Array<[string, string]> = [
    ['NWR', 'iswc'],
    ['SPU', 'publisherIpiNameNumber'],
    ['SPU', 'publisherIpiBaseNumber'],
    ['SWR', 'writerIpiNameNumber'],
    ['SWR', 'writerIpiBaseNumber'],
  ];
  const sites = fieldsToHit.flatMap(([type, field]) => allOf(base, type).map(ref => [ref, field] as const));
  const chars = '0123456789 -.IiTtAZaz_/';
  const value = fc.string({ unit: fc.constantFrom(...chars), minLength: 0, maxLength: 13 });

  it('is idempotent: a second pass changes nothing', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: sites.length - 1 }), value), { minLength: 1, maxLength: 12 }), edits => {
        const doc = withFields(
          base,
          edits.map(([i, v]) => [sites[i]![0], sites[i]![1], v] as [number, string]),
        );
        const first = cleanIdentifiers(doc, { apply: true });
        const second = cleanIdentifiers(first.doc!, { apply: true });
        expect(second.changes).toEqual([]);
        expect(Buffer.from(serialize(second.doc!)).equals(Buffer.from(serialize(first.doc!)))).toBe(true);
        // Everything that changed is now in its written form, and nothing outside the changed fields moved.
        expect(onlyWithin(doc.bytes, serialize(first.doc!), spansOf(doc, first.changes))).toBe(true);
        for (const c of first.changes) {
          const now = recordText(first.doc!, c.record).slice(c.start, c.end);
          expect(now).toBe(c.after);
        }
      }),
      { numRuns: 200, seed: 20261026 },
    );
  });

  it('preview and apply report the same changes', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: sites.length - 1 }), value), { minLength: 1, maxLength: 8 }), edits => {
        const doc = withFields(
          base,
          edits.map(([i, v]) => [sites[i]![0], sites[i]![1], v] as [number, string]),
        );
        expect(cleanIdentifiers(doc).changes).toEqual(cleanIdentifiers(doc, { apply: true }).changes);
      }),
      { numRuns: 100, seed: 7 },
    );
  });
});

describe('cleanIdentifiers does not write past a short record', () => {
  it('lists a field the record ends inside as record-too-short and writes nothing', () => {
    const doc = synth('2.1', 2);
    const ref = firstOf(doc, 'NWR');
    const text = recordText(doc, ref);
    // Put an ISWC in, then cut the NWR in the middle of it.
    const withIswc = withFields(doc, [[ref, 'iswc', 'T1234567890']]);
    const cut = parse(enc(withIswc.lines.map((l, i) => (i === withIswc.records[ref]!.line ? text.slice(0, 95) + 'T1234' : l.text)).join('\r\n') + '\r\n'));
    const r = cleanIdentifiers(cut, { apply: true });
    expect(r.changes.filter(c => c.record === ref)).toEqual([]);
    // The cut ISWC is not blank, so it is reported rather than padded out.
    expect(r.skipped.filter(s => s.record === ref).map(s => s.reason)).toEqual(['record-too-short']);
    expect(serialize(r.doc!).length).toBe(cut.bytes.length);
  });
});

describe('identifierCheck', () => {
  // 000001234 + 71, 000000001 + 99 and 001234567 + 90 are worked out by hand from the weights 10 to 2 modulo 101.
  const GOOD_NAMES = [...SYNTH_IPIS, '00000123471', '00000000199', '00123456790', '00000000000'];

  it('IPI name number: ok when the last two digits are the ones the first nine give', () => {
    for (const v of GOOD_NAMES) expect(identifierCheck('ipiName', v), v).toEqual({ kind: 'ipiName', ok: true, checkDigitTested: true });
    // Spaces around the value are the field's padding.
    expect(identifierCheck('ipiName', ' 00000123471 ').ok).toBe(true);
  });

  it('IPI name number: a wrong pair says what it found and what the first nine digits give', () => {
    // 12345678 is the shape of a number that lost its zeros; padded, it ends in 78 where 000123456 gives 24.
    expect(identifierCheck('ipiName', '00012345678')).toEqual({ kind: 'ipiName', ok: false, checkDigitTested: true, reason: 'check-digit', found: '78', expected: '24' });
    expect(identifierCheck('ipiName', '00000123472')).toMatchObject({ ok: false, reason: 'check-digit', found: '72', expected: '71' });
    expect(identifierCheck('ipiName', '00900000199')).toMatchObject({ ok: false, found: '99', expected: '27' });
  });

  it('IPI name number: a value that is not eleven digits cannot be tested', () => {
    for (const v of ['12345678', '0001234567A', '000123456789', 'I-000000229-7', '000-123-4567']) {
      expect(identifierCheck('ipiName', v), v).toEqual({ kind: 'ipiName', ok: false, checkDigitTested: false, reason: 'wrong-shape' });
    }
    for (const v of ['', '           ']) expect(identifierCheck('ipiName', v)).toEqual({ kind: 'ipiName', ok: false, checkDigitTested: false, reason: 'blank' });
  });

  it('IPI base number: tested on I-NNNNNNNNN-C; CISAC\'s own example I-000000229-7 passes', () => {
    for (const v of ['I-000000229-7', 'I-000001234-8', 'I-000000001-9', 'I-034524680-0']) expect(identifierCheck('ipiBase', v), v).toEqual({ kind: 'ipiBase', ok: true, checkDigitTested: true });
    expect(identifierCheck('ipiBase', 'I-000000229-8')).toEqual({ kind: 'ipiBase', ok: false, checkDigitTested: true, reason: 'check-digit', found: '8', expected: '7' });
    expect(identifierCheck('ipiBase', 'I-000000001-7')).toMatchObject({ ok: false, found: '7', expected: '9' });
    // Not in the written form: not tested. The value is not normalised.
    for (const v of ['I0000002297', 'i-000000229-7', '000000229-7', 'I-00000229-7']) {
      expect(identifierCheck('ipiBase', v), v).toEqual({ kind: 'ipiBase', ok: false, checkDigitTested: false, reason: 'wrong-shape' });
    }
    expect(identifierCheck('ipiBase', '').reason).toBe('blank');
  });

  it('ISWC: only the written form is tested, because the engine has no ISWC check-digit test', () => {
    expect(identifierCheck('iswc', 'T0345246801')).toEqual({ kind: 'iswc', ok: true, checkDigitTested: false });
    // The last digit is not looked at: T0345246809 is as well formed as T0345246801.
    expect(identifierCheck('iswc', 'T0345246809')).toEqual({ kind: 'iswc', ok: true, checkDigitTested: false });
    for (const v of ['t0345246801', 'T034524680', 'T03452468011', 'T-034.524.680-1', '0345246801']) {
      expect(identifierCheck('iswc', v), v).toEqual({ kind: 'iswc', ok: false, checkDigitTested: false, reason: 'wrong-shape' });
    }
    expect(identifierCheck('iswc', '   ').reason).toBe('blank');
  });

  it('ISRC: twelve upper-case letters and digits', () => {
    expect(identifierCheck('isrc', 'GBAAA2400001')).toEqual({ kind: 'isrc', ok: true, checkDigitTested: false });
    for (const v of ['gbaaa2400001', 'GB-AAA-24-00001', 'GBAAA240000']) expect(identifierCheck('isrc', v).reason, v).toBe('wrong-shape');
  });

  it('answers the same as the checker: the check-digit rules report exactly the values it fails', () => {
    const doc = synth('2.1', 4, true);
    const swr = allOf(doc, 'SWR');
    const values = [...GOOD_NAMES, '00012345678', '00000123472', '00900000199', '99900000150', '12345678901'];
    for (const v of values) {
      const probe = withFields(doc, [[swr[0]!, 'writerIpiNameNumber', v]]);
      const reported = check(probe).problems.some(p => p.ruleId === 'ID-IPI-CHK' && p.record === swr[0]);
      expect(reported, v).toBe(v !== '00000000000' && !identifierCheck('ipiName', v).ok);
    }
    const bases = ['I-000000229-7', 'I-000000229-8', 'I-000001234-8', 'I-000001234-9'];
    for (const v of bases) {
      const probe = withFields(doc, [[swr[0]!, 'writerIpiBaseNumber', v]]);
      const reported = check(probe).problems.some(p => p.ruleId === 'ID-IPIB-CHK' && p.record === swr[0]);
      expect(reported, v).toBe(!identifierCheck('ipiBase', v).ok);
    }
  });

  it('is pure: the same input gives an equal answer, and a returned object is not shared', () => {
    const a = identifierCheck('ipiName', '00012345678');
    const b = identifierCheck('ipiName', '00012345678');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('for every nine-digit body, body + its check digits passes and any other pair fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999999999 }), fc.integer({ min: 1, max: 99 }), (n, delta) => {
        const body = String(n).padStart(9, '0');
        const good = body + ipiNameCheckDigits(body);
        expect(identifierCheck('ipiName', good).ok).toBe(true);
        const other = body + String((Number(good.slice(9)) + delta) % 100).padStart(2, '0');
        expect(identifierCheck('ipiName', other).ok).toBe(false);
      }),
      { numRuns: 300, seed: 20261027 },
    );
  });
});

describe('cleanIdentifiers pads an IPI name number only if the padded number passes its check digits', () => {
  const base = synth('2.1', 6, true);
  const spu = allOf(base, 'SPU');
  const swr = allOf(base, 'SWR');
  const mixed = withFields(base, [
    [spu[0]!, 'publisherIpiNameNumber', '123471'], // 00000123471 passes
    [swr[0]!, 'writerIpiNameNumber', '12345678'], // 00012345678 ends in 78, 000123456 gives 24
    [swr[1]!, 'writerIpiNameNumber', '123-471'], // separators out, then 00000123471 passes
    [swr[2]!, 'writerIpiNameNumber', '0000123472'], // 00000123472 ends in 72, 000001234 gives 71
    [spu[1]!, 'publisherIpiNameNumber', '00000123472'], // already eleven digits: not this tool's business
    [swr[3]!, 'writerIpiNameNumber', 'N0012345678'], // letters: skipped, as before
  ]);

  it('pads the numbers that pass, lists the ones that do not, and touches neither list\'s fields otherwise', () => {
    const r = cleanIdentifiers(mixed);
    expect(r.changes.map(c => [c.record, c.fieldId, c.after])).toEqual([
      [spu[0], 'publisherIpiNameNumber', '00000123471'],
      [swr[1], 'writerIpiNameNumber', '00000123471'],
    ]);
    expect(r.needsHuman.map(h => [h.record, h.fieldId, h.value, h.padded, h.found, h.expected])).toEqual([
      [swr[0], 'writerIpiNameNumber', '12345678', '00012345678', '78', '24'],
      [swr[2], 'writerIpiNameNumber', '0000123472', '00000123472', '72', '71'],
    ]);
    expect(r.skipped.map(s => [s.record, s.reason])).toEqual([[swr[3], 'no-valid-form']]);
    // An 11-digit number with wrong check digits is in none of the three lists.
    for (const list of [r.changes, r.skipped, r.needsHuman]) expect(list.some(x => x.record === spu[1])).toBe(false);
  });

  it('describes a number that needs a human the way a change is described, plus the padded number', () => {
    const h = cleanIdentifiers(mixed).needsHuman[0]!;
    expect(h).toMatchObject({
      line: mixed.records[swr[0]!]!.line,
      record: swr[0],
      recordType: 'SWR',
      fieldId: 'writerIpiNameNumber',
      fieldName: 'Writer IPI Name #',
      kind: 'ipiName',
      value: '12345678',
      padded: '00012345678',
    });
    expect(h.end - h.start).toBe(11);
    expect(recordText(mixed, h.record).slice(h.start, h.end)).toBe('12345678   ');
    expect(h.message).toBe('"12345678" would become 00012345678, which ends in check digits 78 where its first nine digits give 24, so it is left as it is.');
  });

  it('leaves those fields exactly as they were when it applies, and the preview lists the same things', () => {
    const preview = cleanIdentifiers(mixed);
    const r = cleanIdentifiers(mixed, { apply: true });
    expect(r.applied).toBe(true);
    expect({ changes: r.changes, skipped: r.skipped, needsHuman: r.needsHuman }).toEqual({ changes: preview.changes, skipped: preview.skipped, needsHuman: preview.needsHuman });
    expect(getField(r.doc!, swr[0]!, 'writerIpiNameNumber')).toBe('12345678   ');
    expect(getField(r.doc!, swr[2]!, 'writerIpiNameNumber')).toBe('0000123472 ');
    expect(getField(r.doc!, swr[1]!, 'writerIpiNameNumber')).toBe('00000123471');
    // Byte for byte: only the two padded fields differ from the input.
    const out = serialize(r.doc!);
    expect(out.length).toBe(mixed.bytes.length);
    expect(onlyWithin(mixed.bytes, out, spansOf(mixed, r.changes))).toBe(true);
    // Whole records that need nothing are the same bytes.
    for (const ref of [swr[0]!, swr[2]!, swr[3]!, spu[1]!]) {
      const line = mixed.lines[mixed.records[ref]!.line]!;
      expect(Buffer.from(out.slice(line.byteStart, line.byteEnd)).equals(Buffer.from(mixed.bytes.slice(line.byteStart, line.byteEnd)))).toBe(true);
    }
  });

  it('is stable: a second pass changes nothing and reports the same numbers', () => {
    const once = cleanIdentifiers(mixed, { apply: true });
    const twice = cleanIdentifiers(once.doc!, { apply: true });
    expect(twice.changes).toEqual([]);
    expect(twice.needsHuman).toEqual(once.needsHuman);
    expect(Buffer.from(serialize(twice.doc!)).equals(Buffer.from(serialize(once.doc!)))).toBe(true);
  });

  it('respects `kinds`: with IPI name numbers switched off, nothing is padded and nothing needs a human', () => {
    const r = cleanIdentifiers(mixed, { kinds: ['iswc', 'ipiBase'] });
    expect(r.changes).toEqual([]);
    expect(r.needsHuman).toEqual([]);
  });

  it.each(['0', '00', '.0.0.0.0.0.', ' 0 ', '0-0-0', '0000000000'])('a value of only zeros (%j) is not padded to eleven zeros: it is left alone and listed as no number entered', value => {
    const doc = withFields(base, [[swr[0]!, 'writerIpiNameNumber', value]]);
    const before = recordText(doc, swr[0]!).slice(0, 80);
    for (const options of [{}, { apply: true }]) {
      const r = cleanIdentifiers(doc, options);
      expect(r.changes).toEqual([]);
      expect(r.skipped).toEqual([]);
      expect(r.needsHuman).toHaveLength(1);
      expect(r.needsHuman[0]).toMatchObject({
        record: swr[0],
        fieldId: 'writerIpiNameNumber',
        kind: 'ipiName',
        value: value.trim(),
        padded: '00000000000',
        found: '00',
        expected: '00',
        message: `"${value.trim()}" is all zeros, so no IPI number was entered, and it is left as it is.`,
      });
      if (r.doc) {
        expect(recordText(r.doc, swr[0]!).slice(0, 80)).toBe(before);
        expect(Buffer.from(serialize(r.doc)).equals(Buffer.from(doc.bytes))).toBe(true);
      }
    }
    // The same through `only` (a quick fix).
    const one = cleanIdentifiers(doc, { only: [{ record: swr[0]!, fieldId: 'writerIpiNameNumber' }] });
    expect(one.changes).toEqual([]);
    expect(one.needsHuman).toHaveLength(1);
  });

  it('eleven zeros already in the field are untouched and in no list; a real number with zeros inside still pads', () => {
    const body = '000100203';
    const full = body + ipiNameCheckDigits(body); // zeros at both ends and in the middle, check digits right
    const short = full.replace(/^0+/, '');
    expect(short.length).toBeLessThan(11);
    const doc = withFields(base, [
      [swr[0]!, 'writerIpiNameNumber', '00000000000'],
      [swr[1]!, 'writerIpiNameNumber', short],
      [swr[2]!, 'writerIpiNameNumber', '0' + short], // one zero already there
    ]);
    const r = cleanIdentifiers(doc);
    const touched = (ref: number): boolean => [...r.changes, ...r.skipped, ...r.needsHuman].some(x => x.record === ref);
    expect(touched(swr[0]!)).toBe(false);
    expect(r.changes.map(c => [c.record, c.after])).toEqual([
      [swr[1], full],
      [swr[2], full],
    ]);
    expect(r.needsHuman).toEqual([]);
  });

  it('a value that is only zeros is not listed under kinds that leave out IPI name numbers', () => {
    const doc = withFields(base, [[swr[0]!, 'writerIpiNameNumber', '0']]);
    expect(cleanIdentifiers(doc, { kinds: ['iswc'] }).needsHuman).toEqual([]);
  });

  it('does not gate IPI base numbers or ISWCs on a check digit: they only change form', () => {
    const doc = withFields(base, [
      [swr[0]!, 'writerIpiBaseNumber', 'i0000002298'], // I-000000229-8: the check digit should be 7
      [allOf(base, 'NWR')[0]!, 'iswc', 't0000000017'],
    ]);
    const r = cleanIdentifiers(doc);
    expect(r.changes.map(c => [c.kind, c.after.trim()])).toEqual([
      ['iswc', 'T0000000017'],
      ['ipiBase', 'I-000000229-8'],
    ]);
    expect(identifierCheck('ipiBase', 'I-000000229-8').ok).toBe(false);
    expect(r.needsHuman).toEqual([]);
  });

  it('random short numbers: each is padded exactly when its padded form passes, and is otherwise listed and left alone', () => {
    const sites = [...swr.slice(0, 6).map(ref => [ref, 'writerIpiNameNumber'] as const), ...spu.slice(0, 4).map(ref => [ref, 'publisherIpiNameNumber'] as const)];
    const digits = fc.string({ unit: fc.constantFrom(...'0123456789'), minLength: 1, maxLength: 10 });
    fc.assert(
      fc.property(fc.array(digits, { minLength: sites.length, maxLength: sites.length }), values => {
        const doc = withFields(
          base,
          sites.map(([ref, id], i) => [ref, id, values[i]!] as [number, string, string]),
        );
        const r = cleanIdentifiers(doc, { apply: true });
        sites.forEach(([ref, id], i) => {
          const padded = values[i]!.padStart(11, '0');
          // Eleven zeros pass the test, but a value of only zeros is never padded: no number was entered.
          const passes = ipiNameCheckDigits(padded.slice(0, 9)) === padded.slice(9) && !/^0+$/.test(padded);
          const change = r.changes.find(c => c.record === ref && c.fieldId === id);
          const human = r.needsHuman.find(h => h.record === ref && h.fieldId === id);
          const written = getField(r.doc!, ref, id)!;
          expect(!!change, `${values[i]} padded ${padded}`).toBe(passes);
          expect(!!human).toBe(!passes);
          if (passes) expect(written).toBe(padded);
          else expect(written.trim()).toBe(values[i]!);
        });
        // Preview and apply agree, and a second pass does not move anything.
        const preview = cleanIdentifiers(doc);
        expect({ c: preview.changes, s: preview.skipped, h: preview.needsHuman }).toEqual({ c: r.changes, s: r.skipped, h: r.needsHuman });
        const again = cleanIdentifiers(r.doc!, { apply: true });
        expect(again.changes).toEqual([]);
        expect(again.needsHuman).toEqual(r.needsHuman);
      }),
      { numRuns: 150, seed: 20261027 },
    );
  });
});

describe('cleanIdentifiers with `only` (quick fixes)', () => {
  const base = synth('2.1', 6, true);
  const nwr = allOf(base, 'NWR');
  const spu = allOf(base, 'SPU');
  const swr = allOf(base, 'SWR');
  const messy = withFields(base, [
    [nwr[0]!, 'iswc', 't1234567890'],
    [nwr[1]!, 'iswc', 't0345246801'],
    [spu[0]!, 'publisherIpiNameNumber', '123471'],
    [swr[0]!, 'writerIpiNameNumber', '199'],
    [swr[0]!, 'writerIpiBaseNumber', 'i0000002297'], // two fixable fields in one record
    [swr[1]!, 'writerIpiNameNumber', '12345678'], // needs a human
    [swr[2]!, 'writerIpiNameNumber', 'N0012345678'], // skipped
  ]);
  const all = cleanIdentifiers(messy);

  it('the full run has something of every kind to work with', () => {
    expect(all.changes).toHaveLength(5);
    expect(all.needsHuman).toHaveLength(1);
    expect(all.skipped).toHaveLength(1);
  });

  it('changes only the named field and reports only that field', () => {
    const r = cleanIdentifiers(messy, { only: [{ record: nwr[0]!, fieldId: 'iswc' }], apply: true });
    expect(r.changes.map(c => [c.record, c.fieldId, c.after])).toEqual([[nwr[0], 'iswc', 'T1234567890']]);
    expect(r.skipped).toEqual([]);
    expect(r.needsHuman).toEqual([]);
    const out = serialize(r.doc!);
    expect(out.length).toBe(messy.bytes.length);
    expect(onlyWithin(messy.bytes, out, spansOf(messy, r.changes))).toBe(true);
    // Every other fixable field is still as it was.
    expect(getField(r.doc!, nwr[1]!, 'iswc')).toBe('t0345246801');
    expect(getField(r.doc!, spu[0]!, 'publisherIpiNameNumber')).toBe('123471     ');
    expect(getField(r.doc!, swr[0]!, 'writerIpiNameNumber')).toBe('199        ');
  });

  it('of two fixable fields in one record, changes only the one named', () => {
    const r = cleanIdentifiers(messy, { only: [{ record: swr[0]!, fieldId: 'writerIpiNameNumber' }], apply: true });
    expect(r.changes.map(c => c.fieldId)).toEqual(['writerIpiNameNumber']);
    expect(getField(r.doc!, swr[0]!, 'writerIpiNameNumber')).toBe('00000000199');
    expect(getField(r.doc!, swr[0]!, 'writerIpiBaseNumber')).toBe(getField(messy, swr[0]!, 'writerIpiBaseNumber'));
  });

  it('applies and previews through one call: the same lists, and the same changes the full run has for that field', () => {
    const only = [
      { record: spu[0]!, fieldId: 'publisherIpiNameNumber' },
      { record: swr[1]!, fieldId: 'writerIpiNameNumber' },
      { record: swr[2]!, fieldId: 'writerIpiNameNumber' },
    ];
    const preview = cleanIdentifiers(messy, { only });
    const applied = cleanIdentifiers(messy, { only, apply: true });
    expect(applied.applied).toBe(true);
    expect(preview.applied).toBe(false);
    expect(preview.doc).toBeUndefined();
    expect({ c: applied.changes, s: applied.skipped, h: applied.needsHuman }).toEqual({ c: preview.changes, s: preview.skipped, h: preview.needsHuman });
    expect(preview.changes).toEqual(all.changes.filter(c => c.record === spu[0]));
    expect(preview.needsHuman).toEqual(all.needsHuman);
    expect(preview.skipped).toEqual(all.skipped);
  });

  it('one quick fix after another gives the same bytes as the full run, in any order', () => {
    const bulk = serialize(cleanIdentifiers(messy, { apply: true }).doc!);
    for (const order of [all.changes, [...all.changes].reverse()]) {
      let doc = messy;
      for (const c of order) {
        const step = cleanIdentifiers(doc, { only: [{ record: c.record, fieldId: c.fieldId }], apply: true });
        expect(step.changes).toEqual([c]);
        doc = step.doc!;
      }
      expect(Buffer.from(serialize(doc)).equals(Buffer.from(bulk))).toBe(true);
    }
  });

  it('keeps the list in file order whatever order and repeats the caller gives', () => {
    const only = [
      { record: swr[0]!, fieldId: 'writerIpiNameNumber' },
      { record: nwr[0]!, fieldId: 'iswc' },
      { record: swr[0]!, fieldId: 'writerIpiNameNumber' },
      { record: spu[0]!, fieldId: 'publisherIpiNameNumber' },
    ];
    const r = cleanIdentifiers(messy, { only });
    expect(r.changes.map(c => c.line)).toEqual([...r.changes.map(c => c.line)].sort((a, b) => a - b));
    expect(r.changes).toHaveLength(3);
  });

  it('names nothing when the list is empty, and ignores entries that name no identifier field', () => {
    for (const only of [
      [],
      [{ record: nwr[0]!, fieldId: 'workTitle' }],
      [{ record: nwr[0]!, fieldId: 'nothingLikeIt' }],
      [{ record: nwr[0]!, fieldId: 'writerIpiNameNumber' }], // an NWR has no such field
      [{ record: 99999999, fieldId: 'iswc' }],
      [{ record: -1, fieldId: 'iswc' }],
      [{ record: 1.5, fieldId: 'iswc' }],
      [{ record: Number.NaN, fieldId: 'iswc' }],
    ]) {
      const r = cleanIdentifiers(messy, { only, apply: true });
      expect(r.changes).toEqual([]);
      expect(r.skipped).toEqual([]);
      expect(r.needsHuman).toEqual([]);
      expect(Buffer.from(serialize(r.doc!)).equals(Buffer.from(messy.bytes))).toBe(true);
    }
  });

  it('combines with `kinds`: a field must match both', () => {
    const only = [
      { record: nwr[0]!, fieldId: 'iswc' },
      { record: spu[0]!, fieldId: 'publisherIpiNameNumber' },
    ];
    expect(cleanIdentifiers(messy, { only, kinds: ['iswc'] }).changes.map(c => c.fieldId)).toEqual(['iswc']);
    expect(cleanIdentifiers(messy, { only, kinds: ['isrc'] }).changes).toEqual([]);
  });

  it('a field that needs nothing, or a stale entry after the field was fixed, gives an empty answer', () => {
    const r = cleanIdentifiers(messy, { only: [{ record: nwr[0]!, fieldId: 'iswc' }], apply: true });
    const again = cleanIdentifiers(r.doc!, { only: [{ record: nwr[0]!, fieldId: 'iswc' }] });
    expect(again.changes).toEqual([]);
    expect(again.skipped).toEqual([]);
  });

  it('does not touch the input document', () => {
    const before = Buffer.from(serialize(messy));
    cleanIdentifiers(messy, { only: [{ record: nwr[0]!, fieldId: 'iswc' }], apply: true });
    expect(messy.edits.size).toBe(0);
    expect(Buffer.from(serialize(messy)).equals(before)).toBe(true);
  });
});

describe('cleanIdentifiers returns preview and apply lists in the same file order', () => {
  it('two skipped fields on one line come out in field order whether or not the document is edited', () => {
    const base = synth('2.1', 3, true);
    const swr = allOf(base, 'SWR');
    // writerIpiNameNumber comes before writerIpiBaseNumber on the line; their ids sort the other way round.
    const doc = withFields(base, [
      [swr[0]!, 'writerIpiNameNumber', 'N0012345678'],
      [swr[0]!, 'writerIpiBaseNumber', 'I-00000022X-7'],
    ]);
    const preview = cleanIdentifiers(doc);
    const applied = cleanIdentifiers(doc, { apply: true });
    expect(preview.skipped.map(s => s.fieldId)).toEqual(['writerIpiNameNumber', 'writerIpiBaseNumber']);
    expect(applied.skipped).toEqual(preview.skipped);
    expect(preview.skipped[0]!.start).toBeLessThan(preview.skipped[1]!.start);
  });
});

describe('skip messages use the right article', () => {
  it('"an IPI name number", "an IPI base number", "an ISWC"', () => {
    const base = synth('2.1', 3, true);
    const swr = allOf(base, 'SWR');
    const doc = withFields(base, [
      [swr[0]!, 'writerIpiNameNumber', 'N0012345678'],
      [swr[0]!, 'writerIpiBaseNumber', 'I-00000022X-7'],
      [allOf(base, 'NWR')[0]!, 'iswc', 'TX234567890'],
    ]);
    const messages = cleanIdentifiers(doc).skipped.map(s => s.message);
    expect(messages).toEqual([
      '"TX234567890" cannot be turned into an ISWC in its written form without guessing.',
      '"N0012345678" cannot be turned into an IPI name number in its written form without guessing.',
      '"I-00000022X-7" cannot be turned into an IPI base number in its written form without guessing.',
    ]);
    for (const m of messages) expect(m).not.toMatch(/\ba (IPI|ISWC|ISRC)\b/);
  });
});
