import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'

type Sample = {
  readonly wallMs: number
  readonly cpuMs: number
  readonly peakRssMb: number
  readonly rssSamples: number
}

export type Measurement = {
  readonly runs: number
  readonly wallMs: number
  readonly cpuMs: number
  readonly peakRssMb: number
  /**
   * How many times the resident set was read during the shortest run. A peak found in six samples is a
   * different number from one found in a hundred, and only the measurement knows which it took — so it says,
   * rather than leaving the comparison to assume.
   */
  readonly rssSamples: number
  readonly spreadPercent: number
}

const RSS_POLL_MS = 20
const WARMUP_RUNS = 2

// Peak resident set of the whole tree, not of the largest single child: `getrusage(RUSAGE_CHILDREN)`
// reports the latter, and the two differ by 9x here because the engines are concurrent subprocesses.
async function treeRssKb(pgid: number): Promise<number> {
  const entries = await readdir('/proc').catch(() => [])
  let total = 0
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    const status = await readFile(`/proc/${entry}/status`, 'utf8').catch(() => null)
    if (status === null) continue
    if (Number(/^NSpgid:\s+(\d+)/m.exec(status)?.[1] ?? -1) !== pgid) continue
    total += Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0)
  }
  return total
}

/**
 * `bash -c 'time …'` rather than an `/usr/bin/time` that this platform may not have — the shell builtin
 * reports the tree's user and system time, which is what a CPU budget is about, and `%R` gives the wall
 * clock from inside the same measurement.
 */
async function measureOnce(command: string, args: readonly string[], cwd: string): Promise<Sample> {
  const quoted = [command, ...args].map((part) => `'${part.replaceAll("'", String.raw`'\''`)}'`).join(' ')
  const child = spawn('bash', ['-c', `TIMEFORMAT='%R %U %S'; time ${quoted} >/dev/null 2>/dev/null`], {
    cwd,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => void (stderr += chunk.toString()))

  let peakKb = 0
  let rssSamples = 0
  const poll = setInterval(() => {
    void (async () => {
      const kb = await treeRssKb(child.pid ?? -1)
      rssSamples += 1
      peakKb = Math.max(peakKb, kb)
    })()
  }, RSS_POLL_MS)

  const code = await new Promise<number>((resolve) => child.on('close', resolve))
  clearInterval(poll)
  if (code !== 0) throw new Error(`${command} exited ${code}`)

  const reported = stderr.trim().split('\n').at(-1)?.trim().split(/\s+/) ?? []
  const [wall, user, system] = reported.map(Number)
  if (wall === undefined || Number.isNaN(wall)) throw new Error(`could not read timings from: ${stderr.trim()}`)

  return { wallMs: wall * 1000, cpuMs: ((user ?? 0) + (system ?? 0)) * 1000, peakRssMb: peakKb / 1024, rssSamples }
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
}

/**
 * Medians, and never a single run: on this hardware a single warm `check` varies 7.5% between the fastest
 * and slowest of ten, while the median of ten varies 2.1% across independent batches. A 5% KPI is only
 * meaningful against the second number.
 */
export async function measure(
  runs: number,
  command: string,
  args: readonly string[],
  cwd: string,
  before?: () => Promise<void>,
): Promise<Measurement> {
  // Two discarded runs, not one. `pnpm perf` rebuilds before measuring, which rewrites `dist/main.js` and
  // so invalidates the V8 compile cache `bin/sgate.js` enables — worth about 26 ms, which is 10% of the
  // startup scenario and reported as a regression. Measured: one warmup left startup at +10.5% against an
  // unchanged tool, two leaves it at +3.2%.
  for (let warmup = 0; warmup < WARMUP_RUNS; warmup++) {
    await before?.()
    await measureOnce(command, args, cwd)
  }

  const samples: Sample[] = []
  for (let run = 0; run < runs; run++) {
    await before?.()
    samples.push(await measureOnce(command, args, cwd))
  }

  const walls = samples.map((sample) => sample.wallMs)
  return {
    runs,
    wallMs: median(walls),
    cpuMs: median(samples.map((sample) => sample.cpuMs)),
    peakRssMb: median(samples.map((sample) => sample.peakRssMb)),
    rssSamples: Math.min(...samples.map((sample) => sample.rssSamples)),
    spreadPercent: (Math.max(...walls) - Math.min(...walls)) / Math.min(...walls) * 100,
  }
}
