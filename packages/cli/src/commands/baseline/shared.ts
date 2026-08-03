import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compareStrings, entriesOf, runCheck, type BaselineEntry, type CheckResult } from '@misaon/slop-gate-core'
import { DEFAULT_CONFIG, loadCliConfig } from '../../config.ts'
import { defaultEngines } from '../../engine-registry.ts'
import { EXIT_CODES } from '../../exit-codes.ts'
import { SLOP_GATE_GITIGNORE } from '../init.ts'

export type BaselineRun = { result: CheckResult; entries: BaselineEntry[] }

/**
 * The run a baseline is derived from: every engine, and **`useBaseline: false`** — a baseline built through the
 * baseline it is replacing would only ever re-accept what was already accepted. The cache is left on: it is keyed
 * on file content and engine ruleset and baseline acceptance is applied after it (see `run/check.ts`), so a warm
 * run produces exactly the diagnostics a cold one does.
 *
 * Returns `null` after writing the reason to stderr and setting an exit code. Two refusals: a config error, as
 * every other command treats one, and **an engine failure** — a baseline written from a broken run silently omits
 * everything the failed engine would have reported, so those findings arrive as *new* on the first run that
 * works. An engine that is merely *not installed* is not a failure and does not refuse; that is the ordinary
 * state of a laptop without every optional binary, and the caller is warned instead.
 */
export async function baselineRun(rootDir: string): Promise<BaselineRun | null> {
  const loaded = await loadCliConfig(rootDir, DEFAULT_CONFIG)
  if (loaded.kind === 'error') {
    process.exitCode = EXIT_CODES.config
    return null
  }

  const result = await runCheck({
    rootDir,
    config: loaded.config,
    ...(loaded.kind === 'loaded' ? { configFile: loaded.configFile } : {}),
    engines: defaultEngines(rootDir, loaded.kind === 'loaded' ? loaded.configFile : undefined, loaded.config.ignore),
    useBaseline: false,
  })

  if (result.engineFailures.length > 0) {
    for (const failure of result.engineFailures) {
      process.stderr.write(`engine \`${failure.engine}\` failed — ${failure.message}\n`)
    }
    process.stderr.write(
      'Refusing to write a baseline from a run that did not finish: whatever that engine would have ' +
        'found would arrive as a new finding later.\n',
    )
    process.exitCode = EXIT_CODES.engine
    return null
  }

  return { result, entries: entriesOf(result.diagnostics) }
}

export function warnUnavailable(result: CheckResult): void {
  for (const engine of result.unavailableEngines) {
    if (engine.displaced.length === 0) continue
    const install = engine.install === undefined ? '' : ` Install it with \`${engine.install}\` and re-run this.`
    process.stderr.write(
      `\`${engine.engine}\` is not installed here, so nothing it owns is in this baseline — ` +
        `its findings will be new whenever it does run.${install}\n`,
    )
  }
}

/**
 * Warns when `.slop-gate/.gitignore` would swallow the baseline — deliberately only that file, the one ignore
 * rule slop-gate wrote itself. A repository-wide answer needs `git check-ignore` and nothing else here shells out
 * to git, so a rule the user added elsewhere is not detected and this says nothing about it rather than implying
 * it looked.
 */
export async function warnGitignored(rootDir: string): Promise<void> {
  const path = join(rootDir, '.slop-gate', '.gitignore')
  const content = await readFile(path, 'utf8').then(
    (text) => text,
    () => null,
  )
  if (content === null) return
  const lines = content.split('\n').map((line) => line.trim())
  if (lines.includes('!baseline.json') || !lines.some((line) => line === '*')) return
  process.stderr.write(
    `.slop-gate/.gitignore ignores everything in that directory, including the baseline. A baseline ` +
      `that is not committed is not read by CI. Add \`!baseline.json\` to it, or re-run \`sgate init --force\` ` +
      `to rewrite it as:\n${SLOP_GATE_GITIGNORE.split('\n').filter(Boolean).map((line) => `  ${line}`).join('\n')}\n`,
  )
}

function conceptBreakdown(entries: readonly BaselineEntry[]): Array<{ concept: string; count: number }> {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.concept, (counts.get(entry.concept) ?? 0) + 1)
  return [...counts]
    .map(([concept, count]) => ({ concept, count }))
    .sort((a, b) => b.count - a.count || compareStrings(a.concept, b.concept))
}

export function writeBreakdown(entries: readonly BaselineEntry[]): void {
  for (const { concept, count } of conceptBreakdown(entries)) {
    process.stdout.write(`  ${String(count).padStart(5)}  ${concept}\n`)
  }
}
