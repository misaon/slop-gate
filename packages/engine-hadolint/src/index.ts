import { execFile } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  EngineError,
  hashJson,
  type Engine,
  type EngineAvailability,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { parseHadolintOutput, readHadolintFindings } from './parse.ts'
import { HADOLINT_VERSION } from './release.ts'
import { HADOLINT_PATH_ENV, resolveHadolintBinary, type HadolintResolution } from './resolve-binary.ts'

export {
  HADOLINT_ASSETS,
  HADOLINT_CHECKSUMS,
  HADOLINT_RELEASE_URL,
  HADOLINT_VERSION,
  hadolintAsset,
} from './release.ts'
export { HadolintInstallError, installHadolint, type InstallHadolintResult } from './download.ts'
export { parseHadolintOutput, rangeOf, readHadolintFindings, type HadolintFinding } from './parse.ts'
export {
  EMBEDDED_SHELLCHECK_PREFIX,
  HADOLINT_RULES,
  HADOLINT_RULE_IDS,
  SOURCE_EXCLUSIONS,
  conceptOf,
  type HadolintRuleId,
} from './rules.ts'
export {
  CACHE_DIR_ENV,
  HADOLINT_PATH_ENV,
  hadolintBinaryName,
  hadolintCacheDir,
  resolveHadolintBinary,
  type HadolintResolution,
  type HadolintSource,
} from './resolve-binary.ts'

const run = promisify(execFile)

/** 0 = clean, 1 = findings. Anything above is a real failure (bad option, unreadable file). */
const MAX_FINDINGS_EXIT_CODE = 1

/**
 * The Dockerfile engine — hadolint, and the **second optional engine**, following actionlint's
 * availability-gated pattern rather than reinventing it.
 *
 * **Discovery order is `SLOP_GATE_HADOLINT_PATH`, then `PATH`, then our own cache.** A machine that
 * already has hadolint never downloads anything and never has its own installation shadowed.
 *
 * **Nothing on the check path reaches the network**, for the reason spec §13.5 records for actionlint:
 * `Engine.availability` is contractually filesystem-only, and availability is what decides whether a
 * first use ever happens, so "lazy" means "on explicit request" — `sgate engines install hadolint`
 * populates the cache, and until it does the run reports a coverage gap naming that command.
 *
 * **Six rules of roughly seventy, and the ratio is the point.** Over 275 Dockerfiles from 32
 * repositories hadolint produced 893 findings at 25% precision, with 68% of its output coming from
 * thirteen rules that had **zero** true positives. What ships is the concentrated remainder. Two
 * findings from that measurement are worth not rediscovering, and both are recorded at length in
 * `rules.ts` and `registry/exclusions.ts`: hadolint **cannot detect a missing `USER`** (a Dockerfile
 * with no `USER` at all is silent; `DL3002` fires only on an explicit `USER root`), and `DL3066`
 * actively fires on the correct fix — 69 findings, on `USER nobody`, `USER node`, `USER appuser`.
 *
 * **`-c` always points at our own ephemeral config**, so a `.hadolint.yaml` in the analysed repository
 * is never read (spec §13: users neither see nor maintain engine-native config files).
 *
 * **`--no-fail` is not passed.** Exit 1 means findings and is handled below; suppressing it would also
 * suppress the distinction between "findings" and "hadolint could not read the file".
 */
export function createHadolintEngine(options: { binaryPath?: string } = {}): Engine {
  // Keyed by the handle's `path`, exactly as the `schema` and `actionlint` adapters do it: hadolint
  // takes no ruleset we trust, so the elected selection has to reach `run` some other way.
  const selections = new Map<string, ReadonlySet<string>>()

  const resolution = (): HadolintResolution | undefined =>
    options.binaryPath === undefined ? resolveHadolintBinary() : { command: options.binaryPath, source: 'env' }

  const required = (): HadolintResolution => {
    const resolved = resolution()
    if (resolved === undefined) throw new EngineError('hadolint', unavailableReason())
    return resolved
  }

  return {
    id: 'hadolint',

    capabilities: {
      languages: ['dockerfile'],
      granularity: 'file',
      provides: [],
      // hadolint emits no fix data in any output format, and none of the shipped rules has a single
      // mechanical repair: which tag to pin a base image to and where `pipefail` belongs are both
      // decisions about intent.
      fixes: false,
    },

    async availability(): Promise<EngineAvailability> {
      // Filesystem only — a `PATH` walk and a few `stat` calls. No spawn, no network, nothing written.
      const resolved = resolution()
      if (resolved !== undefined) return { available: true }
      return { available: false, reason: unavailableReason(), install: 'sgate engines install hadolint' }
    },

    async version() {
      // The *resolved* binary's version, not `HADOLINT_VERSION`: a `PATH` hadolint is frequently a
      // different release from the pin, and since this string is part of every cache key, reporting
      // the pin would serve one binary's results after the machine started running another.
      const invocation = required()
      const { stdout } = await run(invocation.command, ['--version'], { encoding: 'utf8' })
      return stdout.trim().split('\n')[0]?.trim() ?? HADOLINT_VERSION
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      // The level is read even though the config file below carries no ruleset, because `parse.ts`
      // gates every finding on membership of `selections` — so that set *is* this engine's enablement
      // decision, and building it from the keys alone would make an `['off', …]` setting read as
      // enabled. Options are dropped and correspondingly absent from the hash: hadolint's rules take
      // none.
      const enabled = [...selection].filter(([, [level]]) => level !== 'off')
      const rulesetHash = hashJson(enabled.map(([rule, [level]]) => [rule, level]).sort())
      const path = join(context.tmpDir, `hadolint.${rulesetHash.slice(0, 12)}.yaml`)
      selections.set(path, new Set(enabled.map(([rule]) => rule)))
      await mkdir(context.tmpDir, { recursive: true })
      // The content is nearly inert; an *existing* file at a path we chose is the point. Without `-c`,
      // hadolint discovers `.hadolint.yaml` in the analysed repository and silently changes its own
      // behaviour, so a run would stop matching what `sgate rules why` says it does.
      await writeFile(
        path,
        ['# Generated by slop-gate. Do not edit; it is deleted when the run ends.', 'failure-threshold: none', ''].join('\n'),
        'utf8',
      )
      return {
        path,
        rulesetHash,
        // Deliberately absent, as on actionlint and tsc: hadolint reports no count of the rules it
        // loaded, so there is no number to assert a selection against. Selection is enforced in
        // `parse.ts` instead.
        async dispose() {
          selections.delete(path)
        },
      } satisfies EngineConfigHandle
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal, selections.get(handle.path) ?? new Set())
    },
  }
}

function unavailableReason(): string {
  return `hadolint was not found on PATH, in the slop-gate cache, or at ${HADOLINT_PATH_ENV}`
}

async function* execute(
  invocation: HadolintResolution,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
  selected: ReadonlySet<string>,
): AsyncIterable<RawDiagnostic> {
  // hadolint with no file arguments reads a Dockerfile from stdin and blocks forever on a pipe that
  // never closes. An empty batch must therefore return rather than spawn.
  if (batch.files.length === 0) return

  // Absolute paths: hadolint echoes back what it was handed, and a batch can span directories, so
  // relative names would be ambiguous once the output is parsed. `parse.ts` strips the prefix again.
  const args = ['-f', 'json', '--no-color', '-c', handle.path, ...batch.files.map((file) => join(context.rootDir, file.path))]

  let stdout: string
  try {
    ;({ stdout } = await run(invocation.command, args, {
      cwd: context.rootDir,
      signal,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
    }))
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string }
    if (typeof failure.code === 'number' && failure.code <= MAX_FINDINGS_EXIT_CODE) {
      stdout = failure.stdout ?? ''
    } else {
      throw new EngineError('hadolint', `hadolint failed: ${failure.stderr?.trim() || String(failure.code)}`, { cause: error })
    }
  }

  const findings = readHadolintFindings(stdout)
  const prefixes = await absolutePrefixes(context)

  // Every file that produced a finding is read up front so `readSource` can stay synchronous: both
  // `rangeOf` and the `DL3025` source exclusion need the text.
  const sources = new Map<string, string | undefined>()
  for (const finding of findings) {
    const file = relativize(finding.file, prefixes)
    if (file === '' || sources.has(file)) continue
    try {
      sources.set(file, await readFile(join(context.rootDir, file), 'utf8'))
    } catch {
      // The inventory listed this file, so it existed when the run started. One removed mid-run is not
      // a finding about the repository; the diagnostic still reports, at the top of the file.
      sources.set(file, undefined)
    }
  }

  yield* parseHadolintOutput(findings, {
    absolutePrefixes: prefixes,
    enabled: (rule) => selected.has(rule),
    readSource: (file) => sources.get(file),
  })
}

function relativize(file: string, prefixes: readonly string[]): string {
  const posix = file.replaceAll('\\', '/')
  for (const prefix of [...prefixes].filter((p) => p !== '').sort((a, b) => b.length - a.length)) {
    const withSlash = prefix.replaceAll('\\', '/').replace(/\/?$/, '/')
    if (posix.startsWith(withSlash)) return posix.slice(withSlash.length)
  }
  return posix
}

async function absolutePrefixes(context: RunContext): Promise<readonly string[]> {
  const prefixes = [context.rootDir, context.tmpDir]
  // macOS resolves `/tmp` to `/private/tmp`, which every test on that platform hits.
  for (const path of [context.rootDir, context.tmpDir]) {
    try {
      prefixes.push(await realpath(path))
    } catch {
      // A path that cannot be resolved cannot appear in output either.
    }
  }
  return prefixes
}
