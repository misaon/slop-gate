import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareStrings,
  hashJson,
  settingValues,
  settingValuesFor,
  toPosix,
  type EngineSettings,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type InventoryFile,
  type RunContext,
} from '@misaon/slop-gate-core'
import { KNIP_ISSUE_TYPES, isSurfacedIssueType } from './issue-types.ts'

const ROOT_WORKSPACE = '.'

// A workspace-level `entry` **replaces** these rather than extending them, so one contributed glob
// would silently stop `src/index.ts` being an entry point — and the symptom is knip reporting
// *fewer* findings, which reads like an improvement. Every contribution is unioned onto these.
const KNIP_DEFAULT_ENTRY: readonly string[] = [
  '{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!',
  'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!',
]

const IGNORE_DEPENDENCIES = 'ignoreDependencies'
const ENTRY = 'entry'
const VITEPRESS_ENTRY = 'vitepress.entry'

export type MaterializeKnipConfigOptions = {
  configFile?: string
  ignore?: readonly string[]
}

export function synthesizeKnipWorkspaces(files: readonly InventoryFile[]): string[] {
  const dirs = new Set<string>()
  for (const file of files) {
    const path = toPosix(file.path)
    const slash = path.lastIndexOf('/')
    if (path.slice(slash + 1) !== 'package.json') continue
    dirs.add(slash === -1 ? ROOT_WORKSPACE : path.slice(0, slash))
  }
  dirs.delete(ROOT_WORKSPACE)
  return [ROOT_WORKSPACE, ...[...dirs].sort(compareStrings)]
}

export async function materializeKnipConfig(
  selection: EngineRuleSelection,
  context: RunContext,
  options: MaterializeKnipConfigOptions,
): Promise<EngineConfigHandle> {
  const include = [...selection]
    .filter(([issueType, [level]]) => level !== 'off' && isSurfacedIssueType(issueType))
    .map(([issueType]) => issueType)
    .sort(compareStrings)

  const included = new Set(include)
  const exclude = KNIP_ISSUE_TYPES.filter((type) => !included.has(type)).sort(compareStrings)
  const ignoreDependencies = settingValues(context.adjustments ?? [], IGNORE_DEPENDENCIES)
  const config = {
    include,
    exclude,
    ignore: buildIgnore(options),
    ...(ignoreDependencies.length === 0 ? {} : { ignoreDependencies: [...ignoreDependencies] }),
  }

  const rulesetHash = hashJson(config)
  await mkdir(context.tmpDir, { recursive: true })
  const path = join(context.tmpDir, `knip.${rulesetHash.slice(0, 12)}.json`)
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')

  return {
    path,
    rulesetHash,
    ruleCount: include.length,
    async dispose() {
      await rm(path, { force: true })
    },
  }
}

function buildIgnore(options: MaterializeKnipConfigOptions): string[] {
  const ignore = new Set(['.slop-gate/**'])
  for (const pattern of options.ignore ?? []) ignore.add(toPosix(pattern))
  if (options.configFile !== undefined) ignore.add(toPosix(options.configFile))
  return [...ignore].sort(compareStrings)
}

export async function mergeWorkspacesIntoConfig(
  path: string,
  workspaces: readonly string[],
  adjustments: EngineSettings = [],
): Promise<{ include: string[] }> {
  const config = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  config['workspaces'] = Object.fromEntries(workspaces.map((dir) => [dir, buildWorkspaceConfig(dir, adjustments)]))
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')
  return { include: (config['include'] as string[] | undefined) ?? [] }
}

function buildWorkspaceConfig(dir: string, adjustments: EngineSettings): Record<string, unknown> {
  const workspace = dir === ROOT_WORKSPACE ? '' : dir
  const config: Record<string, unknown> = {}

  const entry = settingValuesFor(adjustments, ENTRY, workspace)
  if (entry.length > 0) config['entry'] = [...KNIP_DEFAULT_ENTRY, ...entry]

  const vitepress = settingValuesFor(adjustments, VITEPRESS_ENTRY, workspace)
  if (vitepress.length > 0) config['vitepress'] = { entry: [...vitepress] }

  return config
}
