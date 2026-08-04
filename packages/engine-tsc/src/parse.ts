import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createLineIndex, EngineError, toRepoRelative, type LineIndex, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

/**
 * The single synthetic rule id every `tsc` diagnostic is attributed to, whatever its own TS error code. Why one
 * id — and one concept, `types.type-error` — covers the whole domain rather than a concept per code is in the
 * `tsc/type-error` entry in `packages/core/src/registry/entries.uncatalogued.ts`.
 */
export const TYPE_ERROR_RULE_ID = 'type-error'

/**
 * `tsc`'s plain-text (non-`--pretty`) diagnostic format, reverse-engineered by capturing the real 5.9.3 binary's
 * stdout rather than assumed. Every shape below was observed in that capture; none was inferred. Two shapes:
 *
 * - **Located**: `<file>(<line>,<column>): error TS<code>: <message>` — a real source position.
 * - **Global**: `error TS<code>: <message>` — no location at all, observed for an unreadable tsconfig (TS5058,
 *   TS5057) and for one matching zero input files (TS18003). `RawDiagnostic.file` is a required `string` and
 *   there is no file to attribute these to, so they become an `EngineError` rather than a diagnostic.
 *
 * **A located diagnostic is not always one line.** Confirmed directly: `TS2769` (overload mismatch) and other
 * multi-candidate diagnostics continue onto further lines indented two or four spaces with **no**
 * `file(line,col):` prefix of their own — indentation is the only signal that a line belongs to the diagnostic
 * above it. Anything matching neither shape is folded into the currently-open diagnostic's message; a line before
 * any diagnostic has opened is ignored rather than thrown on, since the caller's exit-code check has already
 * decided this was a legitimate run.
 */
const LOCATED = /^(.*)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/
const GLOBAL = /^(error|warning) (TS\d+): (.*)$/

const SEVERITIES: Readonly<Record<string, RawSeverity>> = { error: 'error', warning: 'warning' }

type OpenDiagnostic =
  | { kind: 'located'; file: string; line: number; column: number; code: string; severity: RawSeverity; messageLines: string[] }
  | { kind: 'global'; code: string; severity: RawSeverity; messageLines: string[] }

type LocatedDiagnostic = {
  file: string
  line: number
  column: number
  code: string
  severity: RawSeverity
  message: string
}

/**
 * Each referenced file is read back (relative to `rootDir`) to convert `tsc`'s 1-based (line, column) — already
 * UTF-16 code units, spec §10's own convention — into the byte offsets `RawDiagnostic.range` requires. oxlint's
 * parser never needs this: it hands back byte spans directly.
 *
 * tsc's plain-text output carries no *length*, only a starting position, so **every diagnostic gets a deliberate
 * one-character range** at its reported column. `--pretty`'s code frame does show an underline width, but parsing
 * two output shapes to reconcile one position is the worse trade.
 *
 * @yields One `RawDiagnostic` per located diagnostic tsc reported, in the order tsc printed them.
 */
export async function* parseTscOutput(stdout: string, rootDir: string): AsyncGenerator<RawDiagnostic> {
  const trimmed = stdout.trim()
  if (trimmed === '') return

  const globals: string[] = []
  const located: LocatedDiagnostic[] = []
  let current: OpenDiagnostic | null = null

  const flush = (): void => {
    if (current === null) return
    const message = current.messageLines.join('\n')
    if (current.kind === 'global') {
      globals.push(`${current.code}: ${message}`)
    } else {
      located.push({
        file: current.file,
        line: current.line,
        column: current.column,
        code: current.code,
        severity: current.severity,
        message,
      })
    }
    current = null
  }

  for (const rawLine of stdout.split(/\r?\n/)) {
    if (rawLine.trim() === '') continue

    const locatedMatch = LOCATED.exec(rawLine)
    if (locatedMatch) {
      flush()
      // sgate-disable-next-line slop.double-cast -- LOCATED's six capture groups are all unconditional, so a match always carries six strings; RegExpExecArray types them `string | undefined` and TypeScript has no way to express "this pattern cannot miss".
      const [, file, line, column, severityWord, code, message] = locatedMatch as unknown as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
      current = {
        kind: 'located',
        file: toRepoRelative(file, rootDir),
        line: Number(line),
        column: Number(column),
        code,
        severity: SEVERITIES[severityWord] ?? 'error',
        messageLines: [message],
      }
      continue
    }

    const globalMatch = GLOBAL.exec(rawLine)
    if (globalMatch) {
      flush()
      // sgate-disable-next-line slop.double-cast -- as above: GLOBAL's three groups are all unconditional, so the tuple is exact and only its type is imprecise.
      const [, severityWord, code, message] = globalMatch as unknown as [string, string, string, string]
      current = { kind: 'global', code, severity: SEVERITIES[severityWord] ?? 'error', messageLines: [message] }
      continue
    }

    if (current !== null) current.messageLines.push(rawLine.trim())
  }
  flush()

  if (globals.length > 0) {
    throw new EngineError('tsc', globals.join('\n'))
  }

  const lineIndexes = new Map<string, LineIndex>()
  const indexFor = async (file: string): Promise<LineIndex> => {
    const cached = lineIndexes.get(file)
    if (cached !== undefined) return cached
    const source = await readFile(join(rootDir, file), 'utf8')
    const index = createLineIndex(source)
    lineIndexes.set(file, index)
    return index
  }

  for (const diagnostic of located) {
    if (await isPresentComponentImport(diagnostic, rootDir)) continue
    const index = await indexFor(diagnostic.file)
    const start = index.offsetAt({ line: diagnostic.line, column: diagnostic.column })
    const end = index.offsetAt({ line: diagnostic.line, column: diagnostic.column + 1 })

    yield {
      engineRuleId: TYPE_ERROR_RULE_ID,
      // The TS code is folded into the message rather than dropped: `RawDiagnostic` has no code field, and
      // keeping it is what makes the message greppable against what the user's own editor or CI already shows.
      message: `${diagnostic.code}: ${diagnostic.message}`,
      severity: diagnostic.severity,
      file: diagnostic.file,
      range: { start, end },
    }
  }
}

/** `TS2307: Cannot find module '<specifier>' or its corresponding type declarations.` */
const CANNOT_FIND_MODULE = /^Cannot find module '([^']+)'/

/**
 * Extensions tsc structurally cannot read, whatever is installed. A single-file component is not
 * TypeScript — resolving one needs `vue-tsc`, `svelte-check` or `astro check`, which is what these
 * projects run as their own `typecheck` script.
 */
const COMPONENT_EXTENSIONS = ['.vue', '.svelte', '.astro']

/**
 * Whether this diagnostic is tsc reporting a component file that is sitting right there.
 *
 * **Measured on `nuxt/movies`: 10 of 10 `types.type-error` findings were exactly this, at `error`, and
 * every `.vue` file named existed on disk.** The project's own `typecheck` is `vue-tsc --noEmit` and
 * reports none of them — which is the agreement `types.type-error` exists to hold to, stated in
 * AGENTS.md as "a type error has to match what your own build reports". A Vue or Nuxt repository
 * otherwise gets one false `error` per SFC import, and `recommended` puts that in everybody's build.
 *
 * **A resolution check, not a blanket exemption**, and the difference is the whole point: a typo in an
 * SFC import is a real error that tsc is the only engine here to catch, so the specifier is resolved
 * against the importing file and the finding is kept when nothing is there. Only relative specifiers
 * are answered — an aliased one (`~/components/Card.vue`) would need the tsconfig's `paths`, and
 * guessing at that would silence findings over code nobody resolved.
 */
async function isPresentComponentImport(
  diagnostic: { readonly file: string; readonly code: string; readonly message: string },
  rootDir: string,
): Promise<boolean> {
  if (diagnostic.code !== 'TS2307') return false

  const specifier = CANNOT_FIND_MODULE.exec(diagnostic.message)?.[1]
  if (specifier === undefined) return false
  if (!COMPONENT_EXTENSIONS.some((extension) => specifier.endsWith(extension))) return false
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false

  const resolved = join(rootDir, dirname(diagnostic.file), specifier)
  return stat(resolved).then(
    (entry) => entry.isFile(),
    () => false,
  )
}
