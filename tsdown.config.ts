import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // Emit `dist/index.js` / `dist/index.d.ts` rather than `.mjs` / `.d.mts`.
  // The authoring guide's §4 `exports` block points at `./dist/index.js`, and
  // tsdown defaults `fixedExtension` to true on the node platform, which emits
  // `.mjs`. Since `"type": "module"` already marks the package as ESM, the
  // plain `.js` extension is unambiguous — and it keeps §4 copyable verbatim.
  fixedExtension: false,
})
