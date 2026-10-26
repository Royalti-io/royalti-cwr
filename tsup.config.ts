import { defineConfig } from 'tsup';

const common = {
  format: ['esm', 'cjs'] as ('esm' | 'cjs')[],
  dts: true,
  target: 'es2020',
  sourcemap: false,
  treeshake: true,
  // `dist` is emptied by the `prebuild` script: three configs run side by side and must not clean each other's output.
  clean: false,
};

// Three entry points. `lite` is the same API as `index` without lookupLabel and lookupRow; it stays a separate entry so a page can
// keep importing `@royalti/cwr/lite` in a worker. In this package the three builds carry the same (quote-free) data.
export default defineConfig([
  { ...common, entry: { index: 'src/index.ts' } },
  { ...common, entry: { lite: 'src/lite.ts' } },
  { ...common, entry: { reference: 'src/reference/index.ts' } },
]);
