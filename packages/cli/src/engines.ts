import type { Engine } from '@misaon/slop-gate-core'
import { createKnipEngine } from '@misaon/slop-gate-engine-knip'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { createTscEngine } from '@misaon/slop-gate-engine-tsc'

/**
 * The engines a real `sgate` run registers. Shared by `check` and the `rules` governance
 * commands so arbitration's `participatingEngines`/`capabilities` — which drive `rules why`'s
 * explanations — are always computed from exactly the same engine set a real `check` would use,
 * never a second, hand-maintained guess at it.
 *
 * `rootDir` is required (previously none): `tsc` is project-granularity and `typescript` is a peer
 * dependency resolved from the analysed project itself, not from wherever
 * `@misaon/slop-gate-engine-tsc` happens to be installed — there is no project-independent default
 * the way there is for oxlint. `knip` needs no such binding despite also being project-granularity:
 * it is bundled, so it resolves from its own adapter's install location, and everything
 * project-specific reaches it per call through `RunContext` and the `FileBatch`.
 *
 * `configFile` is the repo-relative path the config was actually loaded from, when one was found.
 * Only knip reads it, and only to keep itself from reporting our own config file as unused — the
 * caller is the sole holder of that path, since `loadCliConfig` is where the search happens.
 *
 * Registering an engine here does not, on its own, make `sgate check` invoke it: arbitration only
 * assigns work if some enabled concept resolves to it, and neither `types.type-error` (`tsc`) nor any
 * of the ten `dead-code.*`/`deps.*` concepts knip owns is part of the `recommended` preset — see the
 * comments on those decisions in `packages/core/src/config/presets.ts` and
 * `packages/core/src/registry/entries.manual.ts`. Both are opted into by concept today.
 */
export function defaultEngines(rootDir: string, configFile?: string): Engine[] {
  return [
    createOxlintEngine(),
    createTscEngine({ rootDir }),
    createKnipEngine({ ...(configFile === undefined ? {} : { configFile }) }),
  ]
}
