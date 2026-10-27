import { beforeEach, describe, expect, it, vi } from 'vitest';

// extractWorks must hand back no file when a guardrail fails. To make a guardrail fail inside the real function, this file wraps the
// text encoder that extractWorks writes its lines with, and damages one line on request. Nothing else in the engine is changed.
const tamper = vi.hoisted(() => ({ mode: 'none' as 'none' | 'body' | 'prefix' | 'drop' | 'counts' }));

vi.mock('../../src/model/text', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/model/text')>();
  return {
    ...original,
    encodeText: (text: string, encoding: 'ascii' | 'latin1' | 'utf8') => {
      let t = text;
      if (tamper.mode === 'body' && t.startsWith('SPU')) t = t.slice(0, 40) + 'Q' + t.slice(41);
      if (tamper.mode === 'prefix' && t.startsWith('SWT')) t = t.slice(0, 11) + '00000099' + t.slice(19);
      if (tamper.mode === 'counts' && t.startsWith('TRL')) t = t.slice(0, 8) + '00000099' + t.slice(16);
      if (tamper.mode === 'drop' && t.startsWith('PWR')) return new Uint8Array(0);
      return original.encodeText(t, encoding);
    },
  };
});

import { extractWorks, extractWorksSteps } from '../../src/index';
import type { ExtractResult, Progress } from '../../src/index';
import { synth } from './support';

const src = synth('2.1', 5);
const all = src.file.groups[0]!.transactions.map(t => t.header);

beforeEach(() => {
  tamper.mode = 'none';
});

describe('extractWorks returns an error and no file when a guardrail fails', () => {
  it('works when nothing is damaged', () => {
    expect(extractWorks(src, all, { keepHeader: true }).ok).toBe(true);
  });

  it('guardrail 1: a record that went missing', () => {
    tamper.mode = 'drop';
    const r = extractWorks(src, all);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('guardrail');
    expect(r.checks?.reparse.ok).toBe(false);
    expect('bytes' in r).toBe(false);
    expect('doc' in r).toBe(false);
  });

  it('guardrail 2: a wrong sequence number', () => {
    tamper.mode = 'prefix';
    const r = extractWorks(src, all);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('guardrail');
    expect(r.checks).toMatchObject({ ok: false, reparse: { ok: true }, structure: { ok: false }, bodies: { ok: true } });
    expect('bytes' in r).toBe(false);
  });

  it('guardrail 2: a wrong file count', () => {
    tamper.mode = 'counts';
    const r = extractWorks(src, all);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.checks?.structure.problems.join(' ')).toContain('TRL-F-002');
  });

  it('guardrail 3: a changed record body', () => {
    tamper.mode = 'body';
    const r = extractWorks(src, all);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('guardrail');
    expect(r.checks).toMatchObject({ ok: false, reparse: { ok: true }, bodies: { ok: false } });
    expect('bytes' in r).toBe(false);
  });

  it.each([
    ['drop', 'reparse', ['build', 'reparse']],
    ['prefix', 'structure', ['build', 'reparse', 'structure', 'bodies']],
    ['counts', 'structure', ['build', 'reparse', 'structure', 'bodies']],
    ['body', 'bodies', ['build', 'reparse', 'structure', 'bodies']],
  ] as const)('the generator refuses in the same way when the damage is %s: guardrail %s, and no file', (mode, failed, stages) => {
    tamper.mode = mode;
    const progress: Progress[] = [];
    const gen = extractWorksSteps(src, all);
    let result: ExtractResult | undefined;
    for (;;) {
      const next = gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
      progress.push(next.value);
    }
    expect(result).toEqual(extractWorks(src, all));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('guardrail');
    expect(result.checks?.[failed].ok).toBe(false);
    expect('bytes' in result).toBe(false);
    expect('doc' in result).toBe(false);
    // The run reports the stages it reached; a read-back that does not line up ends the run before the structure rules.
    expect([...new Set(progress.map(p => p.stage))]).toEqual(stages);
  });

  it.each(['drop', 'prefix', 'counts', 'body'] as const)('a guardrail that fails because of what the tool wrote names the tool as the cause (%s)', mode => {
    tamper.mode = mode;
    const r = extractWorks(src, all);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('guardrail');
      expect(r.error.cause).toBe('tool');
      expect(r.error.message).toMatch(/check failed/);
    }
  });

  it('the source document is untouched by a failed extraction', () => {
    tamper.mode = 'body';
    extractWorks(src, all);
    expect(src.edits.size).toBe(0);
  });
});
