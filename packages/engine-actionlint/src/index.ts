import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  absolutePrefixes,
  EngineError,
  hashJson,
  runEngineTool,
  toolVersion,
  type Engine,
  type EngineAvailability,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { parseActionlintOutput, readActionlintErrors } from './parse.ts'
import { ACTIONLINT_PATH_ENV, resolveActionlintBinary, type ActionlintResolution } from './resolve-binary.ts'

export {
  ACTIONLINT_ASSETS,
  ACTIONLINT_CHECKSUMS,
  ACTIONLINT_RELEASE_URL,
  ACTIONLINT_VERSION,
  actionlintAsset,
} from './release.ts'
export { ActionlintInstallError, extractTarGzEntry, installActionlint, type InstallActionlintResult } from './install.ts'
export { parseActionlintOutput, rangeFromLineColumn, readActionlintErrors, sanitize, type ActionlintError } from './parse.ts'
export {
  ACTIONLINT_RULES,
  ACTIONLINT_RULE_IDS,
  DISABLED_INTEGRATION_RULES,
  MESSAGE_EXCLUSIONS,
  MESSAGE_REWRITES,
  conceptForEngineRuleId,
  type ActionlintRuleId,
} from './rules.ts'
export {
  ACTIONLINT_PATH_ENV,
  CACHE_DIR_ENV,
  actionlintBinaryName,
  actionlintCacheDir,
  resolveActionlintBinary,
  type ActionlintResolution,
  type ActionlintSource,
} from './resolve-binary.ts'

/** 0 = clean, 1 = findings. 2 (bad option) and 3 (fatal) are real failures. Read off `command.go` in 1.7.12. */
const MAX_FINDINGS_EXIT_CODE = 1

/**
 * The GitHub Actions workflow engine, and the first **optional** adapter: elected only where the
 * binary is present, a reported coverage gap where it is not.
 *
 * **Nothing on the check path reaches the network.** D3 asks for a lazy download "on first use", but
 * `Engine.availability` must touch the filesystem and nothing else — and availability is *what
 * decides whether a first use ever happens*, so "lazy" becomes "on explicit request": `sgate engines
 * install actionlint` populates the cache, and until it does the run reports a coverage gap naming
 * that command. Claiming availability whenever a download *could* succeed would make `sgate check`
 * fetch a binary mid-run, turn an air-gapped CI image into an engine error rather than a clean gap,
 * and let `--require-engines` pass with no actionlint installed. Recorded in spec §13.5.
 *
 * **`-shellcheck= -pyflakes=` on every invocation.** Both default to the bare command name, so
 * actionlint runs those tools wherever they happen to exist and says nothing where they do not — a
 * rule that fires on a laptop and not in CI depending on what Homebrew installed. Emptied, this
 * engine's output is a function of actionlint's own version and nothing else; shellcheck belongs here
 * as its own engine with its own registry entries and `availability()`, not smuggled in through a
 * back door. `parse.ts` fails the run loudly if a finding under either kind appears anyway.
 *
 * **`-config-file` always points at our own ephemeral config**, so `.github/actionlint.yaml` in the
 * analysed repository is never read (spec §13). Over the 403-workflow corpus, honouring each
 * repository's own config changes only `runner-label` and one `expression` message class, both
 * already excluded here.
 */
export function createActionlintEngine(options: { binaryPath?: string } = {}): Engine {
  // actionlint takes no ruleset, so the elected selection has to reach `run` some other way. Keyed by
  // the handle's `path`, which is unique per handle.
  const selections = new Map<string, ReadonlySet<string>>()

  const resolution = (): ActionlintResolution | undefined =>
    options.binaryPath === undefined ? resolveActionlintBinary() : { command: options.binaryPath, source: 'env' }

  const required = (): ActionlintResolution => {
    const resolved = resolution()
    if (resolved === undefined) throw new EngineError('actionlint', unavailableReason())
    return resolved
  }

  return {
    id: 'actionlint',

    capabilities: {
      // Not `yaml`: actionlint refuses anything that is not a workflow, so the wider language would
      // hand it every YAML file in the repository — a subprocess argument and a cache entry each.
      languages: ['github-workflow'],
      granularity: 'file',
      provides: [],
      // actionlint emits no fix data, and none of its findings has a single mechanical repair.
      fixes: false,
    },

    async availability(): Promise<EngineAvailability> {
      // Filesystem only, no spawn (not even `--version`): `sgate rules why` calls this, and an
      // explain-only command must neither execute a program nor change the machine.
      const resolved = resolution()
      if (resolved !== undefined) return { available: true }
      return { available: false, reason: unavailableReason(), install: 'sgate engines install actionlint' }
    },

    async version(cache) {
      // The *resolved* binary's version, not `ACTIONLINT_VERSION`: a `PATH` actionlint is frequently
      // newer than the pin, and this string is part of every cache key — reporting the pin would serve
      // one binary's results after the machine started running another. No strip regex: actionlint
      // prints the bare number, and `toolVersion`'s first-line-only behaviour is needed here, since
      // two lines of build banner follow it.
      return toolVersion({ command: required().command, prefixArgs: [] }, undefined, cache)
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      // The level is read even though actionlint has no ruleset to write it into, because `parse.ts`
      // gates every finding on membership of `selections` — so that set *is* this engine's enablement
      // decision, and building it from the keys alone would make an `['off', …]` setting read as
      // enabled. Options are dropped and correspondingly absent from the hash: the checks take none.
      const enabled = [...selection].filter(([, [level]]) => level !== 'off')
      const rulesetHash = hashJson(enabled.map(([rule, [level]]) => [rule, level]).sort())
      const path = join(context.tmpDir, `actionlint.${rulesetHash.slice(0, 12)}.yaml`)
      selections.set(path, new Set(enabled.map(([rule]) => rule)))
      await mkdir(context.tmpDir, { recursive: true })
      // The content is nearly inert; an *existing* file at a path we chose is the point. Without
      // `-config-file`, actionlint discovers `.github/actionlint.yaml` in the analysed repository and
      // silently changes its own behaviour.
      await writeFile(
        path,
        ['# Generated by slop-gate. Do not edit; it is deleted when the run ends.', 'self-hosted-runner:', '  labels: []', ''].join(
          '\n',
        ),
        'utf8',
      )
      return {
        path,
        rulesetHash,
        // `ruleCount` deliberately absent, as on `tsc`: actionlint reports no count of the rules it
        // loaded, so there is no number to assert a selection against. `parse.ts` enforces it instead.
        async dispose() {
          // The file itself lives in `tmpDir`, which the caller owns and removes wholesale.
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
  return `actionlint was not found on PATH, in the slop-gate cache, or at ${ACTIONLINT_PATH_ENV}`
}

async function* execute(
  invocation: ActionlintResolution,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
  selected: ReadonlySet<string>,
): AsyncIterable<RawDiagnostic> {
  // Not an optimisation: `actionlint` with no file arguments walks up to the nearest
  // `.github/workflows` and lints **the whole repository** (confirmed against 1.7.12), so an empty
  // batch would silently widen the run past what the planner assigned it.
  if (batch.files.length === 0) return

  const args = [
    '-shellcheck=',
    '-pyflakes=',
    '-no-color',
    '-config-file',
    handle.path,
    '-format',
    '{{json .}}',
    ...batch.files.map((file) => file.path),
  ]

  const { stdout } = await runEngineTool({
    engine: 'actionlint',
    command: invocation.command,
    args,
    cwd: context.rootDir,
    signal,
    maxFindingsExitCode: MAX_FINDINGS_EXIT_CODE,
  })

  const errors = readActionlintErrors(stdout)

  // Read up front so `readSource` can stay synchronous — `rangeFromLineColumn` needs the text.
  const sources = new Map<string, string | undefined>()
  for (const error of errors) {
    const file = error.filepath.replaceAll('\\', '/')
    if (file === '' || sources.has(file)) continue
    try {
      sources.set(file, await readFile(join(context.rootDir, file), 'utf8'))
    } catch {
      // A file removed mid-run is not a finding about the repository; the diagnostic still reports,
      // at the top of the file.
      sources.set(file, undefined)
    }
  }

  yield* parseActionlintOutput(errors, {
    absolutePrefixes: await absolutePrefixes(context),
    enabled: (rule) => selected.has(rule),
    readSource: (file) => sources.get(file),
  })
}
