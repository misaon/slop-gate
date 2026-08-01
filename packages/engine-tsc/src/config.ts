import { readFile } from 'node:fs/promises'
import { hashJson, type EngineConfigHandle, type EngineRuleSelection } from '@misaon/slop-gate-core'
import { TYPE_ERROR_RULE_ID } from './parse.ts'

/**
 * Unlike oxlint's `materializeOxlintConfig`, this writes nothing to disk: `tsc` reads the project's
 * own `tsconfig.json` directly via `-p`, and there is no per-rule selection to translate into an
 * engine-native config file — `selection` only ever contains `type-error` itself (see the `tsc`
 * `RuleEntry` in packages/core/src/registry/entries.manual.ts), already `off`-filtered by `buildPlan`
 * before this is even called. `handle.path` is the tsconfig path itself, reused directly by `run()` as
 * the `-p` argument — the same field oxlint's handle uses for its own materialised file, just pointing
 * at something this adapter did not create.
 *
 * `rulesetHash` folds in the resolved tsconfig's own content (not just the selected level) so editing
 * compiler options — turning `strict` on, say — invalidates the cache even though no `.ts` file
 * changed. A missing or unreadable tsconfig is deliberately *not* an error here: `run()`'s real `tsc`
 * invocation is the single source of truth for that (a missing/invalid tsconfig surfaces as a real,
 * actionable `EngineError` there — see parse.ts's `GLOBAL` diagnostic handling) — pre-empting it here
 * with a second, weaker check would just produce a worse error message for the same problem.
 */
export async function materializeTscConfig(selection: EngineRuleSelection, tsconfigPath: string): Promise<EngineConfigHandle> {
  const level = selection.get(TYPE_ERROR_RULE_ID) ?? 'off'

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
