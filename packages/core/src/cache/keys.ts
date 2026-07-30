import { createHash } from 'node:crypto'

export const RESULT_SCHEMA_VERSION = 1

export function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)

  return `{${entries.join(',')}}`
}

export function hashJson(value: unknown): string {
  return hashContent(stableStringify(value))
}

export function hashRuleSelection(ruleIds: Iterable<string>): string {
  return hashContent([...ruleIds].sort().join('\0'))
}

export type ResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  fileHash: string
  configHash: string
}

export function deriveResultKey(input: ResultKeyInput): string {
  return hashContent(
    [
      String(RESULT_SCHEMA_VERSION),
      input.engineId,
      input.engineVersion,
      input.engineRulesetHash,
      input.fileHash,
      input.configHash,
    ].join('\0'),
  )
}
