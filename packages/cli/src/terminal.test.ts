import { afterEach, beforeEach, expect, test } from 'vitest'
import { supportsColor, supportsUnicode } from './terminal.ts'

let original: { NO_COLOR: string | undefined; FORCE_COLOR: string | undefined; TERM: string | undefined }

beforeEach(() => {
  original = { NO_COLOR: process.env['NO_COLOR'], FORCE_COLOR: process.env['FORCE_COLOR'], TERM: process.env['TERM'] }
})

afterEach(() => {
  for (const key of ['NO_COLOR', 'FORCE_COLOR', 'TERM'] as const) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

test('nO_COLOR disables colour regardless of TTY status', () => {
  process.env['NO_COLOR'] = '1'
  delete process.env['FORCE_COLOR']
  expect(supportsColor()).toBe(false)
})

test('fORCE_COLOR enables colour even when not a TTY', () => {
  delete process.env['NO_COLOR']
  process.env['FORCE_COLOR'] = '1'
  expect(supportsColor()).toBe(true)
})

test('nO_COLOR takes precedence over FORCE_COLOR', () => {
  process.env['NO_COLOR'] = '1'
  process.env['FORCE_COLOR'] = '1'
  expect(supportsColor()).toBe(false)
})

test('tERM=dumb disables unicode', () => {
  process.env['TERM'] = 'dumb'
  expect(supportsUnicode()).toBe(false)
})

test('any TERM other than dumb keeps unicode on', () => {
  process.env['TERM'] = 'xterm-256color'
  expect(supportsUnicode()).toBe(true)
})
