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
// An alias knip's plugins do not know is an unresolved import, and every export behind it then looks
// dead. `ignoreUnresolved` is for aliases resolving inside a framework's installed package, where
// there is no repo-relative target. `paths` values are `from\u0000to`, the setting being a flat list.
const PATHS = 'paths'
const IGNORE_UNRESOLVED = 'ignoreUnresolved'

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
  const paths = settingValues(context.adjustments ?? [], PATHS)
  const ignoreUnresolved = settingValues(context.adjustments ?? [], IGNORE_UNRESOLVED)
  const config = {
    include,
    exclude,
    ignore: buildIgnore(options),
    ...(ignoreDependencies.length === 0 ? {} : { ignoreDependencies: [...ignoreDependencies] }),
    ...(paths.length === 0 ? {} : { paths: Object.fromEntries(paths.map(splitPathMapping)) }),
    ...(ignoreUnresolved.length === 0 ? {} : { ignoreUnresolved: [...ignoreUnresolved] }),
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
  // A framework may name a workspace the inventory cannot: a Nuxt layer has its own `app/` and
  // `server/` but no `package.json`, so workspace synthesis never sees it. The boundary, not the
  // globs, is what lets an entry glob reach inside — docs/measurements.md#framework-profile-gaps.
  const declared = [
    ...new Set([
      ...workspaces,
      ...adjustments
        .filter((setting) => setting.key === ENTRY && setting.workspace !== '')
        .map((setting) => setting.workspace),
    ]),
  ].sort(compareStrings)
  config['workspaces'] = Object.fromEntries(
    [ROOT_WORKSPACE, ...declared.filter((dir) => dir !== ROOT_WORKSPACE)].map((dir) => [
      dir,
      buildWorkspaceConfig(dir, adjustments),
    ]),
  )
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

/** `from\u0000to` — one setting value, because a setting carries strings rather than pairs. */
function splitPathMapping(value: string): [string, string[]] {
  const [from, to] = value.split('\u0000')
  return [from ?? value, [to ?? value]]
}
