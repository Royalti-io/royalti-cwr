import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The engine reads no file, makes no request and writes nothing. `npm run lint` bans the same names in src/; this is a second,
// independent look that does not depend on the lint configuration staying intact.
const SRC = fileURLToPath(new URL('../src', import.meta.url));

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

/** Source text without comments and without the contents of string literals' escapes (good enough to look for calls). */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the engine does no I/O', () => {
  const sources = [...files(SRC)].map(f => [f.slice(SRC.length + 1), code(readFileSync(f, 'utf8'))] as const);

  it('scans a real source tree', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('imports nothing from Node and no package', () => {
    for (const [name, text] of sources) {
      expect(text, name).not.toMatch(/from\s+['"]node:/);
      expect(text, name).not.toMatch(/from\s+['"](?:fs|path|http|https|net|crypto|child_process|os)['"]/);
      expect(text, name).not.toMatch(/\brequire\s*\(/);
      expect(text, name).not.toMatch(/from\s+['"][^./]/);
    }
  });

  it('calls no network, worker or dynamic-code API', () => {
    for (const [name, text] of sources) {
      expect(text, name).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\b/);
      expect(text, name).not.toMatch(/\beval\s*\(|\bnew\s+Function\b/);
      expect(text, name).not.toMatch(/\bnavigator\b|\bprocess\.|\bBuffer\b/);
    }
  });

  it('has no runtime dependency', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toBeUndefined();
  });
});
