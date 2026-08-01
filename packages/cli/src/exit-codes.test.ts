import { expect, test } from 'vitest'
import { EXIT_CODES, resolveExitCode } from './exit-codes.ts'

const clean = { counts: { error: 0, warn: 0, info: 0 }, engineFailures: [] }

test('zero when nothing was found', () => {
  expect(resolveExitCode(clean)).toBe(EXIT_CODES.clean)
})

test('one when an error was found', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 1, warn: 0, info: 0 } })).toBe(EXIT_CODES.findings)
})

test('zero for warnings when no threshold is set', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 5, info: 0 } })).toBe(EXIT_CODES.clean)
})

test('one when warnings exceed the threshold', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 3, info: 0 }, maxWarnings: 2 })).toBe(EXIT_CODES.findings)
})

test('zero when warnings equal the threshold', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 2, info: 0 }, maxWarnings: 2 })).toBe(EXIT_CODES.clean)
})

test('info findings never fail the run', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 0, info: 9 }, maxWarnings: 0 })).toBe(EXIT_CODES.clean)
})

test('an engine failure outranks findings', () => {
  expect(
    resolveExitCode({ counts: { error: 4, warn: 0, info: 0 }, engineFailures: [{ engine: 'oxlint', message: 'x' }] }),
  ).toBe(EXIT_CODES.engine)
})

test('a registered engine that is not installed is not a failure by default', () => {
  // The default has to stay usable on a laptop that never installed the optional tool. The run is
  // still honest about it — every reporter prints the gap — but it does not fail.
  expect(resolveExitCode({ ...clean, unavailableEngines: [{ engine: 'hadolint' }] })).toBe(EXIT_CODES.clean)
})

test('--require-engines turns a missing engine into an engine exit code', () => {
  expect(resolveExitCode({ ...clean, unavailableEngines: [{ engine: 'hadolint' }], requireEngines: true })).toBe(EXIT_CODES.engine)
})

test('--require-engines with every engine present changes nothing', () => {
  expect(resolveExitCode({ ...clean, requireEngines: true })).toBe(EXIT_CODES.clean)
})

test('a missing required engine outranks findings, because the findings are not the whole answer', () => {
  expect(
    resolveExitCode({
      counts: { error: 4, warn: 0, info: 0 },
      engineFailures: [],
      unavailableEngines: [{ engine: 'hadolint' }],
      requireEngines: true,
    }),
  ).toBe(EXIT_CODES.engine)
})
