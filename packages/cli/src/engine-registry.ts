import type { Engine } from '@misaon/slop-gate-core'
import { createActionlintEngine } from '@misaon/slop-gate-engine-actionlint'
import { createAstGrepEngine } from '@misaon/slop-gate-engine-astgrep'
import { createBiomeCssEngine } from '@misaon/slop-gate-engine-biome-css'
import { createDepsSecurityEngine } from '@misaon/slop-gate-engine-deps-security'
import { createHadolintEngine } from '@misaon/slop-gate-engine-hadolint'
import { createKnipEngine } from '@misaon/slop-gate-engine-knip'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { createSchemaEngine } from '@misaon/slop-gate-engine-schema'
import { createOxfmtEngine } from '@misaon/slop-gate-engine-oxfmt'
import { createTscEngine } from '@misaon/slop-gate-engine-tsc'

/**
 * The engines a real `sgate` run registers. Shared by `check` and the `rules` governance commands so
 * arbitration's `participatingEngines`/`capabilities` — which drive `rules why`'s explanations — are always
 * computed from exactly the same engine set a real `check` would use, never a second hand-maintained guess.
 *
 * `rootDir` is required because `tsc` is project-granularity and `typescript` is a peer dependency resolved
 * from the analysed project itself, not from wherever `@misaon/slop-gate-engine-tsc` happens to be installed
 * — there is no project-independent default the way there is for oxlint. `configFile` is the repo-relative
 * path the config was loaded from; only knip reads it, and only to keep itself from reporting our own config
 * file as unused. Every other engine needs no binding: each is bundled and either file-granularity or
 * in-process, so its whole input arrives per call through `RunContext` and the `FileBatch`.
 *
 * **Registration is unconditional, including for the engines that may not be able to run — that is the
 * point.** A registered-but-absent engine is a coverage gap the run states out loud, deliberately not the
 * same fact as an engine that was never registered at all (see `IneligibilityReason`). Four are in that
 * class: actionlint and hadolint when their binaries are absent, `tsc` when the root has no `tsconfig.json`
 * for `tsc -p` to point at, and `deps-security` when no advisory snapshot has been installed — its
 * `availability()` is a `stat` on what `sgate engines install advisories` writes, because `sgate check` may
 * not reach the network and so never fetches. Registering an engine does not by itself make `check` invoke
 * it either: arbitration assigns work only where an enabled concept resolves to it.
 */
export function defaultEngines(rootDir: string, configFile?: string, ignore?: readonly string[]): Engine[] {
  return [
    createOxlintEngine(),
    createOxfmtEngine(),
    createTscEngine({ rootDir }),
    createKnipEngine({
      ...(configFile === undefined ? {} : { configFile }),
      ...(ignore === undefined ? {} : { ignore }),
    }),
    createAstGrepEngine(),
    createSchemaEngine(),
    createActionlintEngine(),
    createBiomeCssEngine(),
    createDepsSecurityEngine(),
    createHadolintEngine(),
  ]
}
