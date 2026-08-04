import { expect, test } from 'vitest'
import { defaultEngines } from './engine-registry.ts'

test('registers exactly the engines a real check run uses', () => {
  const engines = defaultEngines(process.cwd())
  expect(engines.map((engine) => engine.id)).toEqual([
    'oxlint',
    'oxfmt',
    'tsc',
    'knip',
    'astgrep',
    'schema',
    'actionlint',
    'biome-css',
    'deps-security',
    'hadolint',
  ])
})

test('only the engines that can genuinely be unable to run declare availability', () => {
  const declaring = defaultEngines(process.cwd())
    .filter((engine) => engine.availability !== undefined)
    .map((engine) => engine.id)
  expect(declaring).toEqual(['tsc', 'knip', 'actionlint', 'deps-security', 'hadolint'])
})

test('returns a fresh engine instance each call, not a shared singleton', () => {
  expect(defaultEngines(process.cwd())[0]).not.toBe(defaultEngines(process.cwd())[0])
})

test('binds each engine to the given rootDir, not a fixed default', () => {
  const engines = defaultEngines('/some/other/project')
  expect(engines.map((engine) => engine.id)).toEqual([
    'oxlint',
    'oxfmt',
    'tsc',
    'knip',
    'astgrep',
    'schema',
    'actionlint',
    'biome-css',
    'deps-security',
    'hadolint',
  ])
})

test('passes the discovered config file through so knip does not report it as unused', () => {
  const withConfig = defaultEngines(process.cwd(), 'slop-gate.config.ts')
  const withoutConfig = defaultEngines(process.cwd())
  expect(withConfig.map((engine) => engine.id)).toEqual(withoutConfig.map((engine) => engine.id))
})
