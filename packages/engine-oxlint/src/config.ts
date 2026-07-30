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

  // oxlint only activates a rule whose scope is listed in `plugins`. Without this, an elected rule
  // from any scope beyond eslint/typescript/unicorn/oxc is silently ignored: no warning, no config
  // rejection, `number_of_rules: 0`. That is the mirror image of the categories defect — instead of
  // unelected rules running, elected rules do not. `eslint` itself is always available and never
  // needs to appear here (confirmed: an empty `plugins` array does not narrow out bare rule ids).
  const scopes = Object.keys(rules).flatMap((id) => (id.includes('/') ? [id.split('/')[0]!] : []))
  const plugins = [...new Set(scopes)].sort(compareStrings)

  const config = { categories: ALL_CATEGORIES_OFF, plugins, rules }
  const rulesetHash = hashJson(config)

  await mkdir(context.tmpDir, { recursive: true })
  const path = join(context.tmpDir, `oxlintrc.${rulesetHash.slice(0, 12)}.json`)
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')

  return {
    path,
    rulesetHash,
    ruleCount: Object.keys(rules).length,
    async dispose() {
      await rm(path, { force: true })
    },
  }
}
