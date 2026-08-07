import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  EngineError,
  isExecFileFailure,
  toolVersion,
  type ScriptBinInvocation,
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
import { resolveBiomeBinary } from './resolve-binary.ts'
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
export { resolveBiomeBinary } from './resolve-binary.ts'
export { findForeignSuppressions } from './suppressions.ts'

const run = promisify(execFile)

const MISSING_BIOME =
  'the bundled `@biomejs/biome` package could not be resolved from this installation of slop-gate, and ' +
  'it will not fall back to a `biome` on PATH — this package pins one exact Biome version and the rule ' +
  'entries were measured against it. Reinstall slop-gate.'

export function createBiomeCssEngine(options: { binaryPath?: string } = {}): Engine {
  const invocation: ScriptBinInvocation | undefined =
    options.binaryPath === undefined ? resolveBiomeBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): ScriptBinInvocation => {
    if (invocation === undefined) throw new EngineError('biome-css', MISSING_BIOME)
    return invocation
  }

  return {
    id: 'biome-css',

    capabilities: {
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
  invocation: ScriptBinInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0) return
  const elected = electedRuleIds(handle)

  const sources = new Map<string, string>()
  for (const file of batch.files) {
    try {
      sources.set(file.path, await readFile(join(context.rootDir, file.path), 'utf8'))
    } catch {}
  }

  await mkdir(context.tmpDir, { recursive: true })
  const reportDir = await mkdtemp(join(context.tmpDir, 'biome-css-report-'))
  const reportPath = join(reportDir, 'report.json')

  const args = [
    ...invocation.prefixArgs,
    'lint',
    `--config-path=${handle.path}`,
    '--max-diagnostics=none',
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
    throw new EngineError(
      'biome-css',
      `biome produced no report: ${failure?.stderr?.trim() || failure?.stdout?.trim() || (typeof failure?.code === 'number' ? String(failure.code) : 'unknown error')}`,
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

  if (elected.has(FOREIGN_SUPPRESSION_RULE_ID)) {
    for (const [file, source] of sources) yield* findForeignSuppressions(file, source)
  }
}

function electedRuleIds(handle: EngineConfigHandle): ReadonlySet<string> {
  const elected = (handle as Partial<BiomeCssConfigHandle>).enabledRuleIds
  if (elected === undefined) {
    throw new EngineError('biome-css', 'run was given a config handle this engine did not materialise')
  }
  return elected
}
