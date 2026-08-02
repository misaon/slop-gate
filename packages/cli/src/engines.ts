import type { Engine } from '@misaon/slop-gate-core'
import { createActionlintEngine } from '@misaon/slop-gate-engine-actionlint'
import { createAstGrepEngine } from '@misaon/slop-gate-engine-astgrep'
import { createBiomeCssEngine } from '@misaon/slop-gate-engine-biome-css'
import { createKnipEngine } from '@misaon/slop-gate-engine-knip'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { createSchemaEngine } from '@misaon/slop-gate-engine-schema'
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
 * `astgrep` needs neither binding, for both of the reasons above at once: it is bundled (a native
 * binary resolved from this monorepo's own install, see `resolveAstGrepBinary`) and
 * file-granularity, so its whole input arrives per call in the `FileBatch`.
 *
 * `schema` needs no binding either, and for a third reason on top of those two: it runs in-process.
 * There is no binary to resolve and nothing to spawn — it is `ajv` and `yaml` over a vendored copy of
 * the Compose specification. It is also the first engine registered here whose concepts are in
 * `recommended`, so unlike every other entry below it does real work on a default `sgate check`.
 *
 * `actionlint` needs no binding either, and is the first entry here that may not be *runnable*: it
 * is the only optional engine, so it declares `availability()` and is resolved from `PATH`, from
 * `SLOP_GATE_ACTIONLINT_PATH` or from slop-gate's own cache. Registering it unconditionally is the
 * point — an engine that is registered and absent is a coverage gap the run states out loud, which
 * is deliberately not the same fact as an engine that was never registered at all (see
 * `IneligibilityReason`).
 *
 * `biome-css` needs no binding, for the same two reasons as `astgrep`: it is bundled (`@biomejs/biome`
 * is an ordinary dependency of its adapter, with eight platform optional dependencies, so there is
 * nothing optional about it and no `availability()`) and file-granularity. It is the second entry
 * here whose concepts are in `recommended`, and the quietest thing in this list by design — seventeen
 * rules of which thirteen produced no finding at all across 1729 production stylesheets. A repository
 * with no `.css` files never reaches it, since every one of its entries is `languages: ['css']`; a
 * repository whose stylesheets are all SCSS also gets nothing, because Biome cannot lint SCSS and this
 * engine does not pretend otherwise.
 *
 * Registering an engine here does not, on its own, make `sgate check` invoke it: arbitration only
 * assigns work if some enabled concept resolves to it. As of the strict-by-default change, six of
 * the seven engines are reached by `recommended` on an ordinary TypeScript repository — `tsc` via
 * `types.type-error`, ast-grep via four of its six `slop.*` concepts, and knip via five of its ten,
 * alongside oxlint, `schema` and `biome-css`. actionlint is the exception, and structurally so:
 * every one of its entries is `languages: ['github-workflow']`, so a repository with no workflows
 * never reaches it. The remaining held-out concepts — knip's other five, ast-grep's
 * `slop.swallowed-error` and `slop.emoji-in-code` — are opted into by concept, each with the
 * measurement that kept it out recorded in `packages/core/src/config/presets.ts` and
 * `packages/core/src/registry/entries.manual.ts`.
 *
 * Two of these engines can be registered and still unable to run, which is a *coverage gap* rather
 * than an error: actionlint when its binary is absent, and `tsc` when the root has no
 * `tsconfig.json` for `tsc -p` to point at. Both report it out loud.
 */
export function defaultEngines(rootDir: string, configFile?: string, ignore?: readonly string[]): Engine[] {
  return [
    createOxlintEngine(),
    createTscEngine({ rootDir }),
    createKnipEngine({
      ...(configFile === undefined ? {} : { configFile }),
      ...(ignore === undefined ? {} : { ignore }),
    }),
    createAstGrepEngine(),
    createSchemaEngine(),
    createActionlintEngine(),
    createBiomeCssEngine(),
  ]
}
