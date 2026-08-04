import { LineCounter, isAlias, isCollection, isScalar, parseAllDocuments, visit, type Document } from 'yaml'

export type YamlRuleId = 'parse-error' | 'duplicate-mapping-key'

export type YamlFinding = {
  readonly rule: YamlRuleId
  readonly message: string
  readonly offset: number
  readonly endOffset: number
}

export type YamlDocument = {
  readonly value: unknown
  readonly document: Document
}

export type YamlInspection = {
  readonly findings: readonly YamlFinding[]
  readonly documents: readonly YamlDocument[]
  readonly lineCounter: LineCounter
}

export function inspectYaml(source: string): YamlInspection {
  const lineCounter = new LineCounter()
  const findings: YamlFinding[] = []
  const documents: YamlDocument[] = []

  let parsed: Document[]
  try {
    parsed = parseAllDocuments(source, { lineCounter, logLevel: 'error' })
  } catch (error) {
    return {
      findings: [{ rule: 'parse-error', message: messageOf(error), offset: 0, endOffset: 0 }],
      documents: [],
      lineCounter,
    }
  }

  for (const document of parsed) {
    findings.push(...documentFindings(document))

    if (document.errors.some((error) => error.code !== 'DUPLICATE_KEY')) continue
    let value: unknown
    try {
      value = document.toJS()
    } catch {
      continue
    }
    if (value === null || value === undefined) continue
    documents.push({ value, document })
  }

  return { findings, documents, lineCounter }
}

function documentFindings(document: Document): YamlFinding[] {
  const findings: YamlFinding[] = []
  let malformed: YamlFinding | undefined

  for (const error of document.errors) {
    if (error.code === 'DUPLICATE_KEY') {
      const key = keyAt(document, error.pos[0])
      findings.push({
        rule: 'duplicate-mapping-key',
        message: `Duplicate mapping key \`${key?.text ?? '?'}\`: the earlier value is silently discarded.`,
        offset: error.pos[0],
        endOffset: key?.end ?? error.pos[1],
      })
      continue
    }
    malformed ??= {
      rule: 'parse-error',
      message: firstLine(error.message),
      offset: error.pos[0],
      endOffset: error.pos[1],
    }
  }

  malformed ??= unresolvedAlias(document)
  if (malformed !== undefined) findings.push(malformed)
  return findings
}

function unresolvedAlias(document: Document): YamlFinding | undefined {
  const defined = new Set<string>()
  let found: YamlFinding | undefined

  visit(document, {
    Node(_key, node) {
      if (found !== undefined) return visit.BREAK
      if ((isScalar(node) || isCollection(node)) && typeof node.anchor === 'string') defined.add(node.anchor)
      if (isAlias(node) && !defined.has(node.source)) {
        const [start, end] = node.range ?? [0, 0]
        found = {
          rule: 'parse-error',
          message: `Unresolved alias \`*${node.source}\`: no anchor \`&${node.source}\` is defined before it.`,
          offset: start,
          endOffset: end,
        }
        return visit.BREAK
      }
      return undefined
    },
  })

  return found
}

function keyAt(document: Document, offset: number): { text: string; end: number } | undefined {
  let found: { text: string; end: number } | undefined
  visit(document, {
    Pair(_index, pair) {
      const key = pair.key
      if (!isScalar(key) || key.range?.[0] !== offset) return undefined
      found = { text: String(key.value), end: key.range[1] }
      return visit.BREAK
    },
  })
  return found
}

function firstLine(message: string): string {
  const line = (message.split('\n')[0]?.trim() ?? message).replace(/:$/, '')
  return line.endsWith('.') ? line : `${line}.`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? firstLine(error.message) : 'The document could not be parsed.'
}
