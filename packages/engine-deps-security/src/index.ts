import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EngineError,
  compareStrings,
  hashJson,
  type Engine,
  type EngineAvailability,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import type { AdvisoryTable } from './advisory.ts'
import {
  LOCKFILES,
  LockfileParseError,
  UNSUPPORTED_LOCKFILES,
  manifestDependencies,
  parseLockfile,
  type LockfileKind,
} from './lockfile.ts'
import type { PackageManifest } from './scan.ts'
import { DEPS_SECURITY_RULES, type DepsSecurityRuleId } from './rules.ts'
import {
  INSTALL_COMMAND,
  MALICIOUS_FILE,
  VULNERABLE_FILE,
  advisorySnapshotDir,
  readSnapshotManifest,
  type SnapshotLocationOptions,
} from './snapshot.ts'

export {
  ADVISORY_SEVERITIES,
  buildAdvisoryTables,
  distillAdvisory,
  type AdvisoryKind,
  type AdvisoryRange,
  type AdvisoryRecord,
  type AdvisorySeverity,
  type AdvisoryTable,
  type AdvisoryTables,
  type DistilledAffected,
} from './advisory.ts'
// `advisoryAffects` and `scanDependencies` are deliberately absent from this barrel. Both reach
// `./match.ts` and therefore `semver`, ~6 ms of module load, which `execute()`'s dynamic import below
// keeps out of every run that never scans a lockfile — including `sgate rules why`, a fully-cached
// `sgate check`, and every machine with no advisory snapshot installed, where `availability()` means
// this engine never runs at all. A static re-export here would put `semver` straight back in the
// entry graph and undo it. Both remain importable from their own modules, which is how their tests
// reach them.
export {
  LOCKFILES,
  LockfileParseError,
  UNSUPPORTED_LOCKFILES,
  manifestDependencies,
  parseLockfile,
  splitPnpmKey,
  type LockfileKind,
  type ManifestDependency,
  type ParsedLockfile,
  type ResolvedPackage,
} from './lockfile.ts'
export { findDependencyRange } from './manifest.ts'
export type { PackageManifest, ScanInput } from './scan.ts'
export {
  DEPS_SECURITY_RULES,
  DEPS_SECURITY_RULE_IDS,
  advisoryUrl,
  conceptForEngineRuleId,
  type DepsSecurityRuleId,
} from './rules.ts'
export {
  AdvisoryInstallError,
  OSV_NPM_ARCHIVE_URL,
  installAdvisorySnapshot,
  writeAdvisorySnapshot,
  type InstallAdvisoriesOptions,
  type InstallAdvisoriesResult,
} from './install.ts'
export {
  CACHE_DIR_ENV,
  INSTALL_COMMAND,
  MALICIOUS_FILE,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_MANIFEST_FILENAME,
  SNAPSHOT_PATH_ENV,
  STALE_AFTER_DAYS,
  VULNERABLE_FILE,
  advisorySnapshotDir,
  describeStaleness,
  readSnapshotManifest,
  snapshotAgeInDays,
  stalenessBand,
  type AdvisorySnapshot,
  type SnapshotManifest,
  type StalenessBand,
} from './snapshot.ts'
export { ZipFormatError, readZipEntries, type ZipEntry } from './zip.ts'

export type CreateDepsSecurityEngineOptions = SnapshotLocationOptions & {
  now?: Date
}

/**
 * Dependency security: the eighth engine, the second optional one, and the only one whose data is
 * inherently remote — which is the whole design problem it exists to answer.
 *
 * **`sgate check` never reaches the network, and `npm audit` is why that is not merely a preference.**
 * Measured against a tree with 34 real advisories, `npm audit --offline` exits 0, writes nothing to
 * stderr, and reports `"total": 0`. A wrapper around it would therefore report an air-gapped CI image
 * clean — a silent, total false negative from a security check, which is worse than having no check
 * at all because the tool implies it looked. `pnpm audit` fails loudly instead, but still cannot run
 * without egress.
 *
 * So the data comes from a local snapshot that `sgate engines install advisories` populates, and
 * `availability()` is a `stat` on it: absent means a reported coverage gap naming that command, the
 * same shape actionlint uses. The snapshot is distilled from OSV's npm export, and matching a
 * lockfile against it reproduces `npm audit` exactly — 682 advisories across six real lockfiles and
 * 10,671 resolved packages, zero divergence in either direction (spec §13.7).
 *
 * **Nothing here is bundled with a floor of data.** A snapshot shipped in the package would age with
 * the release cadence, and npm publishes roughly 240 new advisories a month, so within a quarter it
 * would be quietly missing around a thousand of them — `npm audit --offline`'s failure again, just
 * slower. An engine that is loudly absent is safer than one that is quietly out of date, and a
 * snapshot that *is* installed reports its own age as a finding once it passes a week old.
 */
export function createDepsSecurityEngine(options: CreateDepsSecurityEngineOptions = {}): Engine {
  const directory = advisorySnapshotDir(options)

  return {
    id: 'deps-security',

    capabilities: {
      // `json` for `package.json` and `package-lock.json`, `yaml` for `pnpm-lock.yaml`. Claiming
      // `yaml` pulls every workflow and CI file in the repository into this engine's assigned set,
      // which knip explicitly refused to accept for its own workspace discovery — the difference is
      // that a pnpm lockfile *is* the input here rather than a hint about one, and there is no finer
      // language than `yaml` to ask for. The cost is paid in cache invalidation: an unrelated YAML
      // edit re-runs a scan that takes single-digit milliseconds.
      languages: ['json', 'yaml'],
      granularity: 'project',
      provides: [],
      // There is a real fix — raise a version range — but it is a lockfile edit whose correctness
      // depends on the whole resolution graph, not a text replacement. Claiming the capability would
      // let `sgate fix` promise edits this adapter cannot produce.
      fixes: false,
    },

    /**
     * Filesystem only, as `Engine.availability` requires: one `existsSync` and one small JSON read,
     * no spawn, no network, and deliberately not a load of the 16 MB malicious-package table —
     * `sgate rules why` calls this, and an explain-only command must not do the engine's work.
     *
     * A snapshot that is merely *old* still reports available. Refusing to run on age would turn a
     * date into a build failure with no commit behind it, and would lose every finding the snapshot
     * can still make; the age is reported as a finding instead, escalating as it grows.
     */
    async availability(): Promise<EngineAvailability> {
      const manifest = readSnapshotManifest(directory)
      if (manifest !== undefined) return { available: true }
      return {
        available: false,
        reason: `no advisory snapshot in ${directory}; dependency vulnerabilities were not checked`,
        install: INSTALL_COMMAND,
      }
    },

    async version() {
      const manifest = readSnapshotManifest(directory)
      if (manifest === undefined) throw new EngineError('deps-security', `no advisory snapshot in ${directory}`)
      // The snapshot date, not this package's version: two runs of identical code against snapshots a
      // month apart are not the same check, and a cache key that could not tell them apart would
      // serve stale findings after a refresh.
      return `osv-npm@${manifest.fetchedAt.slice(0, 10)}+${manifest.digest.slice(0, 12)}`
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext): Promise<EngineConfigHandle> {
      // This engine's rules take no options (see `rules.ts` — the vocabulary is three fixed ids), so
      // only the level half of each setting is read and `rulesetHash` need not fold the rest in.
      const enabled = [...selection.entries()]
        .filter(([, [level]]) => level !== 'off')
        .map(([rule]) => rule)
        .sort(compareStrings)
      // The caller owns `tmpDir` but does not guarantee it exists — the same `mkdir` every other
      // adapter opens with.
      await mkdir(context.tmpDir, { recursive: true })
      const path = join(context.tmpDir, 'deps-security.json')
      const payload = { rules: enabled }
      await writeFile(path, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })

      return {
        path,
        rulesetHash: hashJson(payload),
        ruleCount: enabled.length,
        async dispose() {
          // Left to the caller's `tmpDir` teardown, like every other adapter's ephemeral config.
        },
      }
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute({ batch, handle, context, signal, directory, ...(options.now === undefined ? {} : { now: options.now }) })
    },
  }
}

type ExecuteInput = {
  readonly batch: FileBatch
  readonly handle: EngineConfigHandle
  readonly context: RunContext
  readonly signal: AbortSignal
  readonly directory: string
  readonly now?: Date
}

async function* execute(input: ExecuteInput): AsyncIterable<RawDiagnostic> {
  const enabled = await readEnabledRules(input.handle.path)
  if (enabled.size === 0) return

  const manifest = readSnapshotManifest(input.directory)
  if (manifest === undefined) {
    // Unreachable through the orchestrator, which never runs an engine its availability probe
    // reported absent — but a snapshot removed between the probe and the run would land here, and
    // yielding nothing would be indistinguishable from a clean repository.
    throw new EngineError('deps-security', `the advisory snapshot in ${input.directory} disappeared mid-run`)
  }

  const manifests = await readManifests(input.batch, input.context.rootDir)
  const found = findLockfile(input.context.rootDir)
  if (found === undefined) {
    yield* noLockfile(input, enabled, manifests)
    return
  }

  const source = await readFile(join(input.context.rootDir, found.file), 'utf8')
  let parsed
  try {
    parsed = parseLockfile(found.kind, source)
  } catch (error) {
    if (error instanceof LockfileParseError) throw new EngineError('deps-security', `${found.file}: ${error.message}`, { cause: error })
    throw error
  }
  input.signal.throwIfAborted()

  const [vulnerable, malicious] = await Promise.all([
    readTable(input.directory, VULNERABLE_FILE),
    enabled.has('malware') ? readTable(input.directory, MALICIOUS_FILE) : Promise.resolve({}),
  ])

  // Loaded here rather than at the top of the module: this is the first point at which a scan is
  // certainly going to happen — the rules are enabled, the snapshot is present and a readable lockfile
  // has already been parsed — so `semver` is paid for only by runs that use it. See the note beside
  // this module's export list.
  const { scanDependencies } = await import('./scan.ts')
  yield* scanDependencies({
    lockfile: found,
    parsed,
    manifests,
    vulnerable,
    malicious,
    snapshot: manifest,
    enabled,
    unsupportedLockfiles: findUnsupportedLockfiles(input.context.rootDir),
    ...(input.now === undefined ? {} : { now: input.now }),
  })
}

/**
 * Reported rather than silent, and reported even though it is not a defect in the repository: a run
 * that examined no lockfile has checked nothing, and the one outcome this engine may never produce
 * is the appearance of a clean bill of health it did not earn.
 *
 * **Unless there is nothing to have missed.** A repository whose manifests declare no dependencies at
 * all has no dependency tree for a lockfile to pin, so announcing that none was read would be a
 * warning with no action behind it on every such repository — and a coverage gap that fires when
 * coverage is complete is how a gap line stops being read.
 *
 * @yields the single coverage-gap diagnostic, when there is one to report.
 */
function* noLockfile(
  input: ExecuteInput,
  enabled: ReadonlySet<DepsSecurityRuleId>,
  manifests: readonly PackageManifest[],
): Generator<RawDiagnostic> {
  if (!enabled.has('coverage-gap')) return
  if (!manifests.some((manifest) => manifestDependencies(manifest.source).length > 0)) return

  const unsupported = findUnsupportedLockfiles(input.context.rootDir)
  const [first] = unsupported
  yield {
    engineRuleId: 'coverage-gap',
    message:
      first === undefined
        ? 'No lockfile was found, so no dependency was checked against the advisory database. Dependency versions are only knowable from a lockfile.'
        : `${first.file} is a ${first.manager} lockfile, which this engine cannot read — no dependency was checked against the advisory database.`,
    severity: 'warning',
    file: first?.file ?? manifests[0]?.file ?? 'package.json',
    range: { start: 0, end: 0 },
    help: `Only npm (\`${LOCKFILES.npm.join('`, `')}\`) and pnpm (\`${LOCKFILES.pnpm.join('`, `')}\`) lockfiles are read today.`,
  }
}

function findLockfile(rootDir: string): { readonly file: string; readonly kind: LockfileKind } | undefined {
  for (const kind of ['npm', 'pnpm'] as const) {
    for (const file of LOCKFILES[kind]) {
      if (existsSync(join(rootDir, file))) return { file, kind }
    }
  }
  return undefined
}

function findUnsupportedLockfiles(rootDir: string): readonly { readonly file: string; readonly manager: string }[] {
  return Object.entries(UNSUPPORTED_LOCKFILES)
    .filter(([file]) => existsSync(join(rootDir, file)))
    .map(([file, manager]) => ({ file, manager }))
}

/**
 * Manifests come from the assigned file list rather than a directory walk, so `ignore` globs and the
 * inventory's own exclusions apply — a project engine picks its own files and would otherwise report
 * on directories the user excluded, which is the defect the knip adapter records having had.
 */
async function readManifests(batch: FileBatch, rootDir: string): Promise<readonly PackageManifest[]> {
  const manifests: PackageManifest[] = []
  for (const file of batch.files) {
    if (!isManifest(file.path)) continue
    manifests.push({ file: file.path, source: await readFile(join(rootDir, file.path), 'utf8') })
  }
  // Shallowest first, so a finding about a root dependency anchors to the root manifest rather than
  // to whichever workspace happened to be listed earliest.
  return manifests.sort((left, right) => depthOf(left.file) - depthOf(right.file) || compareStrings(left.file, right.file))
}

function isManifest(path: string): boolean {
  return path === 'package.json' || path.endsWith('/package.json')
}

function depthOf(path: string): number {
  return path.split('/').length
}

async function readEnabledRules(path: string): Promise<ReadonlySet<DepsSecurityRuleId>> {
  const payload = JSON.parse(await readFile(path, 'utf8')) as { rules?: readonly string[] }
  const known = new Set(Object.keys(DEPS_SECURITY_RULES))
  return new Set((payload.rules ?? []).filter((rule): rule is DepsSecurityRuleId => known.has(rule)))
}

async function readTable(directory: string, file: string): Promise<AdvisoryTable> {
  try {
    return JSON.parse(await readFile(join(directory, file), 'utf8')) as AdvisoryTable
  } catch (error) {
    throw new EngineError('deps-security', `could not read ${join(directory, file)}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}
