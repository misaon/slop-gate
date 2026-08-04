import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '../cache/atomic-write.ts'
import type { Diagnostic } from '../diagnostics/types.ts'
import { ConfigError } from '../errors.ts'
import { compareStrings } from '../ordering.ts'
import { BASELINE_VERSION, type BaselineEntry, type BaselineFile } from './types.ts'

const BASELINE_FILENAME = 'baseline.json'

export function baselinePathFor(rootDir: string): string {
  return join(rootDir, '.slop-gate', BASELINE_FILENAME)
}

export function entriesOf(diagnostics: readonly Diagnostic[]): BaselineEntry[] {
  return diagnostics.map((diagnostic) => ({
    file: diagnostic.file,
    concept: diagnostic.concept,
    fingerprint: diagnostic.fingerprint,
  }))
}

export function serializeBaseline(entries: readonly BaselineEntry[]): string {
  const lines = sortEntries(entries).map(
    (entry) =>
      `    { "file": ${JSON.stringify(entry.file)}, "concept": ${JSON.stringify(entry.concept)}, ` +
      `"fingerprint": ${JSON.stringify(entry.fingerprint)} }`,
  )
  const body = lines.length === 0 ? '' : `\n${lines.join(',\n')}\n  `
  return `{\n  "version": ${BASELINE_VERSION},\n  "accepted": [${body}]\n}\n`
}

export function parseBaseline(text: string, path: string): BaselineFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new ConfigError(`${path} is not valid json.`, { cause })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${path} must hold a json object.`)
  }
  const record = parsed as Record<string, unknown>
  if (record['version'] !== BASELINE_VERSION) {
    throw new ConfigError(
      `${path} is version ${String(record['version'])}; this slop-gate reads version ${BASELINE_VERSION}. ` +
        `Regenerate it with \`sgate baseline create --force\`.`,
    )
  }
  if (!Array.isArray(record['accepted'])) {
    throw new ConfigError(`${path} has no \`accepted\` array.`)
  }
  const accepted = sortEntries(record['accepted'].map((raw, index) => parseEntry(raw, path, index)))
  return { version: BASELINE_VERSION, accepted }
}

function sortEntries(entries: readonly BaselineEntry[]): BaselineEntry[] {
  return [...entries].sort(
    (a, b) =>
      compareStrings(a.file ?? '', b.file ?? '') ||
      compareStrings(a.concept, b.concept) ||
      compareStrings(a.fingerprint, b.fingerprint),
  )
}

const ENTRY_KEYS = new Set(['file', 'concept', 'fingerprint'])

function parseEntry(raw: unknown, path: string, index: number): BaselineEntry {
  const at = `${path}: \`accepted[${index}]\``
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError(`${at} is not an object.`)
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ENTRY_KEYS.has(key)) throw new ConfigError(`${at} has an unknown key \`${key}\`.`)
  }
  const { file, concept, fingerprint } = record
  if (file !== null && typeof file !== 'string') throw new ConfigError(`${at} needs a \`file\` string or null.`)
  if (typeof concept !== 'string') throw new ConfigError(`${at} needs a \`concept\` string.`)
  if (typeof fingerprint !== 'string') throw new ConfigError(`${at} needs a \`fingerprint\` string.`)
  return { file, concept, fingerprint }
}

export async function readBaseline(path: string): Promise<BaselineFile | null> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
  return parseBaseline(text, path)
}

export async function writeBaseline(path: string, entries: readonly BaselineEntry[]): Promise<void> {
  await writeFileAtomic(path, serializeBaseline(entries))
}
