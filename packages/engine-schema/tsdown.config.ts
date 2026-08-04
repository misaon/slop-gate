import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // tsdown 0.22 flipped `fixedExtension` to default true when `platform` resolves to node, which
  // renames every output to `.mjs`/`.d.mts`. Every `exports` map here points at `.js`/`.d.ts`, so
  // the rename breaks cross-package resolution outright: `TS2307: Cannot find module
  // '@misaon/slop-gate-core'` from all twelve dependants. These packages are `"type": "module"`,
  // so `.js` is already unambiguously ESM and the fixed extension buys nothing.
  fixedExtension: false,
})
