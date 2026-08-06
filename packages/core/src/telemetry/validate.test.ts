import { expect, test } from 'vitest'
import { validateTelemetryPayload } from './validate.ts'

const valid = (): Record<string, unknown> => ({
  schema: 1,
  run: '7f1b73c0-0000-4000-8000-000000000000',
  project: 'a2c4e6f8-0000-4000-8000-000000000000',
  slopGate: '0.2.0',
  node: '24',
  platform: 'linux',
  ci: false,
  durationMs: 3421,
  filesScanned: 427,
  filesAnalysed: 380,
  engines: [{ id: 'oxlint', version: null, ran: true }],
  rules: [{ rule: 'oxlint/no-shadow', findings: 12, suppressed: 2, baselined: 0, generated: 0 }],
  disabledConcepts: ['slop.double-cast'],
  preset: 'recommended',
  baseline: false,
})

const expectRejected = (mutate: (payload: Record<string, unknown>) => void, why: string) => {
  const payload = valid()
  mutate(payload)
  expect(validateTelemetryPayload(payload).ok, why).toBe(false)
}

test('a real payload passes', () => {
  expect(validateTelemetryPayload(valid()).ok).toBe(true)
  expect(validateTelemetryPayload({ ...valid(), project: null }).ok).toBe(true)
})

test('a rule id that is not in our registry is refused', () => {
  // The strongest check available: fabricating traffic means using our vocabulary, not arbitrary JSON.
  expectRejected((p) => {
    p['rules'] = [{ rule: 'evil/made-up', findings: 1, suppressed: 0, baselined: 0, generated: 0 }]
  }, 'unknown rule')
  expectRejected((p) => {
    p['disabledConcepts'] = ['not.a-concept']
  }, 'unknown concept')
  expectRejected((p) => {
    p['engines'] = [{ id: 'attacker', version: null, ran: true }]
  }, 'unknown engine')
})

test('an unknown key is refused rather than ignored', () => {
  // Ignoring it is how a field gets smuggled past a validator that only checks the ones it knows.
  expectRejected((p) => {
    p['note'] = 'https://example.test/pwned'
  }, 'top level')
  expectRejected((p) => {
    p['rules'] = [{ rule: 'oxlint/no-shadow', findings: 1, suppressed: 0, baselined: 0, generated: 0, path: '/etc/passwd' }]
  }, 'inside a rule')
})

test('counts must be whole, non-negative and bounded', () => {
  for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 9e15, '12', null]) {
    expectRejected((p) => {
      p['filesScanned'] = bad
    }, `filesScanned ${String(bad)}`)
  }
  expectRejected((p) => {
    p['rules'] = [{ rule: 'oxlint/no-shadow', findings: 9e12, suppressed: 0, baselined: 0, generated: 0 }]
  }, 'findings over the bound')
})

test('a payload that could not describe a real run is refused', () => {
  // Internal consistency is cheap to check and forces generated traffic to model a run.
  expectRejected((p) => {
    p['filesAnalysed'] = 999
    p['filesScanned'] = 10
  }, 'analysed exceeds scanned')
  expectRejected((p) => {
    p['durationMs'] = 1000 * 60 * 60 * 48
  }, 'a two-day run')
})

test('identifiers must be UUIDs and versions must be versions', () => {
  expectRejected((p) => {
    p['run'] = 'not-a-uuid'
  }, 'run')
  expectRejected((p) => {
    p['project'] = '../../etc/passwd'
  }, 'project')
  expectRejected((p) => {
    p['slopGate'] = '0.2.0; DROP TABLE reports'
  }, 'version')
  expectRejected((p) => {
    p['node'] = 'v24.19.0'
  }, 'a full node version where a major belongs')
  expectRejected((p) => {
    p['platform'] = 'plan9'
  }, 'platform')
  expectRejected((p) => {
    p['preset'] = 'whatever'
  }, 'preset')
})

test('the same rule twice is refused, so one sender cannot multiply its own weight in a row', () => {
  expectRejected((p) => {
    p['rules'] = [
      { rule: 'oxlint/no-shadow', findings: 1, suppressed: 0, baselined: 0, generated: 0 },
      { rule: 'oxlint/no-shadow', findings: 1, suppressed: 0, baselined: 0, generated: 0 },
    ]
  }, 'duplicate rule')
})

test('nothing but an object gets past the front door', () => {
  for (const bad of [null, undefined, 42, 'x', [], true]) {
    expect(validateTelemetryPayload(bad).ok, String(bad)).toBe(false)
  }
})

test('a rejection says little, because a precise one teaches an attacker how to pass', () => {
  const result = validateTelemetryPayload({ ...valid(), platform: 'plan9' })
  expect(result).toMatchObject({ ok: false })
  expect(result.ok ? '' : result.reason).toMatch(/^.{1,40}$/)
})
