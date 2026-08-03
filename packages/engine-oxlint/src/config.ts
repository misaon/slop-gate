import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'
import { PARSE_ERROR_RULE_ID } from './parse.ts'

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
  // `[level, ...options]` when the rule has options, a bare level string otherwise — oxlint's own
  // two config shapes, and the bare form is kept for an option-free rule so the hash of an
  // option-free selection is exactly what it always was. The option values are written through
  // verbatim: core carries them opaquely (`EngineRuleSetting`) and oxlint checks them against each
  // rule's own schema — usually refusing to parse the config and naming the offending key, though not
  // for every rule (`typescript/ban-ts-comment` accepts an unknown key in silence, confirmed against
  // 1.76.0). Translating or pre-validating them here would only add a second, weaker opinion about a
  // grammar oxlint already owns, and would need updating every time a rule gains an option.
  const rules = Object.fromEntries(
    [...selection]
      // `parse-error` is attribution for oxlint's own always-on parsing behaviour, not a rule
      // oxlint's config format knows how to enable — writing it into `rules` makes oxlint reject
      // the whole config with "Rule 'parse-error' not found in plugin 'eslint'" (confirmed against
      // the real binary), failing every run that elects `correctness.parse-error`.
      .filter(([engineRuleId, [level]]) => level !== 'off' && engineRuleId !== PARSE_ERROR_RULE_ID)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([engineRuleId, [level, ...options]]) => {
        const oxlintLevel = LEVEL_TO_OXLINT[level] ?? 'warn'
        return [engineRuleId, options.length === 0 ? oxlintLevel : [oxlintLevel, ...options]]
      }),
  )

  // oxlint only activates a rule whose scope is listed in `plugins`. Without this, an elected rule
  // from any scope beyond eslint/typescript/unicorn/oxc is silently ignored: no warning, no config
  // rejection, `number_of_rules: 0`. That is the mirror image of the categories defect — instead of
  // unelected rules running, elected rules do not. `eslint` itself is always available and never
  // needs to appear here (confirmed: an empty `plugins` array does not narrow out bare rule ids).
  const scopes = Object.keys(rules).flatMap((id) => (id.includes('/') ? [id.split('/')[0]!] : []))
  const plugins = [...new Set(scopes)].sort(compareStrings)

  const config = { categories: ALL_CATEGORIES_OFF, plugins, rules }
  // Hashing the whole config object rather than the rule ids is what makes options part of the
  // cache key: `rulesetHash` is the only per-engine term in `deriveResultKey`, so a run that changes
  // `eqeqeq` from `smart` to `always` and nothing else must not be served the previous run's
  // findings. `EngineRuleSetting` states this as a contract for every adapter.
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
