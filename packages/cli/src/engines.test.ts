import { expect, test } from 'vitest'
import { defaultEngines } from './engines.ts'

test('registers exactly the engines a real check run uses', () => {
  const engines = defaultEngines(process.cwd())
  expect(engines.map((engine) => engine.id)).toEqual(['oxlint', 'tsc'])
})

test('returns a fresh engine instance each call, not a shared singleton', () => {
  // `sgate rules why`/`list`/`conflicts` and `check` each call this independently within the same
  // process in a test harness (see e2e.test.ts) — sharing one instance across calls would risk one
  // command's state (e.g. a disposed engine handle) leaking into another's.
  expect(defaultEngines(process.cwd())[0]).not.toBe(defaultEngines(process.cwd())[0])
})

test('binds each engine to the given rootDir, not a fixed default', () => {
  // `tsc` is project-granularity and resolves `typescript` (a peer dependency) relative to
  // `rootDir` — passing a different directory must produce a distinctly-configured engine, not one
  // that silently ignores the argument.
  const engines = defaultEngines('/some/other/project')
  expect(engines.map((engine) => engine.id)).toEqual(['oxlint', 'tsc'])
})
