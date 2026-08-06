import { expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import type { CheckResult } from '../run/check.ts'
import { buildTelemetryPayload, TELEMETRY_SCHEMA_VERSION, type TelemetryContext } from './payload.ts'

/** Strings that must never leave a machine. Each is planted somewhere a run would carry it. */
const SECRETS = {
  path: '/home/alice/work/acme-payments/src/billing/charge-customer.ts',
  message: 'Type `CardNumber` is not assignable to `string` in chargeCustomer',
  source: 'const apiKey = "sk_live_51H8xQ2eZvKYlo2C"',
  help: 'Rename `acmeInternalSecret` to something else',
  docs: 'https://git.acme-internal.example/rules/no-secrets',
  reason: 'ignored because the acme-payments migration is not finished',
} as const

const diagnostic = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  concept: 'slop.as-any-cast',
  ruleRefKey: 'oxlint/typescript/no-explicit-any',
  engine: 'oxlint',
  severity: 'warn',
  message: SECRETS.message,
  file: SECRETS.path,
  range: { start: 0, end: 1 },
  position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
  help: SECRETS.help,
  docsUrl: SECRETS.docs,
  fingerprint: 'abc',
  ...over,
})

const result = (over: Partial<CheckResult> = {}): CheckResult => ({
  diagnostics: [diagnostic(), diagnostic({ file: '/home/alice/other.ts', fingerprint: 'def' })],
  counts: { error: 0, warn: 2, info: 0 },
  engineFailures: [],
  unavailableEngines: [],
  baseline: null,
  stats: {
    filesScanned: 427,
    filesAnalysed: 380,
    filesFromCache: 12,
    cacheByEngine: [
      { engine: 'oxlint', filesAssigned: 380, filesFromCache: 12 },
      { engine: 'astgrep', filesAssigned: 380, filesFromCache: 12 },
    ],
    enginesRun: 2,
    durationMs: 3421.7,
  },
  dropped: {
    inline: { 'oxlint/vitest/valid-title': 3 },
    baseline: { 'oxlint/no-shadow': 7 },
    generated: { 'oxlint/no-unused-vars': 11 },
  },
  ruleset: { enabledConcepts: 349, overlaps: 0, uncovered: [], unknownKeys: [] },
  ...over,
})

const context: TelemetryContext = {
  run: '7f1b73c0-0000-4000-8000-000000000000',
  project: 'a2c4e6f8-0000-4000-8000-000000000000',
  slopGate: '0.2.0',
  nodeVersion: 'v24.19.0',
  platform: 'linux',
  ci: true,
  preset: 'recommended',
  disabledConcepts: ['slop.double-cast'],
}

test('nothing a run knows about the code reaches the payload', () => {
  const serialised = JSON.stringify(buildTelemetryPayload(result(), context))

  for (const [what, secret] of Object.entries(SECRETS)) {
    expect(serialised, `${what} leaked`).not.toContain(secret)
  }
  // Also the fragments, in case a field ever carries a prefix rather than the whole string.
  for (const fragment of ['alice', 'acme', 'billing', 'sk_live', 'CardNumber', 'charge-customer']) {
    expect(serialised.toLowerCase(), `${fragment} leaked`).not.toContain(fragment.toLowerCase())
  }
})

test('every value is a count, a boolean or a string from a known vocabulary', () => {
  // The redaction test above only catches secrets someone thought to plant. This one catches a new
  // field of the wrong *kind* — a free string is where a leak would arrive next. Round-tripped through
  // JSON on purpose: what matters is the shape that goes over the wire, not the shape in memory.
  const payload = JSON.parse(JSON.stringify(buildTelemetryPayload(result(), context))) as Record<string, unknown>
  const allowedStrings = new Set(['schema', 'run', 'project', 'slopGate', 'node', 'platform', 'preset'])

  const unexpected = Object.entries(payload).flatMap(([key, value]) => {
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return []
    if (typeof value === 'string') return allowedStrings.has(key) ? [] : [`free string: ${key}`]
    return Array.isArray(value) ? [] : [`object: ${key}`]
  })
  expect(unexpected).toEqual([])

  // Rule and concept identifiers are the only strings inside the arrays, and they come from our own
  // registry rather than from the repository.
  const rules = payload['rules'] as { rule: string }[]
  const concepts = payload['disabledConcepts'] as string[]
  expect(rules.map((entry) => entry.rule).filter((rule) => !/^[a-z-]+\/[\w./-]+$/.test(rule))).toEqual([])
  expect(concepts.filter((concept) => !/^[a-z-]+\.[a-z-]+$/.test(concept))).toEqual([])
})

test('the false-positive signals are separated, because they mean different things', () => {
  const payload = buildTelemetryPayload(result(), context)
  const byRule = new Map(payload.rules.map((entry) => [entry.rule, entry]))

  expect(byRule.get('oxlint/vitest/valid-title')?.suppressed).toBe(3)
  expect(byRule.get('oxlint/no-shadow')?.baselined).toBe(7)
  // A generated file is a correct skip, not a false positive, and must not be summed with one.
  expect(byRule.get('oxlint/no-unused-vars')?.generated).toBe(11)
  expect(byRule.get('oxlint/no-unused-vars')?.suppressed).toBe(0)
})

test('the node version is reported as a major, not a build', () => {
  // `v24.19.0` on a machine nobody else shares is close to a fingerprint.
  expect(buildTelemetryPayload(result(), context).node).toBe('24')
})

test('a payload is stable enough to diff between two identical runs', () => {
  const first = buildTelemetryPayload(result(), context)
  const second = buildTelemetryPayload(result(), context)
  expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  expect(first.schema).toBe(TELEMETRY_SCHEMA_VERSION)
})
