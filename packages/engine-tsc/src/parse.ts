import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createLineIndex, EngineError, toRepoRelative, type LineIndex, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

export const TYPE_ERROR_RULE_ID = 'type-error'

// Captured from a real tsc run, not from documentation. A located diagnostic may continue onto
// further indented lines with no prefix of their own; a global one has no file to attribute to.
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
      message: `${diagnostic.code}: ${diagnostic.message}`,
      severity: diagnostic.severity,
      file: diagnostic.file,
      range: { start, end },
    }
  }
}

const CANNOT_FIND_MODULE = /^Cannot find module '([^']+)'/

const COMPONENT_EXTENSIONS = ['.vue', '.svelte', '.astro']

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
