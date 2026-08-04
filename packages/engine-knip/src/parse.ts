import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EngineError, createLineIndex, toRepoRelative, type LineIndex, type RawDiagnostic } from '@misaon/slop-gate-core'
import { KNIP_ISSUE_TYPES, isSurfacedIssueType, type KnipIssueType } from './issue-types.ts'

type KnipItem = {
  name: string
  namespace?: string
  line?: number
  col?: number
  pos?: number
}

type KnipEntry = { file: string } & Partial<Record<KnipIssueType, KnipItem[] | KnipItem[][]>>

type KnipReport = { issues?: KnipEntry[] }

const DESCRIBE: Readonly<Record<KnipIssueType, (item: KnipItem) => string>> = {
  files: () => 'Unused file: not reachable from any entry point.',
  dependencies: (item) => `Unused dependency \`${item.name}\`.`,
  devDependencies: (item) => `Unused devDependency \`${item.name}\`.`,
  unlisted: (item) => `Unlisted dependency \`${item.name}\`: imported but not declared in package.json.`,
  binaries: (item) => `Unlisted binary \`${item.name}\`: used in a script but not provided by any dependency.`,
  unresolved: (item) => `Unresolved import \`${item.name}\`.`,
  exports: (item) => `Unused export \`${item.name}\`.`,
  types: (item) => `Unused exported type \`${item.name}\`.`,
  enumMembers: (item) => `Unused exported enum member \`${qualify(item)}\`.`,
  duplicates: (item) => `Duplicate export \`${item.name}\`.`,
  nsExports: (item) => `Unused export \`${item.name}\` in a used namespace.`,
  nsTypes: (item) => `Unused exported type \`${item.name}\` in a used namespace.`,
  namespaceMembers: (item) => `Unused exported namespace member \`${qualify(item)}\`.`,
  cycles: (item) => `Circular dependency through \`${item.name}\`.`,
  catalog: (item) => `Unused catalog entry \`${item.name}\`.`,
  catalogReferences: (item) => `Unresolved catalog reference \`${item.name}\`.`,
  optionalPeerDependencies: (item) => `Referenced optional peer dependency \`${item.name}\`.`,
}

const qualify = (item: KnipItem): string => (item.namespace === undefined ? item.name : `${item.namespace}.${item.name}`)

export async function* parseKnipOutput(
  stdout: string,
  rootDir: string,
  expected?: { issueTypes: readonly string[] },
): AsyncGenerator<RawDiagnostic> {
  const trimmed = stdout.trim()
  if (trimmed === '') throw new EngineError('knip', 'knip produced no output at all')

  const jsonStart = trimmed.startsWith('{') ? 0 : trimmed.indexOf('\n{')
  if (jsonStart === -1) {
    throw new EngineError('knip', `knip produced no json output: ${trimmed.slice(0, 200)}`)
  }

  let report: KnipReport
  try {
    report = JSON.parse(trimmed.slice(jsonStart)) as KnipReport
  } catch (cause) {
    throw new EngineError('knip', `could not parse knip json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(report.issues)) {
    throw new EngineError('knip', 'knip json output has no issues array')
  }

  assertReportedTypes(report.issues, expected)

  const lineIndexes = new Map<string, LineIndex>()
  const indexFor = async (file: string): Promise<LineIndex> => {
    const cached = lineIndexes.get(file)
    if (cached !== undefined) return cached
    const index = createLineIndex(await readFile(join(rootDir, file), 'utf8'))
    lineIndexes.set(file, index)
    return index
  }

  for (const entry of report.issues) {
    const file = toRepoRelative(entry.file, rootDir)
    for (const issueType of KNIP_ISSUE_TYPES) {
      if (!isSurfacedIssueType(issueType)) continue
      const items = entry[issueType]
      if (items === undefined) continue

      for (const item of flatten(items)) {
        let range = { start: 0, end: 0 }
        if (item.line !== undefined && item.col !== undefined) {
          const index = await indexFor(file)
          const start = index.offsetAt({ line: item.line, column: item.col })
          range = { start, end: index.offsetAt({ line: item.line, column: item.col + 1 }) }
        }

        yield {
          engineRuleId: issueType,
          message: DESCRIBE[issueType](item),
          severity: 'warning',
          file,
          range,
        }
      }
    }
  }
}

const flatten = (items: KnipItem[] | KnipItem[][]): KnipItem[] =>
  items.flatMap((item) => (Array.isArray(item) ? item : [item]))

function assertReportedTypes(entries: readonly KnipEntry[], expected?: { issueTypes: readonly string[] }): void {
  const first = entries[0]
  if (expected === undefined || first === undefined) return

  const known = new Set<string>(KNIP_ISSUE_TYPES)
  const reported = Object.keys(first).filter((key) => known.has(key)).sort()
  const wanted = [...expected.issueTypes].sort()
  if (reported.join(',') === wanted.join(',')) return

  throw new EngineError(
    'knip',
    `expected knip to report [${wanted.join(', ')}], it reported [${reported.join(', ')}]. ` +
      'The materialised config is not selecting exactly the elected ruleset.',
  )
}
