import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type CorpusShape = {
  readonly modules: number
  readonly stylesheets: number
  readonly documents: number
}

export const STANDARD_CORPUS: CorpusShape = { modules: 400, stylesheets: 24, documents: 12 }

// A KPI compares one run against another, so the input has to be the same bytes every time. This is
// mulberry32, seeded per file from its index, because `Math.random` would make every baseline a guess.
function sequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(next: () => number, options: readonly T[]): T => options[Math.floor(next() * options.length)]!

const NOUNS = ['order', 'invoice', 'customer', 'ledger', 'shipment', 'token', 'session', 'payment'] as const

const moduleName = (index: number): string => `mod-${String(index).padStart(4, '0')}`

// Exported symbols are named from the index, never from the random draw: the entry file has to be able
// to name them without replaying the generator's own sequence.
function moduleSource(index: number, total: number): string {
  const next = sequence(index * 2654435761)
  const noun = pick(next, NOUNS)
  // The last module imports nothing: `(index + 1) % total` closed the ring, and a 400-module cycle is not
  // what a repository this size looks like — `restriction.no-cycle` reported all 400 of them.
  const neighbour = index + 1 < total ? index + 1 : null
  const fields = 3 + Math.floor(next() * 4)

  const lines = [
    ...(neighbour === null ? [] : [`import { run${neighbour} } from './${moduleName(neighbour)}.ts'`]),
    '',
    `export type ${noun}${index} = {`,
    ...Array.from({ length: fields }, (_, field) => `  readonly field${field}: ${pick(next, ['string', 'number', 'boolean'])}`),
    '}',
    '',
    `export function run${index}(input: readonly ${noun}${index}[]): number {`,
    '  let total = 0',
    '  for (const entry of input) total += Object.keys(entry).length',
    neighbour === null ? '  return total' : `  return total + run${neighbour}([])`,
    '}',
  ]

  // Every eighth module leaves an export nothing imports, so knip has a deterministic count of findings
  // to report rather than none at all.
  if (index % 8 === 0) {
    lines.push('', `export function spare${index}(value: ${noun}${index}): string {`, '  return JSON.stringify(value)', '}')
  }

  return `${lines.join('\n')}\n`
}

function stylesheetSource(index: number): string {
  const next = sequence(index * 40503)
  const rules = 4 + Math.floor(next() * 4)
  const blocks = Array.from({ length: rules }, (_, rule) => {
    const hue = Math.floor(next() * 360)
    return `.block-${index}-${rule} {\n  color: hsl(${hue} 60% 50%);\n  padding: ${rule + 1}px;\n}`
  })
  return `${blocks.join('\n\n')}\n`
}

function documentSource(index: number): string {
  const next = sequence(index * 7919)
  const entries = Array.from({ length: 4 + Math.floor(next() * 4) }, (_, field) => [`field${field}`, Math.floor(next() * 1000)])
  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`
}

/**
 * No workflow, Dockerfile or lockfile: actionlint, hadolint and deps-security are downloaded rather than
 * bundled, so a corpus that used them would count a different number of files on a fresh machine than on
 * one where they happen to be installed. No `slop-gate.config.ts` either — importing `defineConfig` from
 * outside the workspace would not resolve, and the CLI's default is `extends: ['recommended']` already.
 *
 * The corpus gets its own git repository, which is what makes it both invisible to this repository and
 * visible to the tool. Discovery lists files with `git ls-files -co --exclude-standard`, so anything the
 * *outer* `.gitignore` excludes is scanned as zero files; an inner repository ignores nothing. Living
 * under `packages/` rather than the system temp directory is not a preference either: engine-tsc resolves
 * `typescript` by walking up from the analysed root, and a temp directory shares no ancestor with this
 * repository's node_modules.
 */
export async function writeCorpus(root: string, shape: CorpusShape = STANDARD_CORPUS): Promise<void> {
  await rm(root, { recursive: true, force: true })
  await Promise.all([
    mkdir(join(root, 'src'), { recursive: true }),
    mkdir(join(root, 'styles'), { recursive: true }),
    mkdir(join(root, 'data'), { recursive: true }),
  ])

  const written: Promise<void>[] = []
  for (let index = 0; index < shape.modules; index++) {
    written.push(writeFile(join(root, 'src', `${moduleName(index)}.ts`), moduleSource(index, shape.modules)))
  }
  for (let index = 0; index < shape.stylesheets; index++) {
    written.push(writeFile(join(root, 'styles', `sheet-${String(index).padStart(3, '0')}.css`), stylesheetSource(index)))
  }
  for (let index = 0; index < shape.documents; index++) {
    written.push(writeFile(join(root, 'data', `doc-${String(index).padStart(3, '0')}.json`), documentSource(index)))
  }

  const reExports = Array.from({ length: shape.modules }, (_, index) => index)
    .filter((index) => index % 4 === 0)
    .map((index) => `export { run${index} } from './${moduleName(index)}.ts'`)

  written.push(
    writeFile(join(root, 'src', 'index.ts'), `${reExports.join('\n')}\n`),
    writeFile(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'perf-corpus', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`,
    ),
    writeFile(
      join(root, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'es2024',
            lib: ['es2024'],
            module: 'nodenext',
            moduleResolution: 'nodenext',
            strict: true,
            noEmit: true,
            allowImportingTsExtensions: true,
          },
          include: ['src'],
        },
        null,
        2,
      )}\n`,
    ),
  )

  await Promise.all(written)
  await run('git', ['init', '--quiet'], { cwd: root })
}
