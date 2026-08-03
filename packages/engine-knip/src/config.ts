import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareStrings,
  hashJson,
  settingValues,
  settingValuesFor,
  toPosix,
  type EngineAdjustments,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type InventoryFile,
  type RunContext,
} from '@misaon/slop-gate-core'
import { KNIP_ISSUE_TYPES, isSurfacedIssueType } from './issue-types.ts'

/** knip's own name for "the repository root workspace" (`ROOT_WORKSPACE_NAME`, `knip/dist/constants.js`). */
const ROOT_WORKSPACE = '.'

/**
 * knip's own default `entry` patterns for a workspace, restated.
 *
 * **A workspace-level `entry` replaces these; it does not extend them.** Read directly out of
 * `ConfigurationChief.getConfigForWorkspace` in knip 6.31.0:
 * `workspaceConfig.entry ? arrayify(workspaceConfig.entry) : baseConfig.entry`. So the moment a
 * framework profile contributes one migrations glob, `src/index.ts` silently stops being an entry
 * point — and the symptom is knip reporting *fewer* findings, which reads like an improvement. Every
 * contribution is therefore unioned onto these, and `index.test.ts` pins the consequence behaviourally
 * (a repository with a contributed entry must still resolve its own `src/index.ts`) rather than only
 * pinning these strings, which is what would actually catch knip changing its defaults.
 *
 * The `!` suffix is knip's production-mode marker, carried over verbatim from its own defaults.
 */
const KNIP_DEFAULT_ENTRY: readonly string[] = [
  '{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!',
  'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!',
]

/**
 * The knip settings a framework profile may contribute (spec §23.2). `ignoreDependencies` is written
 * once at the top level; the other two are per-workspace, which is why they are merged in `run()`
 * alongside the workspace map rather than in `materializeConfig`.
 */
const IGNORE_DEPENDENCIES = 'ignoreDependencies'
const ENTRY = 'entry'
const VITEPRESS_ENTRY = 'vitepress.entry'

export type MaterializeKnipConfigOptions = {
  /** Repo-relative path of the slop-gate config file, when one was found. See `buildIgnore`. */
  configFile?: string
  /**
   * The user's own `ignore` globs from `slop-gate.config.ts`, verbatim. See `buildIgnore` for why a
   * project-granularity engine has to be told these explicitly rather than inheriting them.
   */
  ignore?: readonly string[]
}

/**
 * The adapter's whole reason for existing, and the one thing a bare `knip` run cannot do for itself:
 * derive knip's workspace map from **slop-gate's own inventory** rather than from whatever the
 * repository happened to declare.
 *
 * knip discovers workspaces the way a package manager does — `package.json#workspaces`,
 * `pnpm-workspace.yaml`, and so on. Measured directly (see spec §13.2): a repository with a nested
 * `tech-docs/package.json` but **no** workspace declaration anywhere makes knip see exactly one
 * package, never reach the nested one from the root entry graph, and never activate the plugins that
 * nested package's own dependencies would have enabled. slop-gate's inventory (spec §7) has already
 * listed every file in the repository by this point, nested manifests included, so the set of real
 * packages is simply *known* — no declaration required, no filesystem walk of our own (spec §7:
 * "Engines never walk the filesystem themselves; they receive explicit file lists").
 *
 * Verified against a fixture reproducing that shape: feeding knip this synthesized map produces
 * **byte-identical** output to the same repository with the workspaces properly declared in its root
 * `package.json` — i.e. the synthesis is not an approximation of the declared case, it *is* the
 * declared case. Also verified: an entry naming a directory that turns out to hold no `package.json`
 * is silently ignored by knip rather than being an error, so a stale or odd inventory entry degrades
 * to the bare behaviour instead of failing the run.
 *
 * @returns Repo-relative POSIX directories, `'.'` first and always present (knip analyses the root
 * package whether or not it is listed; listing it keeps the emitted config self-describing), the
 * rest in `compareStrings` order so the same inventory always produces the same bytes.
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
 * The counterpart to `materializeOxlintConfig` — same shape of job, one structural difference worth
 * naming: **a level cannot be expressed here at all.** knip has no per-issue-type severity; its
 * `include`/`exclude` are pure on/off. Levels are therefore consumed entirely upstream (a level of
 * `off` drops the type from `include`) and never reach knip, which is why `rulesetHash` deliberately
 * folds in only the *set* of included types — an `error`→`warn` change must not invalidate a whole
 * project cache entry for a difference knip cannot act on. Severity is reapplied downstream by
 * `normalizeDiagnostics` from the resolved ruleset, exactly as it is for every other engine. The same
 * reasoning covers the option half of a setting: knip's issue types take none, so they are dropped
 * here and correctly absent from the hash (see `EngineRuleSetting`).
 *
 * `exclude` is written as the complement of `include` rather than left empty. knip's defaults report
 * fourteen of its seventeen issue types, so an `include` that silently failed to apply would leak
 * whole categories nobody elected — the same class of defect as `materializeOxlintConfig`'s
 * `ALL_CATEGORIES_OFF`, and stated the same way: explicitly, not by trusting a default.
 *
 * **This config is deliberately incomplete when it is written.** The workspace map
 * (`synthesizeKnipWorkspaces`) is not available here: `Engine.materializeConfig` receives the elected
 * selection and a `RunContext`, never the inventory, so the file gets its `workspaces` key from
 * `mergeWorkspacesIntoConfig` in `run()` instead — see that function, and the M2 follow-up it is
 * recorded under.
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
  // like any other part of the ruleset half — unlike the workspace map, whose absence from the hash
  // `mergeWorkspacesIntoConfig` explains.
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
 * Two false positives slop-gate can remove from knip's own output because it knows something knip
 * structurally cannot:
 *
 * - **`.slop-gate/**`** is our cache and temp directory. `sgate init` gitignores it, but `check` must
 *   never depend on `init` having run — the same rule the M0 follow-ups recorded after `sgate check`
 *   was found inventorying its own cache.
 * - **The slop-gate config file itself.** Measured on both repositories: knip reports
 *   `slop-gate.config.ts` as an unused file, because nothing imports it — it is loaded by path, at
 *   runtime, by us. knip has plugins for exactly this class of file (eslint, vitest, prettier
 *   configs); it does not have one for slop-gate, and it never will. Ignoring it is a narrower, safer
 *   fix than declaring it an `entry`, which in knip's config *replaces* the workspace's default entry
 *   patterns rather than adding to them — a strictly worse trade for one file.
 *
 * And the user's own `ignore` globs, which a **file**-granularity engine never has to be told: core
 * filters the inventory and hands oxlint the surviving list. A project-granularity engine derives its
 * own file set from its own config, so it never sees that filtering — measured on this repository,
 * whose config ignores both of its fixture trees and which still produced 19 `dead-code.unused-file`
 * findings, every one inside a directory the user had explicitly excluded and every one therefore a
 * false positive slop-gate itself manufactured. That was the single largest false-positive class knip
 * had here, and it was never knip's fault.
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
 * Adds the synthesized workspace map to an already-materialised config, in place.
 *
 * A read-modify-write of our own temp file, not a second config: the two halves of knip's
 * configuration become available at two different moments in the engine lifecycle — the elected
 * ruleset at `materializeConfig`, the inventory only at `run` — and the file is the handoff between
 * them. `materializeConfig` stays the sole owner of the ruleset half (and of `rulesetHash`, which
 * covers exactly that half), `run` the sole owner of the inventory half, and `dispose` the sole owner
 * of deletion.
 *
 * The workspace map is correctly absent from `rulesetHash`: a project-granularity cache key already
 * folds in every assigned file's path *and* content hash (`deriveProjectResultKey`), so adding,
 * removing or editing any `package.json` changes the key regardless — which is precisely why knip's
 * engine capabilities claim `json` (see `createKnipEngine`).
 *
 * @returns The `include` list `materializeConfig` wrote. `run()` needs the elected issue types to
 * check what knip actually reported against what was elected (`assertReportedTypes`, parse.ts), and
 * the config file is the only place that list survives between the two calls — `EngineConfigHandle`
 * carries a `ruleCount` but not the names behind it.
 */
export async function mergeWorkspacesIntoConfig(
  path: string,
  workspaces: readonly string[],
  adjustments: EngineAdjustments = [],
): Promise<{ include: string[] }> {
  const config = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  config['workspaces'] = Object.fromEntries(workspaces.map((dir) => [dir, buildWorkspaceConfig(dir, adjustments)]))
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')
  return { include: (config['include'] as string[] | undefined) ?? [] }
}

/**
 * One workspace's entry in knip's `workspaces` map: `{}` unless a framework profile contributed
 * something scoped to it (spec §23.2).
 *
 * Two settings, and the difference between them is knip's, not ours. `entry` is the *workspace's*
 * entry list and replaces knip's defaults, so `KNIP_DEFAULT_ENTRY` is unioned in — see that constant
 * for the measurement, and for why getting this wrong would look like an improvement.
 * `vitepress.entry` is the *plugin's* entry list and replaces only the VitePress plugin's own three
 * patterns, which the profile already restates under the detected site root, so it is written as-is.
 *
 * `workspaces` is keyed by knip's names, where the root is `'.'`; adjustments are keyed by
 * slop-gate's, where the root is `''`. That one translation is the only thing this function knows
 * about either vocabulary.
 */
function buildWorkspaceConfig(dir: string, adjustments: EngineAdjustments): Record<string, unknown> {
  const workspace = dir === ROOT_WORKSPACE ? '' : dir
  const config: Record<string, unknown> = {}

  const entry = settingValuesFor(adjustments, ENTRY, workspace)
  if (entry.length > 0) config['entry'] = [...KNIP_DEFAULT_ENTRY, ...entry]

  const vitepress = settingValuesFor(adjustments, VITEPRESS_ENTRY, workspace)
  if (vitepress.length > 0) config['vitepress'] = { entry: [...vitepress] }

  return config
}
