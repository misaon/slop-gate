import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildRuleCatalogue, compareStrings, CONCEPTS } from '@misaon/slop-gate-core'

type ConceptTally = { concept: string; count: number; files: number; samples: string[] }
type RepoResult = { repo: string; side: string; stack: string; scanned: number; total: number; byConcept: ConceptTally[] }

const results = JSON.parse(await readFile(join(import.meta.dirname, '..', 'findings.json'), 'utf8')) as RepoResult[]
const scanned = results.reduce((n, r) => n + r.scanned, 0)

const rolled = new Map<string, { count: number; files: number; repos: Set<string>; stacks: Set<string>; samples: string[] }>()
for (const result of results) {
  for (const tally of result.byConcept) {
    const roll = rolled.get(tally.concept) ?? { count: 0, files: 0, repos: new Set<string>(), stacks: new Set<string>(), samples: [] }
    roll.count += tally.count
    roll.files += tally.files
    roll.repos.add(result.repo)
    roll.stacks.add(result.stack)
    if (roll.samples.length < 6) roll.samples.push(`${result.repo}/${tally.samples[0] ?? ''}`)
    rolled.set(tally.concept, roll)
  }
}

const status = new Map(buildRuleCatalogue().map((entry) => [entry.concept, entry.status]))
const known = new Set([...CONCEPTS].map((concept) => concept.id as string))

const rows = [...rolled]
  .map(([concept, roll]) => ({
    concept,
    status: status.get(concept) ?? 'unknown',
    count: roll.count,
    files: roll.files,
    repos: roll.repos.size,
    stacks: roll.stacks.size,
    /** Findings per thousand files scanned: the only figure comparable between a large repo and a small one. */
    density: (roll.count / scanned) * 1000,
    samples: roll.samples,
  }))
  .sort((a, b) => b.count - a.count)

const mode = process.argv[2] ?? 'summary'

if (mode === 'summary') {
  process.stdout.write(`${results.length} repositories, ${scanned} files scanned, ${rows.reduce((n, r) => n + r.count, 0)} findings from ${rows.length} concepts\n`)
  process.stdout.write(`silent across the whole corpus: ${[...known].filter((c) => !rolled.has(c)).length} concepts\n\n`)
  process.stdout.write('count     /1k  repos stacks  status        concept\n')
  for (const row of rows.slice(0, Number(process.argv[3] ?? 60))) {
    process.stdout.write(
      `${String(row.count).padStart(7)} ${row.density.toFixed(1).padStart(7)} ${String(row.repos).padStart(6)} ${String(row.stacks).padStart(6)}  ${row.status.padEnd(12)}  ${row.concept}\n`,
    )
  }
}

if (mode === 'concept') {
  const wanted = process.argv[3]!
  const row = rows.find((r) => r.concept === wanted)
  if (row === undefined) {
    process.stdout.write(`${wanted}: silent across all ${results.length} repositories\n`)
  } else {
    process.stdout.write(`${wanted}: ${row.count} findings, ${row.files} files, ${row.repos}/${results.length} repositories, ${row.stacks} stacks\n`)
    for (const sample of row.samples) process.stdout.write(`  ${sample}\n`)
    const perRepo = results
      .flatMap((r) => r.byConcept.filter((t) => t.concept === wanted).map((t) => `${r.repo}:${t.count}`))
      .sort(compareStrings)
    process.stdout.write(`  per repository: ${perRepo.join(' ')}\n`)
  }
}

if (mode === 'silent') {
  const silent = [...known].filter((c) => !rolled.has(c) && status.get(c) === 'unlisted').sort(compareStrings)
  process.stdout.write(`${silent.length} concepts are unlisted and silent across the whole corpus:\n${silent.join('\n')}\n`)
}
