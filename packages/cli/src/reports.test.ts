import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createReportSink, parseReportSpecs } from './reports.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-reports-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('no --report is no extra reports, not an error', () => {
  expect(parseReportSpecs(undefined, 'pretty')).toEqual([])
})

test('reads a comma-separated list, with and without a destination', () => {
  expect(parseReportSpecs('github,sarif:out/report.sarif', 'pretty')).toEqual([
    { name: 'github', path: null },
    { name: 'sarif', path: 'out/report.sarif' },
  ])
})

test('a windows path keeps its drive letter, which is a colon the name parse must not claim', () => {
  expect(parseReportSpecs('sarif:C:\\out\\report.sarif', 'pretty')).toEqual([
    { name: 'sarif', path: 'C:\\out\\report.sarif' },
  ])
})

test('names an unknown format rather than failing later', () => {
  const parsed = parseReportSpecs('nonsense', 'pretty')
  expect(parsed).toEqual({ error: expect.stringContaining('unknown format: nonsense') })
})

test('rejects a colon with nothing after it', () => {
  expect(parseReportSpecs('sarif:', 'pretty')).toEqual({ error: expect.stringContaining('no path after the colon') })
})

test('rejects an empty entry, which a trailing comma produces', () => {
  expect(parseReportSpecs('github,', 'pretty')).toEqual({ error: expect.stringContaining('empty entry') })
})

test('github may share stdout with the human report, because it is commands embedded in a log', () => {
  expect(parseReportSpecs('github', 'pretty')).toEqual([{ name: 'github', path: null }])
})

test('a whole-document report may not share stdout, whatever --format is', () => {
  expect(parseReportSpecs('sarif', 'pretty')).toEqual({
    error: expect.stringContaining('cannot share stdout'),
  })
})

test('github may not share stdout with a machine-readable --format either', () => {
  expect(parseReportSpecs('github', 'json')).toEqual({
    error: expect.stringContaining('--format is `json`, which owns stdout'),
  })
})

test('a file sink writes nothing until it is flushed, so a crash leaves no truncated report', async () => {
  const path = join(dir, 'report.sarif')
  const sink = createReportSink({ name: 'sarif', path }, context())

  sink.reporter.onEvent({ type: 'done', result: emptyResult() } as never)
  await expect(readFile(path, 'utf8')).rejects.toThrow(/ENOENT/)

  sink.flush()
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: '2.1.0' })
})

function context(): Parameters<typeof createReportSink>[1] {
  return { color: false, unicode: false, width: 80, version: '0.0.0-test', readSource: () => null }
}

function emptyResult(): unknown {
  return { diagnostics: [], unavailableEngines: [] }
}
