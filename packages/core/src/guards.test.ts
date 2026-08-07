import { expect, test } from 'vitest'
import { isOneOf } from './guards.ts'

const LEVELS = ['off', 'info', 'warn', 'error'] as const

test('membership is decided on the value, not on its declared type', () => {
  expect(isOneOf('warn', LEVELS)).toBe(true)
  expect(isOneOf('WARN', LEVELS)).toBe(false)
  expect(isOneOf('', LEVELS)).toBe(false)
  expect(isOneOf('warning', LEVELS)).toBe(false)
  expect(isOneOf('anything', [])).toBe(false)
})

test('the checked branch is narrowed, which is the whole point', () => {
  const raw = 'error'
  if (!isOneOf(raw, LEVELS)) throw new Error('unreachable')
  const level: (typeof LEVELS)[number] = raw
  expect(level).toBe('error')
})
