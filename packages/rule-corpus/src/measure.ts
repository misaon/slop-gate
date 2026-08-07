import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { CONCEPTS, compareStrings } from '@misaon/slop-gate-core'
import { CORPUS, type CorpusRepo } from './repos.ts'

const run = promisify(execFile)

const HERE = import.meta.dirname
const REPO_ROOT = resolve(HERE, '../../..')
// Outside `packages/`, because that is a pnpm workspace glob: forty-eight checkouts inside a workspace
// package is forty-eight more projects for knip to analyse, and a `sgate check` that does not return.
const CORPUS_DIR = join(REPO_ROOT, '.rule-corpus')
const LOCK = join(HERE, '..', 'corpus.lock.json')
const OUT = join(HERE, '..', 'findings.json')
const SGATE = join(REPO_ROOT, 'packages/cli/bin/sgate.js')

/** Everything the registry knows, at `warn`. `error` would only change the exit code, not the findings. */
const EVERY_CONCEPT = `export default ${JSON.stringify(
  { rules: Object.fromEntries([...CONCEPTS].map((concept) => [concept.id, 'warn']).sort(([a], [b]) => compareStrings(String(a), String(b)))) },
  null,
  2,
)}\n`

type Lock = Record<string, string>

async function cloneAt(repo: CorpusRepo, lock: Lock): Promise<string | null> {
  const dir = join(CORPUS_DIR, repo.name)
  const pinned = lock[repo.name]

  if (existsSync(join(dir, '.git'))) return dir
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  try {
    await run('git', ['init', '--quiet'], { cwd: dir })
    await run('git', ['remote', 'add', 'origin', repo.url], { cwd: dir })
    // A pinned commit is fetched by sha so a re-run measures the same bytes; the first run resolves the
    // ref and writes it down, which is what makes every figure after it reproducible.
    await run('git', ['fetch', '--quiet', '--depth', '1', 'origin', pinned ?? repo.ref], { cwd: dir, maxBuffer: 64 * 1024 * 1024 })
    await run('git', ['checkout', '--quiet', 'FETCH_HEAD'], { cwd: dir })
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: dir })
    lock[repo.name] = stdout.trim()
    return dir
  } catch (error) {
    process.stderr.write(`  ${repo.name}: clone failed — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n`)
    await rm(dir, { recursive: true, force: true })
    return null
  }
}

/** Aggregated per concept, with a few samples: two million raw findings is a file nobody can open. */
type ConceptTally = { readonly concept: string; readonly count: number; readonly files: number; readonly samples: readonly string[] }
type RepoResult = { readonly repo: string; readonly side: string; readonly stack: string; readonly scanned: number; readonly total: number; readonly byConcept: readonly ConceptTally[] }

async function measure(repo: CorpusRepo, dir: string): Promise<RepoResult | null> {
  await writeFile(join(dir, 'slop-gate.config.ts'), EVERY_CONCEPT, 'utf8')
  try {
    const { stdout } = await run(process.execPath, [SGATE, 'check', '--cwd', dir, '--format', 'json', '--no-cache'], {
      cwd: REPO_ROOT,
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, SLOP_GATE_TELEMETRY: '0' },
      timeout: 900_000,
    }).catch((error: unknown) => {
      // A run with findings exits non-zero; that is the normal case here, and its stdout is the report.
      const failure = error as { stdout?: string }
      if (typeof failure.stdout === 'string' && failure.stdout.startsWith('{')) return { stdout: failure.stdout }
      throw error
    })
    const report = JSON.parse(stdout) as {
      stats: { filesScanned: number }
      diagnostics: { concept: string; file: string | null; message: string }[]
    }
    const tallies = new Map<string, { count: number; files: Set<string>; samples: string[] }>()
    for (const diagnostic of report.diagnostics) {
      const tally = tallies.get(diagnostic.concept) ?? { count: 0, files: new Set<string>(), samples: [] }
      tally.count += 1
      if (diagnostic.file !== null) tally.files.add(diagnostic.file)
      if (tally.samples.length < 3) tally.samples.push(`${diagnostic.file ?? '?'} :: ${diagnostic.message.slice(0, 160)}`)
      tallies.set(diagnostic.concept, tally)
    }
    return {
      repo: repo.name,
      side: repo.side,
      stack: repo.stack,
      scanned: report.stats.filesScanned,
      total: report.diagnostics.length,
      byConcept: [...tallies]
        .map(([concept, t]) => ({ concept, count: t.count, files: t.files.size, samples: t.samples }))
        .sort((a, b) => b.count - a.count),
    }
  } catch (error) {
    process.stderr.write(`  ${repo.name}: check failed — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n`)
    return null
  }
}

const lock: Lock = existsSync(LOCK) ? (JSON.parse(await readFile(LOCK, 'utf8')) as Lock) : {}
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const wanted = only.length === 0 ? CORPUS : CORPUS.filter((r) => only.includes(r.name))

await mkdir(CORPUS_DIR, { recursive: true })
const results: RepoResult[] = []

for (const [index, repo] of wanted.entries()) {
  process.stdout.write(`[${index + 1}/${wanted.length}] ${repo.name} … `)
  const dir = await cloneAt(repo, lock)
  if (dir === null) continue
  const result = await measure(repo, dir)
  if (result === null) continue
  results.push(result)
  process.stdout.write(`${result.scanned} files, ${result.total} findings from ${result.byConcept.length} concepts\n`)
  await writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
  await writeFile(OUT, `${JSON.stringify(results)}\n`, 'utf8')
}

process.stdout.write(`\n${results.length} repositories, ${results.reduce((n, r) => n + r.total, 0)} findings -> ${OUT}\n`)
