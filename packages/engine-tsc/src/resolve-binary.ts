import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

/** Alias of the shared `ScriptBinInvocation` shape kept as its own name, matching `engine-oxlint`'s `OxlintInvocation`. */
export type TscInvocation = ScriptBinInvocation

/**
 * Resolves how to invoke the *analysed project's own* `typescript` package (spec §13.1: "Uses the
 * repo's own TypeScript version" — deliberate, since a type error must match what the developer's
 * editor and existing build already report, or the tool loses credibility on its first run). This is
 * the one real difference from `engine-oxlint`'s `resolveOxlintBinary`: oxlint is a bundled dependency,
 * always resolved relative to *this package's own* install location via `import.meta.url`; `typescript`
 * is a **peer** dependency (package.json declares it under `peerDependencies`, not `dependencies`), so
 * it must instead be resolved relative to `rootDir` — the project being checked, which may have an
 * entirely different `typescript` version installed than this monorepo does. Confirmed directly:
 * resolving from a linked NestJS playground's own directory finds *its* installed `typescript@5.9.3`,
 * not this repository's; `createRequire`'s anchor argument does not need to exist as a real file (only
 * its directory is used as the resolution root), so `join(rootDir, 'package.json')` works whether or
 * not that file is actually present.
 *
 * `typescript/bin/tsc` is, like `oxlint/bin/oxlint`, a `#!/usr/bin/env node` script with no file
 * extension (confirmed by reading it directly) — not a native binary on any platform. `resolveScriptBin`
 * (`@misaon/slop-gate-core`) is what actually resolves it to a directly-spawnable
 * `{ command: process.execPath, prefixArgs: [scriptPath] }`, sidestepping Windows' lack of OS-level
 * shebang support the same way `resolveOxlintBinary` does; see that shared function's doc comment for
 * the full chain of evidence.
 *
 * `resolvePackageJson` defaults to a resolver anchored at `rootDir` (not `import.meta.url`, which
 * would resolve *this* package's own location instead — silently wrong for a peer dependency);
 * `fileExists` defaults to the real `existsSync`. Both are parameters purely so `resolve-binary.test.ts`
 * can force each fallback branch with a stub, mirroring `engine-oxlint`'s own test.
 */
export function resolveTscBinary(
  rootDir: string,
  resolvePackageJson: (specifier: string) => string = createRequire(join(rootDir, 'package.json')).resolve,
  fileExists: (path: string) => boolean = existsSync,
): TscInvocation {
  return resolveScriptBin({
    packageJsonSpecifier: 'typescript/package.json',
    binSegments: ['bin', 'tsc'],
    fallbackCommand: 'tsc',
    resolvePackageJson,
    fileExists,
  })
}
