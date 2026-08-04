import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EngineError,
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'
import { CSS_PARSE_ERROR_RULE_ID } from './parse.ts'
import { FOREIGN_SUPPRESSION_RULE_ID, ruleByEngineRuleId } from './rules.ts'

const LEVEL_TO_BIOME: Readonly<Record<string, string>> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  off: 'off',
}

const CONFIG_BASENAME = 'biome.json'

const MAX_FILE_BYTES = 64 * 1024 * 1024

export type BiomeCssConfigHandle = EngineConfigHandle & { readonly enabledRuleIds: ReadonlySet<string> }

export async function materializeBiomeCssConfig(
  selection: EngineRuleSelection,
  context: RunContext,
): Promise<BiomeCssConfigHandle> {
  const elected = [...selection].filter(([, [level]]) => level !== 'off').map(([engineRuleId]) => engineRuleId)
  const enabled = [...selection]
    .filter(([engineRuleId, [level]]) => {
      if (level === 'off') return false
      return engineRuleId !== CSS_PARSE_ERROR_RULE_ID && engineRuleId !== FOREIGN_SUPPRESSION_RULE_ID
    })
    .sort(([a], [b]) => compareStrings(a, b))

  const rules: Record<string, Record<string, string>> = {}
  for (const [engineRuleId, [level]] of enabled) {
    const rule = ruleByEngineRuleId(engineRuleId)
    if (rule === undefined) {
      throw new EngineError('biome-css', `elected rule '${engineRuleId}' is not a known biome CSS rule`)
    }
    ;(rules[rule.group] ??= {})[rule.engineRuleId] = LEVEL_TO_BIOME[level] ?? 'warn'
  }

  const config = {
    root: true,
    linter: { enabled: true, rules: { recommended: false, ...rules } },
    formatter: { enabled: false },
    assist: { enabled: false },
    css: {
      linter: { enabled: true },
      parser: { cssModules: true, tailwindDirectives: true },
    },
    files: { maxSize: MAX_FILE_BYTES },
  }
  const rulesetHash = hashJson(config)

  const dir = join(context.tmpDir, `biome-css.${rulesetHash.slice(0, 12)}`)
  await mkdir(dir, { recursive: true })
  await assertCleanConfigDir(dir)
  const path = join(dir, CONFIG_BASENAME)
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')

  return {
    path,
    rulesetHash,
    ruleCount: enabled.length,
    enabledRuleIds: new Set(elected),
    async dispose() {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

async function assertCleanConfigDir(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  const intruder = entries.find(
    (entry) => entry.name !== CONFIG_BASENAME && (entry.isDirectory() || /^biome\.jsonc?$/.test(entry.name)),
  )
  if (intruder !== undefined) {
    throw new EngineError(
      'biome-css',
      `the biome config directory must hold nothing but ${CONFIG_BASENAME}, but it also holds '${intruder.name}'. ` +
        'Biome scans the directory its config lives in and aborts on any nested configuration it finds there.',
    )
  }
}
