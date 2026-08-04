import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EngineError,
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'
import { astGrepRuleById, type AstGrepLanguage } from './rules.ts'

const LEVEL_TO_ASTGREP: Readonly<Record<string, string>> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  off: 'off',
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export type AstGrepRuleFile = {
  readonly documents: readonly { readonly engineRuleId: string; readonly language: AstGrepLanguage }[]
  readonly text: string
}

export function buildAstGrepConfig(selection: EngineRuleSelection): AstGrepRuleFile {
  const enabled = [...selection]
    .filter(([, [level]]) => level !== 'off')
    .sort(([a], [b]) => compareStrings(a, b))

  const documents: { engineRuleId: string; language: AstGrepLanguage }[] = []
  const blocks: string[] = []

  for (const [engineRuleId, [level]] of enabled) {
    const rule = astGrepRuleById(engineRuleId)
    if (rule === undefined) {
      throw new EngineError('astgrep', `no ast-grep rule is defined for elected rule id \`${engineRuleId}\``)
    }
    for (const language of rule.languages) {
      documents.push({ engineRuleId, language })
      blocks.push(
        [
          `id: ${engineRuleId}`,
          `language: ${language}`,
          `severity: ${LEVEL_TO_ASTGREP[level] ?? 'warning'}`,
          `message: ${quote(rule.message)}`,
          `note: ${quote(rule.note)}`,
          rule.body.trimEnd(),
        ].join('\n'),
      )
    }
  }

  return { documents, text: blocks.length === 0 ? '' : `${blocks.join('\n---\n')}\n` }
}

export async function materializeAstGrepConfig(
  selection: EngineRuleSelection,
  context: RunContext,
): Promise<EngineConfigHandle> {
  const config = buildAstGrepConfig(selection)
  const rulesetHash = hashJson(config.documents)

  await mkdir(context.tmpDir, { recursive: true })
  const path = join(context.tmpDir, `astgrep-rules.${rulesetHash.slice(0, 12)}.yml`)
  await writeFile(path, config.text, 'utf8')

  return {
    path,
    rulesetHash,
    ruleCount: config.documents.length,
    async dispose() {
      await rm(path, { force: true })
    },
  }
}
