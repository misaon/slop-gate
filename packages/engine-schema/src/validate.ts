// Both imports are shaped by CommonJS interop rather than preference, and both were verified against
// plain `node` as well as the test runner — vitest is more forgiving here than Node is, so a form that
// only passes under vitest would fail in the published package.
//
// `Ajv2020` is imported by name: the default export of `ajv/dist/2020.js` is the CJS `module.exports`
// object under `nodenext`, which is not constructable. `ajv-formats` declares `export default` from a
// CommonJS package, so the callable lives at `.default` for TypeScript while Node hands back the
// function itself — reaching through `.default` is the one spelling that is correct for both.
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import { isMap, isPair, isScalar, type Document, type Node } from 'yaml'
import type { SchemaBinding } from './catalogue.ts'
import type { YamlDocument } from './yaml.ts'

export type SchemaFinding = {
  readonly message: string
  /** The JSON pointer the surviving ajv error reported, kept so a test can assert *which* error won. */
  readonly pointer: string
  /** Offsets into the source string (UTF-16 code units), matching `YamlFinding`. */
  readonly offset: number
  readonly endOffset: number
}

export type SchemaValidator = (binding: SchemaBinding, document: YamlDocument) => readonly SchemaFinding[]

/**
 * A validator over the vendored schemas, compiling each one at most once for the life of the engine.
 *
 * `strict: false` is required, not a convenience: the Compose specification uses keywords ajv's strict
 * mode rejects outright, and a linter that refuses to load its own schema is worse than one with a
 * permissive loader. `allErrors` is on so that two unrelated typos in one file are two findings —
 * without it ajv stops at the first, and a user fixing a compose file would need one run per mistake.
 */
export function createSchemaValidator(): SchemaValidator {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormatsModule.default(ajv)
  const compiled = new Map<string, ValidateFunction>()

  return (binding, document) => {
    const validate = compiled.get(binding.id) ?? ajv.compile(binding.schema)
    compiled.set(binding.id, validate)

    if (validate(document.value) === true) return []
    return collapse(validate.errors ?? []).map((error) => toFinding(error, binding, document.document))
  }
}

/**
 * One ajv error per logical defect.
 *
 * ajv with `allErrors` does not report mistakes, it reports *every schema keyword that failed*, and
 * for a schema as `oneOf`-heavy as the Compose specification those are wildly different counts. A
 * single bad `depends_on.condition` produces three errors: the `enum` that actually failed, a `type`
 * error from the sibling branch that models `depends_on` as a list, and the `oneOf` recording that
 * neither branch matched. Reported verbatim, one typo becomes three findings pointing at two places,
 * two of which name a level of the schema the user never wrote.
 *
 * Two rules, applied in order, and between them they collapsed all ten seeded defects in
 * `validate.test.ts` to exactly one finding each:
 *
 * 1. **Prefer specific keywords over structural ones.** At a given location, `oneOf`/`anyOf` is the
 *    umbrella under which a real error was already reported; drop it if anything else survives there.
 * 2. **Prefer the deepest location.** An error at `/services/web/depends_on` is the same defect as the
 *    one at `/services/web/depends_on/db/condition`, described from further away. Keeping the deeper
 *    one is what makes the finding point at the token the user has to edit.
 */
function collapse(errors: readonly ErrorObject[]): ErrorObject[] {
  // `if`/`then`/`else` never describe a user-visible defect; they report which conditional branch the
  // schema took on the way to a real error reported elsewhere.
  const meaningful = errors.filter((error) => !['if', 'then', 'else'].includes(error.keyword))
  if (meaningful.length === 0) return []

  const byLocation = new Map<string, ErrorObject[]>()
  for (const error of meaningful) {
    const location = locationOf(error)
    const existing = byLocation.get(location)
    if (existing === undefined) byLocation.set(location, [error])
    else existing.push(error)
  }

  const locations = [...byLocation.keys()]
  const kept: ErrorObject[] = []
  for (const [location, group] of byLocation) {
    // Rule 2: something more specific was reported underneath this location, so this one is that
    // same defect seen from further out.
    if (locations.some((other) => other !== location && other.startsWith(`${location}/`))) continue
    // Rule 1: structural keywords only survive when nothing more concrete failed here.
    const specific = group.filter((error) => !['oneOf', 'anyOf'].includes(error.keyword))
    kept.push((specific.length > 0 ? specific : group)[0]!)
  }
  return kept
}

/**
 * Where an error *is*, which for `additionalProperties` is not where ajv says it is: the reported
 * `instancePath` is the containing object, and the offending key is in `params.additionalProperty`.
 * Folding it into the location here is what lets two unrelated typos in one mapping stay two findings
 * rather than collapsing into one, and what lets the range land on the misspelling.
 */
function locationOf(error: ErrorObject): string {
  const extra = error.params?.['additionalProperty']
  return typeof extra === 'string' ? `${error.instancePath}/${escapePointer(extra)}` : error.instancePath
}

function toFinding(error: ErrorObject, binding: SchemaBinding, document: Document): SchemaFinding {
  const pointer = locationOf(error)
  const extra = error.params?.['additionalProperty']
  const message =
    typeof extra === 'string'
      ? `\`${extra}\` is not a property the ${binding.title} defines here.`
      : `${describe(pointer)} ${error.message ?? 'is invalid'} (${binding.title}).`

  return { message, pointer, ...rangeOf(document, pointer) }
}

function describe(pointer: string): string {
  const segments = pointer.split('/').filter((segment) => segment.length > 0)
  return segments.length === 0 ? 'The document' : `\`${segments.map(unescapePointer).join('.')}\``
}

/**
 * The source range for a JSON pointer.
 *
 * Points at the **key**, not the value, whenever the pointer names a mapping entry: `ports: 8080` is
 * reported against `ports`, because that is the token a reader scans for and the one whose spelling
 * may itself be the defect. Falls back to the value node, then to the document start — a pointer the
 * parser cannot resolve must still yield a usable finding rather than an exception.
 */
function rangeOf(document: Document, pointer: string): { offset: number; endOffset: number } {
  const segments = pointer.split('/').filter((segment) => segment.length > 0).map(unescapePointer)
  if (segments.length === 0) return { offset: 0, endOffset: 0 }

  const parentPath = segments.slice(0, -1)
  const last = segments.at(-1)!
  const parent = parentPath.length === 0 ? document.contents : (document.getIn(parentPath, true) as Node | undefined)

  if (isMap(parent)) {
    const pair = parent.items.find((item) => isPair(item) && isScalar(item.key) && String(item.key.value) === last)
    const key = isPair(pair) ? pair.key : undefined
    if (isScalar(key) && key.range != null) return { offset: key.range[0], endOffset: key.range[1] }
  }

  const node = document.getIn(segments, true) as Node | undefined
  if (node?.range != null) return { offset: node.range[0], endOffset: node.range[1] }
  return { offset: 0, endOffset: 0 }
}

const escapePointer = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1')
const unescapePointer = (segment: string): string => segment.replaceAll('~1', '/').replaceAll('~0', '~')
