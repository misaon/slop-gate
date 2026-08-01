import { expect, test } from 'vitest'
import { defaultEngines } from './engines.ts'

test('registers exactly the engines a real check run uses', () => {
  const engines = defaultEngines()
  expect(engines.map((engine) => engine.id)).toEqual(['oxlint'])
})

test('returns a fresh engine instance each call, not a shared singleton', () => {
  // `sgate rules why`/`list`/`conflicts` and `check` each call this independently within the same
  // process in a test harness (see e2e.test.ts) — sharing one instance across calls would risk one
  // command's state (e.g. a disposed engine handle) leaking into another's.
  expect(defaultEngines()[0]).not.toBe(defaultEngines()[0])
})
