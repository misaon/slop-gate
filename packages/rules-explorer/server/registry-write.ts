import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CatalogueEntry, CatalogueStatus, Impact } from '@misaon/slop-gate-core'
import type { Payload } from './catalogue.ts'
import { editObjectLiteral, quote, readObjectEntry, wrapLiteral } from './source-edit.ts'

const run = promisify(execFile)

export type RuleEdit = {
  readonly ruleRefKey: string
  readonly status?: CatalogueStatus
  readonly impact?: Impact
  /** Required when `status` is `withheld`. Capped at 900 characters by `not-recommended.test.ts`. */
  readonly reason?: string
  readonly evidence?: string
  /** Required when `impact` departs from the group default and the concept has no exception yet. */
  readonly impactNote?: string
}

export type RuleEditResult =
  | { readonly ok: true; readonly entry: CatalogueEntry }
  | { readonly ok: false; readonly error: string }

/** What `not-recommended.test.ts` refuses, refused here instead so the reason reaches the author. */
const REASON_LIMIT = 900

const WRAP_COLUMN = 116

async function restore(files: ReadonlyMap<string, string>): Promise<void> {
  for (const [path, content] of files) await writeFile(path, content, 'utf8')
}

/** The failing test and what it expected, not the command line — that is what the author has to act on. */
function summarise(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  // A rejected `execFile` carries the child's output, which node's own types do not declare on `Error`.
  const output = `${'stdout' in error ? String(error.stdout) : ''}\n${'stderr' in error ? String(error.stderr) : ''}`
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('FAIL ') || line.startsWith('AssertionError') || line.startsWith('Error:'))

  return lines.length === 0 ? error.message.split('\n')[0]! : [...new Set(lines)].slice(0, 4).join('\n')
}

type Catalogue = { get(): Promise<Payload>; refresh(): Promise<Payload> }

function renderImpact(concept: string, impact: Impact, note: string): string {
  return `  // ${note}\n  ${quote(concept)}: ${impact},`
}

function renderWithheld(key: string, reason: string, evidence: string | undefined): string {
  const inline = `  ${quote(key)}: { reason: ${quote(reason)} },`
  if (evidence === undefined && !reason.includes('\n') && inline.length <= WRAP_COLUMN + 20) return inline

  return [
    `  ${quote(key)}: {`,
    '    reason:',
    `${wrapLiteral(reason, '      ', WRAP_COLUMN)},`,
    ...(evidence === undefined ? [] : [`    evidence: ${quote(evidence)},`]),
    '  },',
  ].join('\n')
}

/**
 * Editing the registry from a browser, with the registry's own test suite as the gate. Every write is
 * staged, verified against a freshly built catalogue and then tested; anything that fails puts all four
 * files back, because a half-applied exclusion is a registry nobody can reason about.
 */
export function openRegistryWriter(repoRoot: string, catalogue: Catalogue) {
  const paths = {
    impact: join(repoRoot, 'packages', 'core', 'src', 'registry', 'impact.ts'),
    withheld: join(repoRoot, 'packages', 'core', 'src', 'registry', 'not-recommended.ts'),
    entries: join(repoRoot, 'packages', 'core', 'src', 'registry', 'entries.generated.ts'),
    concepts: join(repoRoot, 'packages', 'core', 'src', 'concepts', 'concepts.generated.ts'),
  } as const

  // One edit at a time: two concurrent writers would snapshot each other's half-applied state and
  // restore it on the first failure.
  let queue: Promise<unknown> = Promise.resolve()

  const snapshot = async (): Promise<Map<string, string>> => {
    const files = new Map<string, string>()
    for (const path of Object.values(paths)) files.set(path, await readFile(path, 'utf8'))
    return files
  }

  const regenerate = async (): Promise<void> => {
    await run(process.execPath, ['--experimental-strip-types', join('scripts', 'generate-registry.ts')], {
      cwd: join(repoRoot, 'packages', 'core'),
      maxBuffer: 16 * 1024 * 1024,
    })
  }

  const test = async (): Promise<void> => {
    // pnpm sets `npm_execpath` to its own entry point, which is a script on some installs and a bare
    // command name on others; only the first can be handed to node.
    const execpath = process.env['npm_execpath']
    const script = execpath !== undefined && /\.[cm]?js$/.test(execpath)
    const [command, prefix] = script ? [process.execPath, [execpath]] : [execpath ?? 'pnpm', []]
    try {
      // `--root` absolute, or vitest infers one from the filters and then cannot find the config beside it.
      await run(
        command,
        [...prefix, 'exec', 'vitest', 'run', `--root=${repoRoot}`, 'packages/core/src/registry/', 'packages/core/src/config/', 'packages/core/src/queries/'],
        { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 },
      )
    } catch (error) {
      throw new Error(summarise(error), { cause: error })
    }
  }

  const stage = async (entry: CatalogueEntry, edit: RuleEdit, payload: Payload): Promise<string | null> => {
    if (edit.impact !== undefined && edit.impact !== entry.impact) {
      const source = await readFile(paths.impact, 'utf8')
      const existing = readObjectEntry(paths.impact, source, 'CONCEPT_IMPACT', entry.concept)
      const fromGroup = payload.groupImpact[entry.group]

      let block: string | null = null
      if (edit.impact !== fromGroup) {
        const note = (edit.impactNote ?? existing?.comment ?? '').replace(/\s+/g, ' ').trim()
        if (note === '') {
          return `impact.ts holds only concepts their group is wrong about, each with its reason. Say why ${entry.concept} is impact ${edit.impact} and not the ${entry.group} default${fromGroup === undefined ? '' : ` of ${fromGroup}`}.`
        }
        block = renderImpact(entry.concept, edit.impact, note)
      }
      await writeFile(paths.impact, editObjectLiteral(paths.impact, source, 'CONCEPT_IMPACT', entry.concept, block), 'utf8')
    }

    if (edit.status !== undefined && edit.status !== entry.status) {
      const generated = entry.engine === 'oxlint'
      const record = generated ? 'NOT_RECOMMENDED_GENERATED' : 'NOT_RECOMMENDED_UNCATALOGUED'
      const key = generated ? entry.engineRuleId : entry.ruleRefKey

      let block: string | null = null
      if (edit.status === 'withheld') {
        const reason = (edit.reason ?? '').trim()
        if (reason === '') return 'A withheld rule carries the decision, so `reason` cannot be empty.'
        if (reason.length > REASON_LIMIT) {
          return `The reason is ${reason.length} characters and the registry caps it at ${REASON_LIMIT}. State the conclusion here and put the working in docs/measurements.md.`
        }
        block = renderWithheld(key, reason, edit.evidence === undefined || edit.evidence === '' ? undefined : edit.evidence)
      }

      const source = await readFile(paths.withheld, 'utf8')
      await writeFile(paths.withheld, editObjectLiteral(paths.withheld, source, record, key, block), 'utf8')
      // `GENERATED_RECOMMENDED_RULES` is derived from this table, so for an oxlint rule the edit is
      // inert — and `generate:registry:check` red — until the file it feeds is rebuilt.
      if (generated) await regenerate()
    }

    return null
  }

  const apply = async (edit: RuleEdit): Promise<RuleEditResult> => {
    const payload = await catalogue.get()
    const entry = payload.rules.find((rule) => rule.ruleRefKey === edit.ruleRefKey)
    if (entry === undefined) return { ok: false, error: `No rule in the catalogue is called ${edit.ruleRefKey}.` }

    const files = await snapshot()
    const revert = async (error: string): Promise<RuleEditResult> => {
      await restore(files)
      await catalogue.refresh()
      return { ok: false, error }
    }

    try {
      const refused = await stage(entry, edit, payload)
      if (refused !== null) return await revert(refused)

      // These two files are only half the derivation, so the only trustworthy check that an edit landed
      // is to rebuild the catalogue and read it back.
      const fresh = await catalogue.refresh()
      const written = fresh.rules.find((rule) => rule.ruleRefKey === edit.ruleRefKey)
      if (written === undefined) return await revert(`${edit.ruleRefKey} is no longer in the catalogue after that edit.`)

      if (edit.status !== undefined && written.status !== edit.status) {
        return await revert(
          `The registry reads ${written.status} rather than ${edit.status} after that edit, so it was reverted. ${entry.concept} is named by a preset in packages/core/src/config/presets.ts, which this page does not edit.`,
        )
      }
      if (edit.impact !== undefined && written.impact !== edit.impact) {
        return await revert(`The registry reads impact ${written.impact} rather than ${edit.impact} after that edit, so it was reverted.`)
      }

      await test()
      return { ok: true, entry: written }
    } catch (error) {
      return await revert(`That edit was reverted:\n${summarise(error)}`)
    }
  }

  return {
    apply(edit: RuleEdit): Promise<RuleEditResult> {
      const next = queue.then(() => apply(edit))
      queue = next.catch(() => undefined)
      return next
    },
  }
}
