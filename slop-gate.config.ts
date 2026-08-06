import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  extends: ['recommended'],
  ignore: ['fixtures/**', 'packages/*/fixtures/**', 'packages/perf/.corpus/**'],
})
