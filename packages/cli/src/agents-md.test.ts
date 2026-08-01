import { expect, test } from 'vitest'
import { upsertAgentsSection } from './agents-md.ts'

const BODY = 'Run `sgate check` before committing.'

test('appends a fenced section to an empty file', () => {
  const output = upsertAgentsSection('', BODY)
  expect(output).toContain('<!-- slop-gate:start -->')
  expect(output).toContain('<!-- slop-gate:end -->')
  expect(output).toContain(BODY)
})

test('preserves existing content when appending', () => {
  const output = upsertAgentsSection('# My project\n\nSome notes.\n', BODY)
  expect(output).toContain('# My project')
  expect(output).toContain('Some notes.')
  expect(output).toContain(BODY)
})

test('replaces an existing section instead of duplicating it', () => {
  const first = upsertAgentsSection('# P\n', 'old body')
  const second = upsertAgentsSection(first, 'new body')

  expect(second.match(/slop-gate:start/g)).toHaveLength(1)
  expect(second).toContain('new body')
  expect(second).not.toContain('old body')
})

test('is idempotent', () => {
  const once = upsertAgentsSection('# P\n', BODY)
  expect(upsertAgentsSection(once, BODY)).toBe(once)
})

test('keeps content that follows the section', () => {
  const withSection = upsertAgentsSection('# P\n', 'old')
  const withTrailer = `${withSection}\n## Later\n\nTrailing.\n`
  const updated = upsertAgentsSection(withTrailer, 'new')

  expect(updated).toContain('## Later')
  expect(updated).toContain('Trailing.')
  expect(updated).toContain('new')
})
