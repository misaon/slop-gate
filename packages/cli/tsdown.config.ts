import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
