import type { RulesListEntry } from '@misaon/slop-gate-core'
import { expect, test } from 'vitest'
import { hasWideOrFullwidthCharacter } from '../display-width.ts'
import type { RulesReporterContext } from './context.ts'
import { renderRulesListJson, renderRulesListPretty, RULES_LIST_JSON_VERSION } from './list.ts'

const entry = (over: Partial<RulesListEntry> & Pick<RulesListEntry, 'concept' | 'group'>): RulesListEntry => ({
  level: 'warn',
  ownership: [],
  servicedBySlopGate: false,
  uncovered: false,
  languageMismatch: false,
  overlapCount: 0,
  enablement: { enabled: true, level: 'warn', options: [], optionsFrom: undefined, baseProvenance: [{ layer: 'preset', source: 'recommended', setting: 'warn' }], overrides: [] },
  ...over,
})

const capture = (entries: readonly RulesListEntry[], contextOver: Partial<RulesReporterContext> = {}): string => {
  let output = ''
  const context: RulesReporterContext = { write: (chunk) => (output += chunk), color: false, unicode: true, width: 80, version: '0.0.0', ...contextOver }
  renderRulesListPretty(entries, context)
  return output
}

test('renders one row per entry, grouped by concept group, with the owner and level', () => {
  const output = capture([
    entry({ concept: 'correctness.no-debugger', group: 'correctness', level: 'error', ownership: [{ owner: { engine: 'oxlint', engineRuleId: 'no-debugger' }, languages: ['ts'] }] }),
    entry({ concept: 'dead-code.unused-variable', group: 'dead-code', ownership: [{ owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' }, languages: ['ts'] }], overlapCount: 1 }),
  ])

  expect(output).toContain('correctness (1)')
  expect(output).toContain('dead-code (1)')
  expect(output).toContain('correctness.no-debugger')
  expect(output).toContain('oxlint/no-debugger')
  expect(output).toContain('oxlint/no-unused-vars')
  expect(output).toMatch(/1 overlap/)
})

test('marks an uncovered concept distinctly from an owned one', () => {
  const output = capture([entry({ concept: 'style.no-var', group: 'style', uncovered: true, ownership: [] })])
  expect(output).toMatch(/uncovered/i)
})

test('marks a slop-gate-serviced concept distinctly, without claiming an engine owns it', () => {
  const output = capture([entry({ concept: 'config.rule-overlap', group: 'config', servicedBySlopGate: true })])
  expect(output).toContain('slop-gate itself')
})

test('marks a language mismatch as not applicable, distinctly from both an owned and an uncovered concept', () => {
  const output = capture([entry({ concept: 'style.component-definition-name-casing', group: 'style', ownership: [], languageMismatch: true })])

  expect(output).toMatch(/not applicable/i)
  expect(output).not.toContain('no elected owner')
  expect(output).not.toMatch(/uncovered/i)
})

test('says so plainly when no concepts are enabled', () => {
  const output = capture([])
  expect(output).toMatch(/no enabled concepts/i)
})

test('summarises total, overlap, uncovered and language-mismatch counts in the footer', () => {
  const output = capture([
    entry({ concept: 'a.one', group: 'a', overlapCount: 2 }),
    entry({ concept: 'a.two', group: 'a', uncovered: true, ownership: [] }),
    entry({ concept: 'a.three', group: 'a', languageMismatch: true, ownership: [] }),
  ])
  expect(output).toMatch(/3 enabled concepts/)
  expect(output).toMatch(/2 rule overlaps/)
  expect(output).toMatch(/1 enabled concept has no capable engine/)
  expect(output).toMatch(/1 enabled concept is not applicable/)
})

test('emits no escape codes when colour is off', () => {
  const ANSI_ESCAPE = String.fromCodePoint(27) + '['
  const output = capture([entry({ concept: 'a.one', group: 'a' })], { color: false })
  expect(output).not.toContain(ANSI_ESCAPE)
})

test('never puts a wide or fullwidth character in a framed line', () => {
  const busy = [
    entry({ concept: 'a.one', group: 'a', overlapCount: 3 }),
    entry({ concept: 'a.two', group: 'a', uncovered: true, ownership: [] }),
    entry({ concept: 'a.three', group: 'a', languageMismatch: true, ownership: [] }),
    entry({ concept: 'config.rule-overlap', group: 'config', servicedBySlopGate: true }),
  ]
  const outputs = [capture([]), capture(busy)]

  for (const output of outputs) {
    const framedLines = output.split('\n').filter((line) => /^ {2}[│╭╰]/.test(line))
    expect(framedLines.length).toBeGreaterThan(0)
    for (const line of framedLines) expect(hasWideOrFullwidthCharacter(line), line).toBe(false)
  }
})

test('json output is versioned and carries every entry', () => {
  let output = ''
  const context: RulesReporterContext = { write: (chunk) => (output += chunk), color: false, unicode: true, width: 80, version: '0.0.0' }
  const entries = [entry({ concept: 'a.one', group: 'a' })]
  renderRulesListJson(entries, context)

  const parsed = JSON.parse(output) as { version: number; entries: unknown[] }
  expect(parsed.version).toBe(RULES_LIST_JSON_VERSION)
  expect(parsed.entries).toEqual(entries)
})
