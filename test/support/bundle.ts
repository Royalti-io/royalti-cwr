import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface Bundled {
  /** The bundled module's source text. */
  code: string;
  /** The module, evaluated. */
  mod: Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Bundles one entry of src/ in memory the way tsup does, and imports it. */
export async function bundleEntry(entry: 'lite' | 'index' | 'reference' | 'build'): Promise<Bundled> {
  const file = entry === 'reference' ? 'src/reference/index.ts' : entry === 'build' ? 'src/build/index.ts' : `src/${entry}.ts`;
  const built = await build({
    entryPoints: [resolve(root, file)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
    charset: 'utf8',
  });
  const code = built.outputFiles[0]!.text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return { code, mod };
}
