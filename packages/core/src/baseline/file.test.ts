import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ConfigError } from '../errors.ts'
import { baselinePathFor, entriesOf, parseBaseline, readBaseline, serializeBaseline, writeBaseline } from './file.ts'
import type { BaselineEntry } from './types.ts'
import type { Diagnostic } from '../diagnostics/types.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-baseline-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const entry = (file: string | null, concept: string, fingerprint: string): BaselineEntry => ({ file, concept, fingerprint })

const diagnostic = (over: Partial<Diagnostic>): Diagnostic => ({
  concept: 'slop.double-cast',
  ruleId: 'astgrep/double-cast',
  engine: 'astgrep',
  severity: 'warn',
  message: 'x',
  file: 'src/a.ts',
  range: { start: 0, end: 1 },
  position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
  fingerprint: 'aaaa',
  ...over,
})

test('resolves the baseline beside the cache, under the directory `init` already creates', () => {
  expect(baselinePathFor('/repo')).toBe(join('/repo', '.slop-gate', 'baseline.json'))
})

test('writes one finding per line, so a diff names what was accepted', () => {
  const text = serializeBaseline([entry('src/b.ts', 'slop.as-any-cast', 'bbbb'), entry('src/a.ts', 'slop.double-cast', 'aaaa')])
  expect(text).toBe(
    [
      '{',
      '  "version": 1,',
      '  "accepted": [',
      '    { "file": "src/a.ts", "concept": "slop.double-cast", "fingerprint": "aaaa" },',
      '    { "file": "src/b.ts", "concept": "slop.as-any-cast", "fingerprint": "bbbb" }',
      '  ]',
      '}',
      '',
    ].join('\n'),
  )
})

test('sorts an unattributed finding before every path, as the diagnostic stream does', () => {
  const text = serializeBaseline([entry('src/a.ts', 'slop.double-cast', 'aaaa'), entry(null, 'config.rule-overlap', 'cccc')])
  expect(text.indexOf('config.rule-overlap')).toBeLessThan(text.indexOf('slop.double-cast'))
  expect(text).toContain('{ "file": null, "concept": "config.rule-overlap", "fingerprint": "cccc" },')
})

test('serialises byte-identically whatever order the findings arrive in', () => {
  const entries = [entry('src/a.ts', 'b.two', '22'), entry('src/a.ts', 'a.one', '11'), entry('src/a.ts', 'a.one', '00')]
  expect(serializeBaseline(entries)).toBe(serializeBaseline([...entries].reverse()))
})

test('renders an empty baseline as valid json rather than as an empty file', () => {
  expect(JSON.parse(serializeBaseline([]))).toEqual({ version: 1, accepted: [] })
})

test('round-trips through the filesystem', async () => {
  const path = baselinePathFor(dir)
  await writeBaseline(path, [entry('src/a.ts', 'slop.double-cast', 'aaaa')])
  expect((await readBaseline(path))?.accepted).toEqual([entry('src/a.ts', 'slop.double-cast', 'aaaa')])
})

test('sorts a hand-shuffled file on the way in, so what a run derives from it is order-free', () => {
  const shuffled = JSON.stringify({
    version: 1,
    accepted: [entry('src/b.ts', 'b.two', '22'), entry(null, 'c.three', '33'), entry('src/a.ts', 'a.one', '11')],
  })
  expect(parseBaseline(shuffled, 'b.json').accepted.map((accepted) => accepted.fingerprint)).toEqual(['33', '11', '22'])
})

test('reads an absent baseline as absent, not as empty', async () => {
  expect(await readBaseline(baselinePathFor(dir))).toBeNull()
})

test('rejects a version it cannot read instead of accepting nothing from it', () => {
  expect(() => parseBaseline(JSON.stringify({ version: 99, accepted: [] }), 'b.json')).toThrow(ConfigError)
  expect(() => parseBaseline(JSON.stringify({ version: 99, accepted: [] }), 'b.json')).toThrow(/version 99/)
})

test('rejects a malformed entry rather than silently dropping it', () => {
  const cases = [
    '{}',
    'not json',
    JSON.stringify({ version: 1 }),
    JSON.stringify({ version: 1, accepted: {} }),
    JSON.stringify({ version: 1, accepted: [{ concept: 'a', fingerprint: 'b' }] }),
    JSON.stringify({ version: 1, accepted: [{ file: 'a', concept: 'a' }] }),
    JSON.stringify({ version: 1, accepted: [{ file: 1, concept: 'a', fingerprint: 'b' }] }),
    JSON.stringify({ version: 1, accepted: [{ file: 'a', concept: 'a', fingerprint: 'b', note: 'x' }] }),
  ]
  for (const text of cases) expect(() => parseBaseline(text, 'b.json'), text).toThrow(ConfigError)
})

test('names the file in every rejection, because the reader is looking at a diff not a stack trace', () => {
  expect(() => parseBaseline('{}', '.slop-gate/baseline.json')).toThrow(/\.slop-gate\/baseline\.json/)
})

test('derives entries from diagnostics, dropping everything that is not identity', () => {
  expect(entriesOf([diagnostic({ fingerprint: 'ffff', file: null, concept: 'config.rule-overlap' })])).toEqual([
    { file: null, concept: 'config.rule-overlap', fingerprint: 'ffff' },
  ])
})
