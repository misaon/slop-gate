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

export function createDepsSecurityEngine(options: CreateDepsSecurityEngineOptions = {}): Engine {
  const directory = advisorySnapshotDir(options)

  return {
    id: 'deps-security',

    capabilities: {
      languages: ['json', 'yaml'],
      granularity: 'project',
      provides: [],
      fixes: false,
    },

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
      return `osv-npm@${manifest.fetchedAt.slice(0, 10)}+${manifest.digest.slice(0, 12)}`
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext): Promise<EngineConfigHandle> {
      const enabled = [...selection.entries()]
        .filter(([, [level]]) => level !== 'off')
        .map(([rule]) => rule)
        .sort(compareStrings)
      await mkdir(context.tmpDir, { recursive: true })
      const path = join(context.tmpDir, 'deps-security.json')
      const payload = { rules: enabled }
      await writeFile(path, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })

      return {
        path,
        rulesetHash: hashJson(payload),
        ruleCount: enabled.length,
        async dispose() {
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

async function readManifests(batch: FileBatch, rootDir: string): Promise<readonly PackageManifest[]> {
  const manifests: PackageManifest[] = []
  for (const file of batch.files) {
    if (!isManifest(file.path)) continue
    manifests.push({ file: file.path, source: await readFile(join(rootDir, file.path), 'utf8') })
  }
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
