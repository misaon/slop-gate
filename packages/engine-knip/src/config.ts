import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareStrings,
  hashJson,
  toPosix,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type InventoryFile,
  type RunContext,
} from '@misaon/slop-gate-core'
import { KNIP_ISSUE_TYPES, isSurfacedIssueType } from './issue-types.ts'

/** knip's own name for "the repository root workspace" (`ROOT_WORKSPACE_NAME`, `knip/dist/constants.js`). */
const ROOT_WORKSPACE = '.'

export type MaterializeKnipConfigOptions = {
  /** Repo-relative path of the slop-gate config file, when one was found. See `buildIgnore`. */
  configFile?: string
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
 * `normalizeDiagnostics` from the resolved ruleset, exactly as it is for every other engine.
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
    .filter(([issueType, level]) => level !== 'off' && isSurfacedIssueType(issueType))
    .map(([issueType]) => issueType)
    .sort(compareStrings)

  const included = new Set(include)
  const exclude = KNIP_ISSUE_TYPES.filter((type) => !included.has(type)).sort(compareStrings)
  const config = { include, exclude, ignore: buildIgnore(options) }

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
 */
function buildIgnore(options: MaterializeKnipConfigOptions): string[] {
  const ignore = ['.slop-gate/**']
  if (options.configFile !== undefined) ignore.push(toPosix(options.configFile))
  return ignore
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
): Promise<{ include: string[] }> {
  const config = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  config['workspaces'] = Object.fromEntries(workspaces.map((dir) => [dir, {}]))
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')
  return { include: (config['include'] as string[] | undefined) ?? [] }
}
