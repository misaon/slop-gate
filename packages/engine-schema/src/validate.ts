import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import { isMap, isPair, isScalar, type Document, type Node } from 'yaml'
import type { SchemaBinding } from './catalogue.ts'
import type { YamlDocument } from './yaml.ts'

export type SchemaFinding = {
  readonly message: string
  readonly pointer: string
  readonly offset: number
  readonly endOffset: number
}

export type SchemaValidator = (binding: SchemaBinding, document: YamlDocument) => readonly SchemaFinding[]

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

function collapse(errors: readonly ErrorObject[]): ErrorObject[] {
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
    if (locations.some((other) => other !== location && other.startsWith(`${location}/`))) continue
    const specific = group.filter((error) => !['oneOf', 'anyOf'].includes(error.keyword))
    kept.push((specific.length > 0 ? specific : group)[0]!)
  }
  return kept
}

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

  return { message, pointer, ...utf16SpanOfPointer(document, pointer) }
}

function describe(pointer: string): string {
  const segments = pointer.split('/').filter((segment) => segment.length > 0)
  return segments.length === 0 ? 'The document' : `\`${segments.map(unescapePointer).join('.')}\``
}

function utf16SpanOfPointer(document: Document, pointer: string): { offset: number; endOffset: number } {
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
