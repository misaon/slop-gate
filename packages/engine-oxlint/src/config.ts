import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'

const LEVEL_TO_OXLINT: Readonly<Record<string, string>> = {
  error: 'error',
  warn: 'warn',
  info: 'warn',
  off: 'off',
}

/**
 * oxlint enables 114 rules by default (mostly `correctness`, plus one each in `suspicious` and
 * `style`) regardless of the `categories` key being absent or `{}` — confirmed against the real
 * binary (Task 11 Step 1). Every real category must be turned off explicitly, or a rule the
 * registry never elected still reports, bypassing arbitration. `"all"` is a CLI-only shorthand,
 * not a valid key here; oxlint's config parser rejects it.
 */
const ALL_CATEGORIES_OFF = {
  correctness: 'off',
  suspicious: 'off',
  pedantic: 'off',
  perf: 'off',
  style: 'off',
  restriction: 'off',
  nursery: 'off',
} as const

export async function materializeOxlintConfig(
  selection: EngineRuleSelection,
  context: RunContext,
): Promise<EngineConfigHandle> {
  const rules = Object.fromEntries(
    [...selection]
      .filter(([, level]) => level !== 'off')
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([ruleId, level]) => [ruleId, LEVEL_TO_OXLINT[level] ?? 'warn']),
  )

  const config = { categories: ALL_CATEGORIES_OFF, rules }
  const rulesetHash = hashJson(config)

  await mkdir(context.tmpDir, { recursive: true })
  const path = join(context.tmpDir, `oxlintrc.${rulesetHash.slice(0, 12)}.json`)
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')

  return {
    path,
    rulesetHash,
    async dispose() {
      await rm(path, { force: true })
    },
  }
}
