import { expect, test } from 'vitest'
import type { ConceptId } from '../concepts/catalogue.ts'
import { refuseEnable } from './warrant.ts'
import type { EnabledLevel, FrameworkEvidence } from './types.ts'

const evidence: readonly FrameworkEvidence[] = [
  { kind: 'manifest-dependency', file: 'package.json', workspace: '', name: 'next', field: 'dependencies' },
]

const enable = (level: EnabledLevel, findings: number, falsePositives: number) =>
  ({
    kind: 'enable-concept',
    concept: 'suspicious.no-unstable-nested-components' as ConceptId,
    level,
    reason: 'why',
    measured: { repository: 'a real one', findings, falsePositives },
  }) as const

test('accepts an `error` addition measured with no false positive', () => {
  expect(refuseEnable(enable('error', 35, 0), evidence)).toBeNull()
})

test('refuses an `error` addition with even one measured false positive', () => {
  const refusal = refuseEnable(enable('error', 100, 1), evidence)
  expect(refusal).toContain('`error`')
  expect(refusal).toContain('1 of 100')
})

test('accepts that same measurement at `warn`, which no run fails on without --max-warnings', () => {
  expect(refuseEnable(enable('warn', 100, 1), evidence)).toBeNull()
})

test('refuses a `warn` addition whose findings are not mostly true', () => {
  expect(refuseEnable(enable('warn', 8, 4), evidence)).toContain('4 of 8')
})

test('accepts a `warn` addition one finding the right side of that line', () => {
  expect(refuseEnable(enable('warn', 9, 4), evidence)).toBeNull()
})

test('refuses an addition measured at zero findings, which measured nothing', () => {
  expect(refuseEnable(enable('warn', 0, 0), evidence)).toContain('never fired')
})

test('refuses an incoherent measurement claiming more false positives than findings', () => {
  expect(refuseEnable(enable('warn', 3, 4), evidence)).toContain('more false positives')
})

test('refuses any addition from a profile that applied without evidence', () => {
  expect(refuseEnable(enable('warn', 35, 0), [])).toContain('no evidence')
})
