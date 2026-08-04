import { expect, test } from 'vitest'
import { createBaselineMatcher } from './apply.ts'
import type { BaselineEntry } from './types.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'

const entry = (file: string | null, concept: string, fingerprint: string): BaselineEntry => ({ file, concept, fingerprint })

const diagnostic = (fingerprint: string, over: Partial<Diagnostic> = {}): Diagnostic => ({
  concept: 'slop.double-cast',
  ruleRefKey: 'astgrep/double-cast',
  engine: 'astgrep',
  severity: 'warn',
  message: 'x',
  file: 'src/a.ts',
  range: { start: 0, end: 1 },
  position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
  fingerprint,
  ...over,
})

const matcher = (accepted: readonly BaselineEntry[]) =>
  createBaselineMatcher({ path: '.slop-gate/baseline.json', file: { version: 1, accepted } })

test('accepts a finding the baseline holds and passes one it does not', () => {
  const subject = matcher([entry('src/a.ts', 'slop.double-cast', 'aaaa')])
  expect(subject.accepts(diagnostic('aaaa'))).toBe(true)
  expect(subject.accepts(diagnostic('bbbb'))).toBe(false)
})

test('matches on the fingerprint alone, so a finding that moved down a file is still accepted', () => {
  const subject = matcher([entry('src/a.ts', 'slop.double-cast', 'aaaa')])
  expect(subject.accepts(diagnostic('aaaa', { position: { startLine: 400, startColumn: 3, endLine: 400, endColumn: 9 } }))).toBe(
    true,
  )
})

test('counts what it accepted by severity and by concept', () => {
  const subject = matcher([
    entry('src/a.ts', 'slop.double-cast', 'aaaa'),
    entry('src/a.ts', 'slop.double-cast', 'bbbb'),
    entry('src/b.ts', 'slop.as-any-cast', 'cccc'),
  ])
  subject.accepts(diagnostic('aaaa', { severity: 'error' }))
  subject.accepts(diagnostic('bbbb', { severity: 'warn' }))
  subject.accepts(diagnostic('cccc', { severity: 'warn', concept: 'slop.as-any-cast' }))

  const summary = subject.summarise()
  expect(summary.accepted).toBe(3)
  expect(summary.acceptedBySeverity).toEqual({ error: 1, warn: 2, info: 0 } satisfies Record<Severity, number>)
  expect(summary.acceptedByConcept).toEqual([
    { concept: 'slop.double-cast', count: 2 },
    { concept: 'slop.as-any-cast', count: 1 },
  ])
})

test('orders equal concept counts by concept id, so two runs print one order', () => {
  const subject = matcher([entry('src/a.ts', 'z.one', 'aaaa'), entry('src/a.ts', 'a.one', 'bbbb')])
  subject.accepts(diagnostic('aaaa', { concept: 'z.one' }))
  subject.accepts(diagnostic('bbbb', { concept: 'a.one' }))
  expect(subject.summarise().acceptedByConcept.map((group) => group.concept)).toEqual(['a.one', 'z.one'])
})

test('reports an entry that matched nothing as stale rather than pruning it', () => {
  const subject = matcher([entry('src/a.ts', 'slop.double-cast', 'aaaa'), entry('src/gone.ts', 'slop.double-cast', 'zzzz')])
  subject.accepts(diagnostic('aaaa'))
  expect(subject.summarise().stale).toEqual([entry('src/gone.ts', 'slop.double-cast', 'zzzz')])
})

test('reports stale entries in the order the file holds them, which parsing has already fixed', () => {
  const subject = matcher([entry('src/b.ts', 'b.two', '22'), entry('src/a.ts', 'a.one', '11'), entry(null, 'c.three', '33')])
  expect(subject.summarise().stale.map((stale) => stale.fingerprint)).toEqual(['22', '11', '33'])
})

test('states the entry count even when nothing matched, so an unused baseline is visible', () => {
  const summary = matcher([entry('src/a.ts', 'slop.double-cast', 'aaaa')]).summarise()
  expect(summary.entries).toBe(1)
  expect(summary.accepted).toBe(0)
  expect(summary.stale).toHaveLength(1)
})

test('an empty baseline accepts nothing and has nothing stale', () => {
  const summary = matcher([]).summarise()
  expect(summary).toEqual({
    path: '.slop-gate/baseline.json',
    entries: 0,
    accepted: 0,
    acceptedBySeverity: { error: 0, warn: 0, info: 0 },
    acceptedByConcept: [],
    stale: [],
  })
})

test('a duplicate entry is not double-counted as stale when it matched once', () => {
  const subject = matcher([entry('src/a.ts', 'slop.double-cast', 'aaaa'), entry('src/a.ts', 'slop.double-cast', 'aaaa')])
  subject.accepts(diagnostic('aaaa'))
  expect(subject.summarise().stale).toEqual([])
})
