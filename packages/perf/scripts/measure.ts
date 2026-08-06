import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { STANDARD_CORPUS, writeCorpus } from '../src/corpus.ts'
import {
  CEILINGS,
  TOLERANCE_PERCENT,
  judge,
  loadIsAcceptable,
  machine,
  sameMachine,
  type Baseline,
  type ScenarioName,
} from '../src/kpi.ts'
import { measure, type Measurement } from '../src/measure.ts'

const REPO_ROOT = join(import.meta.dirname, '../../..')
const CORPUS = join(import.meta.dirname, '../.corpus/macro')
const BASELINE = join(import.meta.dirname, '../baseline.json')
const CLI = join(REPO_ROOT, 'packages/cli/bin/sgate.js')

// Thirty for startup, ten for warm, five for cold. Not taste: startup is the shortest scenario and so the
// noisiest relative to itself — at ten runs its median moved 124-138 ms between batches, which is 11% and
// past the KPI on an unchanged tool. Runs are the only free way to tighten a median, and these cost 124 ms.
const RUNS: Readonly<Record<ScenarioName, number>> = { startup: 30, warm: 10, cold: 5 }

const record = process.argv.includes('--record')
const force = process.argv.includes('--force')

const load = loadIsAcceptable()
if (!load.ok && !force) {
  process.stderr.write(
    `Load average is ${load.load.toFixed(2)} against a limit of ${load.limit.toFixed(2)} for ` +
      `${machine().cores} cores. Numbers taken now would be the machine's, not the tool's — an unchanged ` +
      'tool reads as +8% at twice this limit. Wait for the machine to settle, or pass --force to measure ' +
      'anyway and read the result as indicative.\n',
  )
  process.exit(2)
}

await writeCorpus(CORPUS, STANDARD_CORPUS)

const dropCache = (): Promise<void> => rm(join(CORPUS, '.slop-gate'), { recursive: true, force: true })

const scenarios = {
  startup: await measure(RUNS.startup, process.execPath, [CLI, '--version'], REPO_ROOT),
  cold: await measure(RUNS.cold, process.execPath, [CLI, 'check', '--cwd', CORPUS, '--format', 'json'], REPO_ROOT, dropCache),
  warm: await measure(RUNS.warm, process.execPath, [CLI, 'check', '--cwd', CORPUS, '--format', 'json'], REPO_ROOT),
} satisfies Record<ScenarioName, Measurement>

const trim = (m: Measurement): Pick<Measurement, 'wallMs' | 'cpuMs' | 'peakRssMb'> => ({
  wallMs: Math.round(m.wallMs),
  cpuMs: Math.round(m.cpuMs),
  peakRssMb: Math.round(m.peakRssMb),
})

const measured = { startup: trim(scenarios.startup), warm: trim(scenarios.warm), cold: trim(scenarios.cold) }

if (record) {
  const baseline: Baseline = { machine: machine(), recordedAt: new Date().toISOString(), scenarios: measured }
  await writeFile(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`)
  process.stdout.write(`baseline recorded for ${machine().platform}/${machine().arch}, ${machine().cores} cores\n\n`)
}

const baseline = record ? null : ((JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline) ?? null)
const comparable = baseline !== null && sameMachine(baseline.machine, machine())

process.stdout.write(`| scenario | runs | wall | cpu | peak RSS | spread |\n| --- | --- | --- | --- | --- | --- |\n`)
for (const name of ['startup', 'warm', 'cold'] as const) {
  const here = measured[name]
  const was = baseline?.scenarios[name]
  const delta = comparable && was !== undefined ? ` (${((here.wallMs - was.wallMs) / was.wallMs * 100).toFixed(1)}%)` : ''
  process.stdout.write(
    `| ${name} | ${RUNS[name]} | ${here.wallMs} ms${delta} | ${here.cpuMs} ms | ${here.peakRssMb} MB | ` +
      `${scenarios[name].spreadPercent.toFixed(1)}% |\n`,
  )
}

if (!comparable) {
  process.stdout.write(
    baseline === null
      ? '\nNo baseline; ceilings only.\n'
      : `\nBaseline was taken on ${baseline.machine.platform}/${baseline.machine.arch} with ${baseline.machine.cores} cores, ` +
        `this is ${machine().platform}/${machine().arch} with ${machine().cores}. Ceilings only — a percentage against ` +
        'different hardware is not a measurement.\n',
  )
}

const failures = judge(measured, baseline)
if (failures.length === 0) {
  process.stdout.write(`\nWithin every KPI${comparable ? ` (ceilings, and ${TOLERANCE_PERCENT}% against the baseline)` : ''}.\n`)
  process.exit(0)
}

for (const failure of failures) {
  const limit = failure.kind === 'ceiling' ? `ceiling ${CEILINGS[failure.scenario][failure.metric]}` : `baseline+${TOLERANCE_PERCENT}% = ${failure.limit.toFixed(0)}`
  process.stderr.write(`${failure.scenario}.${failure.metric}: ${failure.measured.toFixed(0)} exceeds ${limit}\n`)
}
process.exit(1)
