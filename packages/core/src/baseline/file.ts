import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '../cache/atomic-write.ts'
import type { Diagnostic } from '../diagnostics/types.ts'
import { ConfigError } from '../errors.ts'
import { compareStrings } from '../ordering.ts'
import { BASELINE_VERSION, type BaselineEntry, type BaselineFile } from './types.ts'

const BASELINE_FILENAME = 'baseline.json'

/**
 * `.slop-gate/baseline.json`, as spec §12.2 names it — beside the cache rather than at the repository root,
 * because `sgate init` already creates that directory.
 *
 * The directory is gitignored wholesale by `init`'s `.slop-gate/.gitignore`, and a baseline that is not committed
 * is not a baseline — CI would read none. `init` therefore negates this one filename, and `sgate baseline create`
 * checks the negation is present and says so when it is not.
 */
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

/**
 * Hand-rolled rather than `JSON.stringify(_, null, 2)`, for the one reason this file exists: it is committed, and
 * it is read in a diff. Two-space pretty-printing spreads each finding over five lines, so accepting one more
 * finding reads as a five-line change and a reordering reads as a rewrite. One line per finding makes `git diff`
 * state exactly what was accepted and what was dropped.
 *
 * Sorted by path, then concept, then fingerprint — `null` first, matching how `run/check.ts` already orders a
 * diagnostic with nothing to attribute. Nothing time-, machine- or version-dependent goes in: a `createdAt` would
 * make two identical runs disagree, and git already records when and by whom.
 */
export function serializeBaseline(entries: readonly BaselineEntry[]): string {
  const lines = sortEntries(entries).map(
    (entry) =>
      `    { "file": ${JSON.stringify(entry.file)}, "concept": ${JSON.stringify(entry.concept)}, ` +
      `"fingerprint": ${JSON.stringify(entry.fingerprint)} }`,
  )
  const body = lines.length === 0 ? '' : `\n${lines.join(',\n')}\n  `
  return `{\n  "version": ${BASELINE_VERSION},\n  "accepted": [${body}]\n}\n`
}

/**
 * Every rejection names the path, because the person reading it is looking at a file they or a teammate committed,
 * not at a stack trace. Unknown keys are rejected too: a hand-added `note` that `sgate baseline update` would
 * silently discard is worse than one that was refused.
 */
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
  // Sorted on the way in, not only on the way out. The file is hand-editable, and everything a run derives from it
  // in order — the stale list a report prints — has to be the same for one repository state whether or not someone
  // shuffled the lines.
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

/** `null` when there is no baseline — distinct from an empty one, which accepts nothing on purpose. */
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
