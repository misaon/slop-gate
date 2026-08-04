import { readFile } from 'node:fs/promises'
import { hashJson, type EngineConfigHandle, type EngineRuleSelection } from '@misaon/slop-gate-core'
import { TYPE_ERROR_RULE_ID } from './parse.ts'

export async function materializeTscConfig(
  selection: EngineRuleSelection,
  projects: readonly string[],
): Promise<EngineConfigHandle> {
  const level = selection.get(TYPE_ERROR_RULE_ID)?.[0] ?? 'off'

  const contents = await Promise.all(
    projects.map(async (path) => ({ path, content: await readFile(path, 'utf8').catch(() => null) })),
  )

  return {
    path: projects[0] ?? '',
    rulesetHash: hashJson({ level, projects: contents }),
    async dispose() {},
  }
}
