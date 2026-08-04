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
      .filter(([engineRuleId, [level]]) => level !== 'off' && engineRuleId !== PARSE_ERROR_RULE_ID)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([engineRuleId, [level, ...options]]) => {
        const oxlintLevel = LEVEL_TO_OXLINT[level] ?? 'warn'
        return [engineRuleId, options.length === 0 ? oxlintLevel : [oxlintLevel, ...options]]
      }),
  )

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
