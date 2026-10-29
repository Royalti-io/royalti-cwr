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

// Four entry points. `lite` is the checker API: `index` without lookupLabel, lookupRow and the builder; it stays a separate entry so a
// page can keep importing `@royalti/cwr/lite` in a worker. `build` is the spreadsheet-to-CWR builder on its own, so the checker's
// bundle does not carry it. In this package every build carries the same (quote-free) data.
export default defineConfig([
  { ...common, entry: { index: 'src/index.ts' } },
  { ...common, entry: { lite: 'src/lite.ts' } },
  { ...common, entry: { build: 'src/build/index.ts' } },
  { ...common, entry: { reference: 'src/reference/index.ts' } },
]);
