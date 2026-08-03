import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  EngineError,
  isExecFileFailure,
  toolVersion,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type ExecFileFailure,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeBiomeCssConfig, type BiomeCssConfigHandle } from './config.ts'
import { parseBiomeOutput } from './parse.ts'
import { BIOME_CSS_RULES, FOREIGN_SUPPRESSION_RULE_ID } from './rules.ts'
import { resolveBiomeBinary, type BiomeInvocation } from './resolve-binary.ts'
import { findForeignSuppressions } from './suppressions.ts'

export { materializeBiomeCssConfig, type BiomeCssConfigHandle } from './config.ts'
export { CSS_PARSE_ERROR_RULE_ID, parseBiomeOutput, type ParseOptions } from './parse.ts'
export {
  BIOME_CSS_RULES,
  BIOME_CSS_RULE_IDS,
  EXCLUDED_RULES,
  EXCLUDED_RULE_IDS,
  FOREIGN_SUPPRESSION_RULE_ID,
  ruleByCategory,
  ruleByEngineRuleId,
  type BiomeCssRule,
  type ExcludedRule,
} from './rules.ts'
export { resolveBiomeBinary, type BiomeInvocation } from './resolve-binary.ts'
export { findForeignSuppressions } from './suppressions.ts'

const run = promisify(execFile)

/**
 * The stylesheet engine — `css` only.
 *
 * **Bundled, with no `availability()`.** `@biomejs/biome` is an ordinary dependency with eight platform
 * optional dependencies, oxlint's distribution shape exactly: present by construction, so a probe that
 * always returned `true` would be noise (see `Engine.availability`).
 *
 * **`fixes: false`.** Exactly one CSS rule in Biome offers a fix (`noImportantStyles`, unsafe), and it
 * is out of `recommended`.
 *
 * **What a run of this engine looks like on a real repository: nothing.** Sixteen of its eighteen
 * `recommended` rules produced zero findings across 1729 production stylesheets — the intended outcome;
 * `BIOME_CSS_RULE_ENTRIES` in the core registry records what was excluded to make it so.
 */
const MISSING_BIOME =
  'the bundled `@biomejs/biome` package could not be resolved from this installation of slop-gate, and ' +
  'it will not fall back to a `biome` on PATH — this package pins one exact Biome version and the rule ' +
  'entries were measured against it. Reinstall slop-gate.'

export function createBiomeCssEngine(options: { binaryPath?: string } = {}): Engine {
  // As in `engine-oxlint`: an explicit override is spawned exactly as given, with no `node` prefix,
  // because tests point it at a deliberately-missing path.
  const invocation: BiomeInvocation | undefined =
    options.binaryPath === undefined ? resolveBiomeBinary() : { command: options.binaryPath, prefixArgs: [] }

  // An unresolvable bundled dependency is a broken installation of slop-gate, not a coverage gap.
  const required = (): BiomeInvocation => {
    if (invocation === undefined) throw new EngineError('biome-css', MISSING_BIOME)
    return invocation
  }

  return {
    id: 'biome-css',

    capabilities: {
      // Not `scss`, not `less`. Biome 2.5.6 ignores those files entirely rather than reporting on them
      // badly, so declaring either would have arbitration elect this engine for stylesheets it never
      // opens and the run would report clean.
      languages: ['css'],
      granularity: 'file',
      provides: [],
      fixes: false,
    },

    async version(cache) {
      return toolVersion(required(), /^version:\s*/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeBiomeCssConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal)
    },
  }
}

async function* execute(
  invocation: BiomeInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0) return
  const elected = electedRuleIds(handle)

  // Every file is read once, here, for the byte-offset conversion and the foreign-suppression scan.
  // Reading in the adapter rather than lazily inside the parser is what keeps the suppression scan
  // honest — it must run for every assigned file, including the ones Biome had nothing to say about.
  const sources = new Map<string, string>()
  for (const file of batch.files) {
    try {
      sources.set(file.path, await readFile(join(context.rootDir, file.path), 'utf8'))
    } catch {
      // A file that vanished between planning and running is routine in a caching linter. Biome will
      // not count it either, and the `summary.unchanged` guard below notices the mismatch.
    }
  }

  await mkdir(context.tmpDir, { recursive: true })
  // The report goes to a file, never to stdout, and that is the only way to read this engine reliably:
  // Biome's exit code 1 means "found findings" *and* "your configuration is broken" *and* "a path did
  // not match", all three confirmed directly. Failure text therefore lands on stdout/stderr where it
  // cannot corrupt the report, and the report's own contents decide whether the run succeeded.
  const reportDir = await mkdtemp(join(context.tmpDir, 'biome-css-report-'))
  const reportPath = join(reportDir, 'report.json')

  const args = [
    ...invocation.prefixArgs,
    'lint',
    `--config-path=${handle.path}`,
    // Biome caps output at 20 diagnostics by default and reports how many it withheld;
    // `parseBiomeOutput` fails the run if that counter is ever non-zero.
    '--max-diagnostics=none',
    // Turns "none of these paths matched" from exit 1 into exit 0 — one of the three meanings above.
    '--no-errors-on-unmatched',
    '--reporter=json',
    `--reporter-file=${reportPath}`,
    ...batch.files.map((file) => file.path),
  ]

  let failure: ExecFileFailure | undefined
  try {
    await run(invocation.command, args, {
      cwd: context.rootDir,
      signal,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    })
  } catch (error) {
    failure = isExecFileFailure(error) ? error : {}
  }

  let report: string
  try {
    report = await readFile(reportPath, 'utf8')
  } catch (cause) {
    // No report at all means Biome never got as far as linting — a rejected configuration, a missing
    // binary, a nested `biome.json` in the config directory. This resolves the ambiguous exit code: the
    // report's absence is the signal, the process output the explanation.
    throw new EngineError(
      'biome-css',
      `biome produced no report: ${failure?.stderr?.trim() || failure?.stdout?.trim() || String(failure?.code ?? 'unknown error')}`,
      { cause },
    )
  } finally {
    await rm(reportDir, { recursive: true, force: true })
  }

  const enabled = new Set(BIOME_CSS_RULES.map((rule) => rule.engineRuleId).filter((id) => elected.has(id)))
  yield* parseBiomeOutput(report, {
    read: (file) => sources.get(file),
    enabled,
    expectedFileCount: sources.size,
  })

  // Biome's own suppressions, reported by us because Biome reports nothing about them at all — see
  // `suppressions.ts`. Scoped to `FOREIGN_SUPPRESSION_RULE_ID` so arbitration and inline
  // `sgate-disable` treat it as an ordinary rule the user can turn off.
  if (elected.has(FOREIGN_SUPPRESSION_RULE_ID)) {
    for (const [file, source] of sources) yield* findForeignSuppressions(file, source)
  }
}

/**
 * Always succeeds today: the handle `run` was given is the one `materializeConfig` produced. It exists
 * so that a future refactor synthesising a handle elsewhere fails here with a sentence rather than by
 * silently treating every rule as elected.
 */
function electedRuleIds(handle: EngineConfigHandle): ReadonlySet<string> {
  const elected = (handle as Partial<BiomeCssConfigHandle>).enabledRuleIds
  if (elected === undefined) {
    throw new EngineError('biome-css', 'run was given a config handle this engine did not materialise')
  }
  return elected
}
