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

/** knip's own name for "the repository root workspace" (`ROOT_WORKSPACE_NAME`, `knip/dist/constants.js`). */
const ROOT_WORKSPACE = '.'

/**
 * knip's own default `entry` patterns for a workspace, restated. **A workspace-level `entry` replaces
 * these; it does not extend them** — `ConfigurationChief.getConfigForWorkspace` in knip 6.31.0 reads
 * `workspaceConfig.entry ? arrayify(workspaceConfig.entry) : baseConfig.entry`. So one contributed
 * migrations glob silently stops `src/index.ts` being an entry point, and the symptom is knip reporting
 * *fewer* findings, which reads like an improvement. Every contribution is therefore unioned onto these.
 * The `!` suffix is knip's production-mode marker, verbatim from its own defaults.
 */
const KNIP_DEFAULT_ENTRY: readonly string[] = [
  '{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!',
  'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!',
]

/**
 * The knip settings a framework profile may contribute (spec §23.2). `ignoreDependencies` is written
 * once at the top level; the other two are per-workspace, hence merged in `run()` alongside the
 * workspace map rather than in `materializeConfig`.
 */
const IGNORE_DEPENDENCIES = 'ignoreDependencies'
const ENTRY = 'entry'
const VITEPRESS_ENTRY = 'vitepress.entry'

export type MaterializeKnipConfigOptions = {
  /** Repo-relative path of the slop-gate config file, when one was found. See `buildIgnore`. */
  configFile?: string
  /** The user's own `ignore` globs, verbatim. See `buildIgnore` for why this engine must be told them. */
  ignore?: readonly string[]
}

/**
 * Derives knip's workspace map from **slop-gate's own inventory** rather than from whatever the
 * repository happened to declare — the one thing a bare `knip` run cannot do for itself.
 *
 * knip discovers workspaces the way a package manager does: `package.json#workspaces`,
 * `pnpm-workspace.yaml`. Measured directly (spec §13.2): a repository with a nested
 * `tech-docs/package.json` but **no** workspace declaration anywhere makes knip see exactly one package,
 * never reach the nested one from the root entry graph, and never activate the plugins that nested
 * package's own dependencies would have enabled. The inventory (spec §7) has already listed every nested
 * manifest, so no declaration and no filesystem walk of our own is required ("Engines never walk the
 * filesystem themselves; they receive explicit file lists"). Verified on a fixture of that shape:
 * feeding knip the synthesized map produces **byte-identical** output to the same repository with its
 * workspaces properly declared, and an entry naming a directory that holds no `package.json` is
 * silently ignored rather than an error — so a stale inventory entry degrades to the bare behaviour
 * instead of failing the run. `'.'` comes first and is always present, the rest in `compareStrings`
 * order, so one inventory always produces the same bytes.
 */
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

/**
 * Translates the elected ruleset into knip's own selection vocabulary and writes it to a temp config.
 *
 * **A level cannot be expressed here at all**: knip has no per-issue-type severity, and its
 * `include`/`exclude` are pure on/off. Levels are consumed entirely upstream (a level of `off` drops the
 * type from `include`), which is why `rulesetHash` deliberately folds in only the *set* of included
 * types — an `error`→`warn` change must not invalidate a whole project cache entry for a difference knip
 * cannot act on. Same for options: knip's issue types take none, so they are dropped here and correctly
 * absent from the hash (see `EngineRuleSetting`). `exclude` is written as the complement of `include`
 * rather than left empty because knip's defaults report fourteen of its seventeen issue types, so an
 * `include` that silently failed to apply would leak whole categories nobody elected.
 *
 * **This config is deliberately incomplete when it is written.** `Engine.materializeConfig` receives the
 * elected selection and a `RunContext`, never the inventory, so the `workspaces` key is added later by
 * `mergeWorkspacesIntoConfig` in `run()`.
 */
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
  // Framework-contributed and already a sorted union (spec §23.3), so it folds into `rulesetHash`
  // deterministically without a sort of its own.
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

/**
 * Three classes of false positive slop-gate can remove from knip's own output, because it knows things
 * knip structurally cannot:
 *
 * - **`.slop-gate/**`** is our cache and temp directory. `sgate init` gitignores it, but `check` must
 *   never depend on `init` having run.
 * - **The slop-gate config file itself.** Measured on both repositories: knip reports
 *   `slop-gate.config.ts` as an unused file, because nothing imports it — we load it by path at runtime.
 *   Ignoring it is a narrower, safer fix than declaring it an `entry`, which in knip's config *replaces*
 *   the workspace's default entry patterns rather than adding to them.
 * - **The user's own `ignore` globs**, which a **file**-granularity engine never has to be told: core
 *   filters the inventory and hands oxlint the surviving list. A project-granularity engine derives its
 *   own file set from its own config and never sees that filtering — measured on this repository, whose
 *   config ignores both of its fixture trees, 19 `dead-code.unused-file` findings, every one inside a
 *   directory the user had explicitly excluded and every one therefore a false positive slop-gate itself
 *   manufactured. The largest false-positive class knip had here, and never knip's fault.
 *
 * Sorted and deduplicated so two configs that mean the same thing hash the same, and so `rulesetHash`
 * (and the result cache behind it) does not turn over when a user merely reorders their `ignore` list.
 */
function buildIgnore(options: MaterializeKnipConfigOptions): string[] {
  const ignore = new Set(['.slop-gate/**'])
  for (const pattern of options.ignore ?? []) ignore.add(toPosix(pattern))
  if (options.configFile !== undefined) ignore.add(toPosix(options.configFile))
  return [...ignore].sort(compareStrings)
}

/**
 * Adds the synthesized workspace map to an already-materialised config, in place — a read-modify-write of
 * our own temp file rather than a second config, because the two halves of knip's configuration become
 * available at two different moments in the engine lifecycle (the elected ruleset at `materializeConfig`,
 * the inventory only at `run`) and the file is the handoff between them.
 *
 * The workspace map is correctly absent from `rulesetHash`: a project-granularity cache key already
 * folds in every assigned file's path *and* content hash (`deriveProjectResultKey`), so adding, removing
 * or editing any `package.json` changes the key regardless — which is precisely why knip's engine
 * capabilities claim `json` (see `createKnipEngine`).
 *
 * Returns the `include` list `materializeConfig` wrote, because `run()` needs the elected issue types
 * for `assertReportedTypes` (parse.ts) and the config file is the only place that list survives between
 * the two calls — `EngineConfigHandle` carries a `ruleCount` but not the names behind it.
 */
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

/**
 * One workspace's entry in knip's `workspaces` map: `{}` unless a framework profile contributed
 * something scoped to it (spec §23.2). The difference between the two settings is knip's, not ours.
 * `entry` is the *workspace's* entry list and replaces knip's defaults, so `KNIP_DEFAULT_ENTRY` is
 * unioned in — see that constant. `vitepress.entry` is the *plugin's* entry list and replaces only the
 * VitePress plugin's own three patterns, which the profile already restates under the detected site root,
 * so it is written as-is. `workspaces` is keyed by knip's names, where the root is `'.'`; adjustments are
 * keyed by slop-gate's, where the root is `''`.
 */
function buildWorkspaceConfig(dir: string, adjustments: EngineSettings): Record<string, unknown> {
  const workspace = dir === ROOT_WORKSPACE ? '' : dir
  const config: Record<string, unknown> = {}

  const entry = settingValuesFor(adjustments, ENTRY, workspace)
  if (entry.length > 0) config['entry'] = [...KNIP_DEFAULT_ENTRY, ...entry]

  const vitepress = settingValuesFor(adjustments, VITEPRESS_ENTRY, workspace)
  if (vitepress.length > 0) config['vitepress'] = { entry: [...vitepress] }

  return config
}
