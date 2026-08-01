import { expect, test } from 'vitest'
import { createOscillationLedger } from './oscillation.ts'
import { encodeUtf8 } from './apply.ts'

const bytes = encodeUtf8

test('a buffer that keeps changing never reports oscillation', () => {
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('v0'))

  expect(ledger.record('src/a.ts', bytes('v1'), ['oxlint/a'])).toBeNull()
  expect(ledger.record('src/a.ts', bytes('v2'), ['oxlint/b'])).toBeNull()
  expect(ledger.record('src/a.ts', bytes('v3'), ['oxlint/c'])).toBeNull()
})

test('a two-rule cycle back to the original buffer reports both rules', () => {
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('const a = 1'))

  expect(ledger.record('src/a.ts', bytes('const a: number = 1'), ['oxlint/add-type'])).toBeNull()
  const repeat = ledger.record('src/a.ts', bytes('const a = 1'), ['oxlint/drop-type'])

  expect(repeat).not.toBeNull()
  expect(repeat?.rules).toEqual(['oxlint/add-type', 'oxlint/drop-type'])
})

test('a cycle that does not reach the original still names every rule inside the loop', () => {
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('v0'))

  ledger.record('src/a.ts', bytes('v1'), ['oxlint/first'])
  ledger.record('src/a.ts', bytes('v2'), ['oxlint/a'])
  const repeat = ledger.record('src/a.ts', bytes('v1'), ['oxlint/b'])

  // `oxlint/first` produced v1 before the loop began and is not part of the fight; the two rules
  // trading v1 and v2 between them are.
  expect(repeat?.rules).toEqual(['oxlint/a', 'oxlint/b'])
})

test('rules are reported deduplicated and sorted, not in application order', () => {
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('v0'))

  ledger.record('src/a.ts', bytes('v1'), ['oxlint/zeta', 'oxlint/alpha'])
  const repeat = ledger.record('src/a.ts', bytes('v0'), ['oxlint/zeta'])

  expect(repeat?.rules).toEqual(['oxlint/alpha', 'oxlint/zeta'])
})

test('two files with identical content do not contaminate each other', () => {
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('same'))
  ledger.seed('src/b.ts', bytes('same'))

  expect(ledger.record('src/a.ts', bytes('changed'), ['oxlint/a'])).toBeNull()
  expect(ledger.record('src/b.ts', bytes('changed'), ['oxlint/b'])).toBeNull()
})

test('a repeat is reported once; the file is expected to stop being fixed after it', () => {
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('v0'))
  ledger.record('src/a.ts', bytes('v1'), ['oxlint/a'])

  expect(ledger.record('src/a.ts', bytes('v0'), ['oxlint/b'])).not.toBeNull()
  expect(ledger.isStopped('src/a.ts')).toBe(true)
  expect(ledger.isStopped('src/b.ts')).toBe(false)
})

test('recording a file that was never seeded throws rather than guessing its start state', () => {
  const ledger = createOscillationLedger()
  expect(() => ledger.record('src/a.ts', bytes('v1'), ['oxlint/a'])).toThrow(/seed/i)
})

test('a buffer identical to the previous pass is a repeat of the immediately preceding state', () => {
  // Not a rule fight — an engine re-reporting a fix that changes nothing. It is still a fixed point
  // the loop must not spin on, and naming the rule that produced it is the actionable answer.
  const ledger = createOscillationLedger()
  ledger.seed('src/a.ts', bytes('v0'))

  const repeat = ledger.record('src/a.ts', bytes('v0'), ['oxlint/noop'])
  expect(repeat?.rules).toEqual(['oxlint/noop'])
})
