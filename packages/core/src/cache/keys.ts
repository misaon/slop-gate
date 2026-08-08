import { createHash } from 'node:crypto'
import { compareStrings } from '../ordering.ts'

export const RESULT_SCHEMA_VERSION = 2

export function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)

  return `{${entries.join(',')}}`
}

export function hashJson(value: unknown): string {
  return hashContent(stableStringify(value))
}

export function hashRuleSelection(ruleRefKeys: Iterable<string>): string {
  return hashJson([...ruleRefKeys].sort(compareStrings))
}

export type ResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  filePath: string
  fileHash: string
  configHash: string
}

export function deriveResultKey(input: ResultKeyInput): string {
  return hashJson({ schema: RESULT_SCHEMA_VERSION, input })
}

export type ProjectResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  configHash: string
  files: readonly { path: string; hash: string }[]
}

export function deriveProjectResultKey(input: ProjectResultKeyInput): string {
  const sortedFiles = [...input.files].sort((a, b) => compareStrings(a.path, b.path))
  return hashJson({ schema: RESULT_SCHEMA_VERSION, input: { ...input, files: sortedFiles } })
}
