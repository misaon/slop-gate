import { readFile } from 'node:fs/promises'
import { hashJson, type EngineConfigHandle, type EngineRuleSelection } from '@misaon/slop-gate-core'
import { TYPE_ERROR_RULE_ID } from './parse.ts'

/**
 * Writes nothing to disk: `tsc` reads each project's own `tsconfig.json` via `-p`, and there is no per-rule
 * selection to translate — `selection` only ever contains `type-error` (see the `tsc` `RuleEntry` in
 * packages/core/src/registry/entries.uncatalogued.ts). **`handle.path` is a tsconfig, not a file this adapter
 * created**, unlike every other adapter's handle.
 *
 * `rulesetHash` folds in every project's path *and* content, not just the selected level, so turning `strict`
 * on in one package of a monorepo invalidates the cache even though no `.ts` file changed — and so does a
 * reference appearing or disappearing, which changes what "the project" covers. A missing or unreadable
 * tsconfig is deliberately *not* an error here: `run()`'s real invocation is the single source of truth, and
 * pre-empting it with a second, weaker check would only produce a worse message for the same problem.
 */
export async function materializeTscConfig(
  selection: EngineRuleSelection,
  projects: readonly string[],
): Promise<EngineConfigHandle> {
  // The level alone, not the whole setting: `type-error` has no options, so folding the option half in would
  // invalidate a whole project's cache entry over a value this adapter never reads.
  const level = selection.get(TYPE_ERROR_RULE_ID)?.[0] ?? 'off'

  const contents = await Promise.all(
    projects.map(async (path) => ({ path, content: await readFile(path, 'utf8').catch(() => null) })),
  )

  return {
    path: projects[0] ?? '',
    rulesetHash: hashJson({ level, projects: contents }),
    // Nothing was written, so there is nothing to remove.
    async dispose() {},
  }
}
