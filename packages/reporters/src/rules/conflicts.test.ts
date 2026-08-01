import type { RulesConflicts } from '@misaon/slop-gate-core'
import { expect, test } from 'vitest'
import { hasWideOrFullwidthCharacter } from '../display-width.ts'
import { renderRulesConflictsJson, renderRulesConflictsPretty, RULES_CONFLICTS_JSON_VERSION } from './conflicts.ts'
import type { RulesReporterContext } from './context.ts'

const capture = (conflicts: RulesConflicts, contextOver: Partial<RulesReporterContext> = {}): string => {
  let output = ''
  const context: RulesReporterContext = { write: (chunk) => (output += chunk), color: false, unicode: true, width: 80, version: '0.0.0', ...contextOver }
  renderRulesConflictsPretty(conflicts, context)
  return output
}

test('says so plainly when there is nothing to report', () => {
  const output = capture({ suppressed: [], deadOverrides: [] })
  expect(output).toMatch(/no rule overlaps or dead overrides/i)
})

test('lists a suppressed overlap with its winner and reason', () => {
  const output = capture({
    suppressed: [
      {
        concept: 'dead-code.unused-variable',
        languages: ['ts'],
        winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
        suppressed: { engine: 'eslint', engineRuleId: '@typescript-eslint/no-unused-vars' },
        reason: 'lower-tier',
      },
    ],
    deadOverrides: [],
  })

  expect(output).toContain('dead-code.unused-variable')
  expect(output).toContain('oxlint/no-unused-vars')
  expect(output).toContain('eslint/@typescript-eslint/no-unused-vars')
  expect(output).toContain('lower-tier')
})

test('groups multiple suppressions for the same concept under one winner', () => {
  const output = capture({
    suppressed: [
      { concept: 'style.no-var', languages: ['ts'], winner: { engine: 'oxlint', engineRuleId: 'a' }, suppressed: { engine: 'astgrep', engineRuleId: 'b' }, reason: 'engine-preference' },
      { concept: 'style.no-var', languages: ['ts'], winner: { engine: 'oxlint', engineRuleId: 'a' }, suppressed: { engine: 'knip', engineRuleId: 'c' }, reason: 'lower-tier' },
    ],
    deadOverrides: [],
  })

  expect(output.match(/style\.no-var/g)).toHaveLength(1)
  expect(output).toContain('astgrep/b')
  expect(output).toContain('knip/c')
})

test('lists a dead override with the same message text check itself uses', () => {
  const output = capture({ suppressed: [], deadOverrides: ['oxlint/no-such-rule'] })
  expect(output).toContain('oxlint/no-such-rule')
  expect(output).toContain('does not name a known concept or a rule any engine provides')
})

test('summarises overlap and dead-override counts in the footer', () => {
  const output = capture({
    suppressed: [{ concept: 'a', languages: ['ts'], winner: { engine: 'oxlint', engineRuleId: 'x' }, suppressed: { engine: 'eslint', engineRuleId: 'y' }, reason: 'lower-tier' }],
    deadOverrides: ['oxlint/no-such-rule'],
  })
  expect(output).toMatch(/1 rule overlap/)
  expect(output).toMatch(/1 dead override/)
})

test('never puts a wide or fullwidth character in a framed line', () => {
  const busy: RulesConflicts = {
    suppressed: [{ concept: 'a', languages: ['ts'], winner: { engine: 'oxlint', engineRuleId: 'x' }, suppressed: { engine: 'eslint', engineRuleId: 'y' }, reason: 'lower-tier' }],
    deadOverrides: ['oxlint/no-such-rule'],
  }
  const outputs = [capture({ suppressed: [], deadOverrides: [] }), capture(busy)]

  for (const output of outputs) {
    const framedLines = output.split('\n').filter((line) => /^ {2}[│╭╰]/.test(line))
    expect(framedLines.length).toBeGreaterThan(0)
    for (const line of framedLines) expect(hasWideOrFullwidthCharacter(line), line).toBe(false)
  }
})

test('json output is versioned and carries both fields', () => {
  let output = ''
  const context: RulesReporterContext = { write: (chunk) => (output += chunk), color: false, unicode: true, width: 80, version: '0.0.0' }
  const conflicts: RulesConflicts = { suppressed: [], deadOverrides: ['oxlint/no-such-rule'] }
  renderRulesConflictsJson(conflicts, context)

  const parsed = JSON.parse(output) as { version: number; deadOverrides: string[] }
  expect(parsed.version).toBe(RULES_CONFLICTS_JSON_VERSION)
  expect(parsed.deadOverrides).toEqual(['oxlint/no-such-rule'])
})
