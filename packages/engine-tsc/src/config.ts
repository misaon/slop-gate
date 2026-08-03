import { readFile } from 'node:fs/promises'
import { hashJson, type EngineConfigHandle, type EngineRuleSelection } from '@misaon/slop-gate-core'
import { TYPE_ERROR_RULE_ID } from './parse.ts'

/**
 * Writes nothing to disk: `tsc` reads the project's own `tsconfig.json` via `-p`, and there is no per-rule
 * selection to translate — `selection` only ever contains `type-error` (see the `tsc` `RuleEntry` in
 * packages/core/src/registry/entries.uncatalogued.ts). **`handle.path` is the tsconfig itself**, reused by `run()`
 * as the `-p` argument, so unlike every other adapter's handle it points at a file this one did not create.
 *
 * `rulesetHash` folds in the resolved tsconfig's content, not just the selected level, so turning `strict` on
 * invalidates the cache even though no `.ts` file changed. A missing or unreadable tsconfig is deliberately *not*
 * an error here: `run()`'s real invocation is the single source of truth, and pre-empting it with a second, weaker
 * check would only produce a worse message for the same problem.
 */
export async function materializeTscConfig(selection: EngineRuleSelection, tsconfigPath: string): Promise<EngineConfigHandle> {
  // The level alone, not the whole setting: `type-error` has no options, so folding the option half in would
  // invalidate a whole project's cache entry over a value this adapter never reads.
  const level = selection.get(TYPE_ERROR_RULE_ID)?.[0] ?? 'off'

  let tsconfigContent: string | null
  try {
    tsconfigContent = await readFile(tsconfigPath, 'utf8')
  } catch {
    tsconfigContent = null
  }

  const rulesetHash = hashJson({ level, tsconfigPath, tsconfigContent })

  return {
    path: tsconfigPath,
    rulesetHash,
    // Nothing was written, so there is nothing to remove.
    async dispose() {},
  }
}
