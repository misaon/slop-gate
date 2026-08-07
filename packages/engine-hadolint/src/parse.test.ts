import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseHadolintOutput, instructionKeywordRange, readHadolintFindings, stripPrefixes, type HadolintFinding } from './parse.ts'
import { HADOLINT_RULE_IDS } from './rules.ts'

const finding = (over: Partial<HadolintFinding> = {}): HadolintFinding => ({
  code: 'DL3007',
  file: 'Dockerfile',
  line: 1,
  column: 1,
  level: 'warning',
  message: 'Using latest is prone to errors',
  ...over,
})

const options = (source: string | undefined, enabled: readonly string[] = HADOLINT_RULE_IDS) => ({
  enabled: (rule: string) => enabled.includes(rule),
  readSource: () => source,
  absolutePrefixes: [] as readonly string[],
})

test('clean output parses as no findings whether it is empty or an empty array', () => {
  expect(readHadolintFindings('')).toEqual([])
  expect(readHadolintFindings('[]')).toEqual([])
  expect(readHadolintFindings('  \n')).toEqual([])
})

test('unparseable output is an engine error rather than silence', () => {
  expect(() => readHadolintFindings('not json')).toThrow(/could not parse hadolint JSON output/)
})

test('an elected rule becomes a diagnostic with the range over its instruction keyword', () => {
  const [diagnostic] = parseHadolintOutput([finding()], options('FROM node:latest\nRUN echo hi\n'))
  expect(diagnostic).toMatchObject({ engineRuleId: 'DL3007', file: 'Dockerfile', severity: 'error' })
  expect(diagnostic?.range).toEqual({ start: 0, end: 4 })
})

test('the range covers the keyword on an indented instruction too', () => {
  const source = 'FROM node:22\n  RUN echo hi\n'
  expect(instructionKeywordRange({ line: 2 }, source)).toEqual({ start: 15, end: 18 })
})

test('a rule that was not elected is dropped', () => {
  expect(parseHadolintOutput([finding()], options('FROM node:latest\n', ['DL4006']))).toEqual([])
})

test('a rule this registry has never heard of is dropped rather than passed through', () => {
  expect(parseHadolintOutput([finding({ code: 'DL9999' })], options('FROM node:latest\n'))).toEqual([])
})

test('embedded ShellCheck findings are dropped whatever their code', () => {
  const shell = [finding({ code: 'SC2086' }), finding({ code: 'SC3010' }), finding({ code: 'SC2046' })]
  expect(parseHadolintOutput(shell, options('FROM x\nRUN y\n'))).toEqual([])
})

test('dL3025 is dropped on HEALTHCHECK and kept on a real ENTRYPOINT', () => {
  const source = ['FROM debian:12-slim', 'HEALTHCHECK --interval=30s CMD curl -f http://localhost/', 'ENTRYPOINT /app/run'].join('\n')
  const message = 'Use arguments JSON notation for CMD and ENTRYPOINT arguments'

  const healthcheck = parseHadolintOutput([finding({ code: 'DL3025', line: 2, message })], options(source))
  expect(healthcheck).toEqual([])

  const entrypoint = parseHadolintOutput([finding({ code: 'DL3025', line: 3, message })], options(source))
  expect(entrypoint).toHaveLength(1)
})

test('hadolint own severity is not mapped onto ours', () => {
  const [diagnostic] = parseHadolintOutput([finding({ code: 'DL4006', level: 'info' })], options('FROM x\n'))
  expect(diagnostic?.severity).toBe('error')
})

test('an absolute path is made repo-relative', () => {
  const root = join('/repo', 'root')
  const [diagnostic] = parseHadolintOutput([finding({ file: join(root, 'docker', 'Dockerfile') })], {
    enabled: () => true,
    readSource: () => 'FROM node:latest\n',
    absolutePrefixes: [root],
  })
  expect(diagnostic?.file).toBe('docker/Dockerfile')
})

test('an unreadable file still reports, at the top', () => {
  const [diagnostic] = parseHadolintOutput([finding()], options(undefined))
  expect(diagnostic?.range).toEqual({ start: 0, end: 0 })
})

test('stripping is one function, because `index.ts` keys its source map on the same path this parser reports', () => {
  expect(stripPrefixes('/repo/root/Dockerfile', ['/repo/root'])).toBe('Dockerfile')
  expect(stripPrefixes('/repo/root/Dockerfile', ['/repo/root/'])).toBe('Dockerfile')
  expect(stripPrefixes('/repo/root/tmp/Dockerfile', ['/repo/root', '/repo/root/tmp'])).toBe('Dockerfile')
  expect(stripPrefixes(String.raw`C:\repo\root\Dockerfile`, [String.raw`C:\repo\root`])).toBe('Dockerfile')
  expect(stripPrefixes('docker/Dockerfile', ['/elsewhere', ''])).toBe('docker/Dockerfile')
  expect(stripPrefixes('/repo/root/Dockerfile', [])).toBe('/repo/root/Dockerfile')
  expect(stripPrefixes('/repo/root/', ['/repo/root'])).toBe('')
})
