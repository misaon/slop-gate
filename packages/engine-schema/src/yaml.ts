import { LineCounter, isAlias, isCollection, isScalar, parseAllDocuments, visit, type Document } from 'yaml'

export type YamlRuleId = 'parse-error' | 'duplicate-mapping-key'

export type YamlFinding = {
  readonly rule: YamlRuleId
  readonly message: string
  /** Offsets into the **source string** (UTF-16 code units), not bytes. `index.ts` converts. */
  readonly offset: number
  readonly endOffset: number
}

export type YamlDocument = {
  readonly value: unknown
  readonly document: Document
}

export type YamlInspection = {
  readonly findings: readonly YamlFinding[]
  /** Only documents that resolved to a value. A schema cannot be violated by nothing. */
  readonly documents: readonly YamlDocument[]
  readonly lineCounter: LineCounter
}

/**
 * Every structural check this engine makes about a YAML file itself, as opposed to what the file
 * *means* (which is `validate.ts`'s job, and only for files a schema is bound to).
 *
 * **`parseAllDocuments`, never `parseDocument`.** This is the single most consequential line in the
 * package. `parseDocument` reports `MULTIPLE_DOCS` as a parse *error*, and multi-document YAML is
 * both legal and ubiquitous — every Kubernetes manifest in the corpus is one — so an implementation
 * built on `parseDocument` would report a syntax error for the most ordinary file in a large class of
 * repositories. Confirmed both ways against `yaml` 2.9.0.
 *
 * Measured over 826 YAML files from four unrelated repositories (docker/awesome-compose,
 * kubernetes/examples, actions/starter-workflows, prometheus/prometheus): six findings, all
 * `duplicate-mapping-key`, and every one a genuine defect on inspection — two of them discarding a
 * *different* value (`prometheus`'s own `section_key_dup.bad.yml`, a deliberate invalid fixture, and
 * a Kubernetes secret declaring `type` twice), the rest redundant re-declarations. Zero
 * `parse-error`. That is 6/6 true positives and 0 false positives, which is what puts both
 * rules at `error` and in `recommended`.
 */
export function inspectYaml(source: string): YamlInspection {
  const lineCounter = new LineCounter()
  const findings: YamlFinding[] = []
  const documents: YamlDocument[] = []

  let parsed: Document[]
  try {
    // `logLevel: 'error'` suppresses the `yaml` package's own `process.emitWarning` calls without
    // touching `doc.errors`, which stays fully populated (verified for all three levels). Left at the
    // default `'warn'`, a real repository prints Node warnings mid-run — "Keys with collection values
    // will be stringified" fired on six files of the measurement corpus — which reads as slop-gate
    // malfunctioning at something the user cannot act on and did not ask about.
    parsed = parseAllDocuments(source, { lineCounter, logLevel: 'error' })
  } catch (error) {
    // `parseAllDocuments` is documented not to throw — every problem lands in `doc.errors` — but a
    // linter that dies on one unusual file takes the whole run with it, and no engine result is
    // worth that. Reported as a finding at the top of the file rather than swallowed.
    return {
      findings: [{ rule: 'parse-error', message: messageOf(error), offset: 0, endOffset: 0 }],
      documents: [],
      lineCounter,
    }
  }

  for (const document of parsed) {
    findings.push(...documentFindings(document))

    // `toJS` is where an unresolved alias surfaces (it throws a `ReferenceError`); `documentFindings`
    // has already reported that as `parse-error` with a real range, so this only has to avoid
    // propagating the throw.
    //
    // A duplicate key deliberately does **not** disqualify the document: YAML resolves it (last one
    // wins) and the result is exactly what the consuming tool will load, so it is still worth
    // validating against the schema. Skipping it would mean one duplicate key silently suppressing
    // every schema finding in the file — a gap that looks identical to a clean file.
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
      // The parser's own `pos` is a single character at the start of the key. Widening it to the key
      // node's range makes the reported span cover the whole token a reader has to delete, which is
      // what every other engine here reports and what a code frame needs to underline.
      const key = keyAt(document, error.pos[0])
      findings.push({
        rule: 'duplicate-mapping-key',
        message: `Duplicate mapping key \`${key?.text ?? '?'}\`: the earlier value is silently discarded.`,
        offset: error.pos[0],
        endOffset: key?.end ?? error.pos[1],
      })
      continue
    }
    // One per document, deliberately: a single mistake routinely produces a cascade of follow-on
    // parser errors, and restating it five times helps nobody find the one place to edit.
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

/**
 * An alias whose anchor is not defined *earlier in the same document*. Detected by walking the tree
 * rather than by catching `toJS`'s `ReferenceError`, because the walk knows where the alias is and
 * the exception does not — and a parse-class finding with no position is nearly useless in a
 * thousand-line manifest.
 *
 * `visit` traverses in document order, which is exactly the order YAML resolves anchors in, so an
 * alias pointing at an anchor defined further down is correctly reported: that is a genuine error,
 * not a forward reference the parser would tolerate.
 */
function unresolvedAlias(document: Document): YamlFinding | undefined {
  const defined = new Set<string>()
  let found: YamlFinding | undefined

  // `Node`, not `Value`: the `yaml` package's `Value` alias covers Map, Seq and Scalar but
  // deliberately excludes Alias, so a `Value` visitor sees anchors and never sees a single alias.
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

/** The repeated key's own text and extent, read back out of the source token the parser flagged. */
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

/**
 * The parser's message without its code frame.
 *
 * `yaml` formats an error as `<text> at line N, column M:` followed by a blank line and a rendered
 * excerpt. slop-gate draws its own code frame from the reported range, so the excerpt is dropped —
 * and with it the trailing colon that introduced it, which otherwise leaves `...column 1:.` in the
 * output. The position is redundant too, but it is inside the sentence rather than appended to it,
 * and cutting it out would mean rewriting the parser's prose rather than trimming it.
 */
function firstLine(message: string): string {
  const line = (message.split('\n')[0]?.trim() ?? message).replace(/:$/, '')
  return line.endsWith('.') ? line : `${line}.`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? firstLine(error.message) : 'The document could not be parsed.'
}
