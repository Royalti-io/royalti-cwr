import { describe, expect, it } from 'vitest';
import { fieldSpan, getField, layoutOf, parse, specLayouts } from '../../src/index';
import type { CwrDoc, CwrVersion } from '../../src/index';
import { allFields, fieldsOf, layoutFor, layoutKeys, layoutLength } from '../../src/spec/index';
import { fixture, SAMPLE } from '../helpers';

const VERSIONS: CwrVersion[] = ['2.1', '2.2'];

describe('specLayouts over the generated spec', () => {
  for (const version of VERSIONS) {
    it(`${version}: every layout tiles 0..fullLength with no gap, overlap or aggregate row`, () => {
      for (const key of layoutKeys(version)) {
        const layout = specLayouts.getLayout(version, key)!;
        expect(layout, key).not.toBeNull();
        expect(layout.name).toBe(key);
        expect(layout.fullLength).toBe(layoutLength(version, key));
        let at = 0;
        for (const f of layout.fields) {
          expect(f.start, `${key}.${f.id}`).toBe(at);
          expect(f.end).toBeGreaterThan(f.start);
          at = f.end;
        }
        expect(at, key).toBe(layout.fullLength);
        // Same rows as the spec, minus aggregates.
        const rows = fieldsOf(version, key).filter(f => f.status !== 'aggregate');
        expect(layout.fields.map(f => f.id)).toEqual(rows.map(f => f.id));
        expect(layout.fields.map(f => [f.start + 1, f.end - f.start, f.format])).toEqual(rows.map(f => [f.start, f.size, f.format]));
      }
    });

    it(`${version}: aliases share their layout object; unknown types have none`, () => {
      const aliases = ['REV', 'ISW', 'EXC', 'OPU', 'OWR', 'NCT', 'NVT', ...(version === '2.2' ? ['OPT', 'OWT'] : [])];
      for (const alias of aliases) {
        const key = layoutFor(version, alias)!;
        expect(key, alias).not.toBeNull();
        expect(key).not.toBe(alias);
        expect(specLayouts.getLayout(version, alias)).toBe(specLayouts.getLayout(version, key));
      }
      for (const bad of ['ALX', '   ', '', 'NW', 'constructor', '__proto__', 'hasOwnProperty']) {
        expect(specLayouts.getLayout(version, bad), bad).toBeNull();
        expect(specLayouts.isRecordType(version, bad), bad).toBe(false);
      }
    });
  }

  it('record types: 2.1 has 39, 2.2 has 42 (OPT, OWT and XRF are new); XRF and OPT are unknown in 2.1', () => {
    const count = (v: CwrVersion): number => {
      const types = new Set([...layoutKeys(v), 'REV', 'ISW', 'EXC', 'OPU', 'OWR', 'OPT', 'OWT', 'NCT', 'NVT', 'XRF']);
      return [...types].filter(t => specLayouts.isRecordType(v, t)).length;
    };
    expect(count('2.1')).toBe(39);
    expect(count('2.2')).toBe(42);
    expect(specLayouts.isRecordType('2.1', 'XRF')).toBe(false);
    expect(specLayouts.isRecordType('2.1', 'OPT')).toBe(false);
    expect(specLayouts.isRecordType('2.2', 'XRF')).toBe(true);
  });

  it('alsoValid is GRH 26 and GRT 24 only, in both versions', () => {
    for (const v of VERSIONS) {
      for (const key of layoutKeys(v)) {
        const expected = key === 'GRH' ? [26] : key === 'GRT' ? [24] : undefined;
        expect(specLayouts.getLayout(v, key)!.alsoValid, `${v} ${key}`).toEqual(expected);
      }
    }
  });
});

describe('the first record of every type, read through the generated spec', () => {
  const sources: Array<{ name: string; version: CwrVersion; doc: CwrDoc }> = [
    { name: SAMPLE, version: '2.1', doc: parse(fixture(SAMPLE)) },
    ...VERSIONS.flatMap(version =>
      [false, true].map(other => {
        const name = `synthetic/synth-${version}-11works${other ? '-opu-owr' : ''}.cwr`;
        return { name, version, doc: parse(fixture(name)) };
      }),
    ),
  ];

  for (const { name, version, doc } of sources) {
    it(`${name} reads as ${version}`, () => {
      expect(doc.version.version).toBe(version);
    });

    it(`${name}: spans of each first-of-type record tile the layout and stay inside it`, () => {
      const seen = new Set<string>();
      for (let ref = 0; ref < doc.records.length; ref++) {
        const rec = doc.records[ref]!;
        if (seen.has(rec.type)) continue;
        seen.add(rec.type);
        const layout = layoutOf(doc, ref);
        if (!layout) {
          expect(rec.status, rec.type).toBe('unknown-type'); // ALX and the blank-typed line in the sample
          continue;
        }
        let width = 0;
        for (const f of layout.fields) {
          const span = fieldSpan(doc, ref, f.id)!;
          expect(span, `${rec.type}.${f.id}`).not.toBeNull();
          expect(span.start).toBe(f.start);
          width += span.end - span.start;
          // A field the line reaches is read from the line; a field past a short line reads as ''.
          const raw = getField(doc, ref, f.id)!;
          expect(raw.length).toBe(Math.max(0, Math.min(span.end, rec.length) - span.start));
        }
        expect(width, `${rec.type} spans`).toBe(layout.fullLength);
        expect(width).toBe(layoutLength(version, rec.type));
      }
      expect(seen.has('HDR') && seen.has('GRH') && seen.has('NWR')).toBe(true);
    });

    it(`${name}: HDR and NWR are exactly layoutLength wide; GRH is layoutLength or an alsoValid length`, () => {
      // The sample's first NWR is one of the six planted 208-character lines (a short record), so take the first
      // record of the type that is not flagged.
      const first = (type: string): number => doc.records.findIndex(r => r.type === type && r.status === 'ok');
      for (const type of ['HDR', 'GRH', 'NWR']) {
        const ref = first(type);
        const rec = doc.records[ref]!;
        const full = layoutLength(version, type)!;
        const layout = layoutOf(doc, ref)!;
        expect(layout.fields.reduce((n, f) => n + (f.end - f.start), 0), `${type} span widths`).toBe(full);
        if (type === 'GRH') {
          // The spec's GRH is 28 (Submission/Distribution Type 27/2 is "not used for CWR"); the sample and
          // the generator both end the record at 26, which the layout accepts as ok.
          expect([full, ...(layout.alsoValid ?? [])]).toContain(rec.length);
          expect(rec.length).toBe(26);
        } else {
          expect(rec.length, type).toBe(full);
        }
        expect(rec.status, type).toBe('ok');
      }
    });

    it(`${name}: the HDR and GRH fields read where the spec puts them`, () => {
      const hdr = doc.file.hdr!;
      const grh = doc.file.groups[0]!.grh;
      expect(getField(doc, grh, 'transactionType')).toBe('NWR');
      expect(getField(doc, grh, 'groupId')).toMatch(/^\d{5}$/);
      expect(getField(doc, hdr, 'senderType')!.trim()).not.toBe('');
      if (version === '2.2') expect(getField(doc, hdr, 'version')).toBe('2.2');
      else expect(getField(doc, hdr, 'version')).toBeUndefined();
    });
  }
});

describe('positions the parser reads without a layout agree with the spec', () => {
  // parse.ts finds the version before it knows which layout to use, and reads the sequence prefix of every
  // non-control record by position. These hold the literals to the generated spec.
  it('HDR version (102/3), GRH version number (12/5) and GRH transaction type (4/3)', () => {
    const at = (record: string, id: string) => fieldsOf('2.2', record).find(f => f.id === id)!;
    expect([at('HDR', 'version').start - 1, at('HDR', 'version').start - 1 + at('HDR', 'version').size]).toEqual([101, 104]);
    const v = at('GRH', 'versionNumberForThisTransactionType');
    expect([v.start - 1, v.start - 1 + v.size]).toEqual([11, 16]);
    const t = at('GRH', 'transactionType');
    expect([t.start - 1, t.start - 1 + t.size]).toEqual([3, 6]);
  });

  it('every non-control layout starts transactionSequence at 4/8 and recordSequence at 12/8', () => {
    for (const version of VERSIONS) {
      for (const key of layoutKeys(version)) {
        if (['HDR', 'GRH', 'GRT', 'TRL'].includes(key)) continue;
        const f = fieldsOf(version, key);
        expect(f[1]!.id).toBe('transactionSequence');
        expect([f[1]!.start, f[1]!.size]).toEqual([4, 8]);
        expect(f[2]!.id).toBe('recordSequence');
        expect([f[2]!.start, f[2]!.size]).toEqual([12, 8]);
      }
    }
  });

  it('the spec has no duplicate field ids inside a layout', () => {
    for (const version of VERSIONS) {
      const keys = allFields(version).map(f => `${f.record}.${f.id}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
