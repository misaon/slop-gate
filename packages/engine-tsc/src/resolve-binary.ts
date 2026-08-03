import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type TscInvocation = ScriptBinInvocation

/**
 * Resolves the *analysed project's own* `typescript` (spec §13.1) — a type error must match what the developer's
 * editor and build already report, or the tool loses credibility on its first run. `typescript` is a **peer**
 * dependency, so unlike bundled oxlint it must be resolved relative to `rootDir` and never `import.meta.url`,
 * which would silently find this monorepo's copy instead. Confirmed directly: anchoring at a linked NestJS
 * playground finds *its* `typescript@5.9.3`, and `createRequire`'s anchor need not exist as a real file (only its
 * directory is used), so `join(rootDir, 'package.json')` works whether or not that file is present.
 *
 * `typescript/bin/tsc` is an extensionless `#!/usr/bin/env node` script, not a native binary, so `resolveScriptBin`
 * turns it into `{ command: process.execPath, prefixArgs: [scriptPath] }` — Windows has no OS-level shebang
 * support. Both function parameters exist so the tests can force each fallback branch with a stub.
 */
export function resolveTscBinary(
  rootDir: string,
  resolvePackageJson: (specifier: string) => string = createRequire(join(rootDir, 'package.json')).resolve,
  fileExists: (path: string) => boolean = existsSync,
): TscInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'typescript/package.json',
    binSegments: ['bin', 'tsc'],
    resolvePackageJson,
    fileExists,
  })
}
