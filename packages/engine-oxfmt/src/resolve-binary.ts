import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type OxfmtInvocation = ScriptBinInvocation

/**
 * Resolves the **bundled** oxfmt, from `import.meta.url` rather than the analysed project.
 *
 * The opposite anchor to `tsc` (spec §13.1), and for the opposite reason. A type error has to match what the
 * developer's own build reports, so tsc must be theirs. Formatting is the other way round: the output *is* the
 * standard, and two versions of a formatter disagree about ordinary code, so resolving theirs would mean
 * `sgate check` reporting a file as unformatted on one machine and formatted on another. Pinning ours makes
 * "unformatted" mean one thing.
 *
 * The cost is real and worth stating: a project that pins its own oxfmt or prettier and formats with that will
 * see disagreements wherever the two versions differ. `oxfmt --migrate=prettier` exists for the first half of
 * that problem, and `format.unformatted: 'off'` for a project that would rather keep its own.
 */
export function resolveOxfmtBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): OxfmtInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxfmt/package.json',
    binSegments: ['bin', 'oxfmt'],
    resolvePackageJson,
    fileExists,
  })
}
