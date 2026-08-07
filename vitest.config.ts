import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import codspeed from '@codspeed/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Every workspace package aliased to its `src`. Without this a cross-package import resolves through
// `exports` to `dist`, so `pnpm test` silently tests the *previous* build.
//
// The cost is that no in-process test touches `dist`. Three suites spawn a real child process and so
// cannot see this alias — cli/src/main.test.ts, cli/src/commands/mcp/e2e.test.ts and
// core/src/registry/entries.generated.test.ts. Weakening any of them to an in-process import would
// leave the suite unable to tell a working build from no build at all.
const workspaceAlias = Object.fromEntries(
  readdirSync('packages', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = JSON.parse(readFileSync(resolve('packages', entry.name, 'package.json'), 'utf8')) as {
        name: string
      }
      return [manifest.name, resolve('packages', entry.name, 'src/index.ts')]
    }),
)

export default defineConfig({
  // A no-op unless the run is under `CodSpeedHQ/action`, which is what lets `pnpm bench` mean the same
  // thing in a terminal and in CI. The plugin replaces the timing loop with CPU instrumentation there,
  // because a shared runner's wall clock varies by more than 30% and cannot gate anything.
  plugins: [codspeed()],
  resolve: { alias: workspaceAlias },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    benchmark: { include: ['packages/*/bench/**/*.bench.ts'] },
  },
})
