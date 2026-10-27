import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, check, EditError, parse, setField } from '../../src/index';
import { withArticle } from '../../src/model/article';
import { synth } from '../tools/support';

/**
 * Our own sentences say "an NWR record" and "an IPI name number": codes are read letter by letter, so a code that starts with
 * the name of A, E, F, H, I, L, M, N, O, S or X takes "an". The specification's own words are not checked here (they are quotes).
 */

describe('withArticle', () => {
  it('"an" before a code whose first letter is said with a vowel sound, "a" before the rest', () => {
    for (const c of ['NWR', 'SWR', 'SPU', 'OPU', 'ISW', 'EXC', 'EWT', 'ACK', 'HDR', 'IPA', 'ALT', 'XRF', 'MSG', 'FSS', 'IPI name number', 'ISWC', 'ISRC']) {
      expect(withArticle(c), c).toBe(`an ${c}`);
    }
    for (const c of ['GRH', 'GRT', 'TRL', 'PWR', 'COM', 'TER', 'VER', 'UNC', 'CSV', 'BOM', 'DIX', 'QRS', 'YZA', 'KLM', 'WXY', 'JKL', 'REV', 'REC']) {
      expect(withArticle(c), c).toBe(`a ${c}`);
    }
  });
});

describe('the checker\'s own messages', () => {
  it('no rule title or message template has "a" before a code that wants "an", or "a" before a placeholder', () => {
    // SER, NUL and MOD are said as words ("a SER work", "a NUL character", "a MOD version"), like REV and REC; the helper above leaves R out for the same reason.
    const wrongArticle = /\b[Aa] (?!SER\b|NUL\b|MOD\b)[AEFHILMNOSX][A-Z]{1,4}\b/;
    const placeholder = /\b[Aa]n? (\{[a-zA-Z]+\}|\$\{)/;
    const bad: string[] = [];
    for (const r of BUILTIN_RULES) {
      for (const text of [r.title, r.message]) {
        if (wrongArticle.test(text) || placeholder.test(text)) bad.push(`${r.id}: ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('FILE-4 and NWR-T-008 name a record type without an article', () => {
    const byId = new Map(BUILTIN_RULES.map(r => [r.id, r.message]));
    expect(byId.get('FILE-4')).toBe('This GRH follows a record of type {found}; every GRH after the first must follow a GRT.');
    expect(byId.get('NWR-T-008')).toBe('{type} is not in the Transaction Format table of {header} transactions.');
  });

  it('setField says whose encoding cannot hold the character', () => {
    const doc = synth('2.1', 2);
    expect(doc.encoding).toBe('ascii');
    const ref = doc.records.findIndex(r => r.type === 'NWR');
    let error: unknown;
    try {
      setField(doc, ref, 'workTitle', 'CAFÉ');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EditError);
    expect((error as EditError).code).toBe('not-encodable');
    expect((error as EditError).message).toBe(`"CAFÉ" cannot be written in this file's ascii encoding.`);
  });

  it('FILE-4 renders without an article before the record type', () => {
    // Put an NWR record where the GRT should be, ahead of a second group: the second GRH then follows an NWR.
    const lines = new TextDecoder().decode(synth('2.1', 2).bytes).split('\r\n');
    const grt = lines.findIndex(l => l.startsWith('GRT'));
    const grh = lines.findIndex(l => l.startsWith('GRH'));
    const second = [lines[grh]!.slice(0, 8) + '00002' + lines[grh]!.slice(13), lines[grt]!.slice(0, 3) + '00002' + lines[grt]!.slice(8)];
    const text = [...lines.slice(0, grt), ...second, ...lines.slice(grt)].join('\r\n');
    const p = check(parse(Uint8Array.from(text, c => c.charCodeAt(0)))).problems.find(x => x.ruleId === 'FILE-4');
    expect(p).toBeDefined();
    expect(p!.message).toMatch(/^This GRH follows a record of type [A-Z]{3};/);
  });
});
