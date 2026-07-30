import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ConfigError } from '../errors.ts'
import { findConfigFile, loadConfig } from './load.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-config-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('returns null when no config file exists', async () => {
  expect(await findConfigFile(dir)).toBeNull()
  expect(await loadConfig(dir)).toBeNull()
})

test('loads a TypeScript config with type annotations', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `type Level = 'warn' | 'error'
     const level: Level = 'error'
     export default { extends: ['recommended'], rules: { 'style.no-var': level } }
    `,
  )

  const loaded = await loadConfig(dir)
  expect(loaded?.config.extends).toEqual(['recommended'])
  expect(loaded?.config.rules?.['style.no-var']).toBe('error')
})

test('loads a plain JavaScript config', async () => {
  await writeFile(join(dir, 'slop-gate.config.js'), `export default { ignore: ['dist/**'] }`)
  expect((await loadConfig(dir))?.config.ignore).toEqual(['dist/**'])
})

test('finds a config in a parent directory', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default {}`)
  const nested = join(dir, 'packages', 'app')
  await import('node:fs/promises').then((fs) => fs.mkdir(nested, { recursive: true }))
  expect(await findConfigFile(nested)).toBe(join(dir, 'slop-gate.config.ts'))
})

test('rejects a config without a default export', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export const config = {}`)
  await expect(loadConfig(dir)).rejects.toThrow(ConfigError)
})

test('rejects a default export that is not an object', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default 42`)
  await expect(loadConfig(dir)).rejects.toThrow(/must export a configuration object/)
})

test('reports a syntax error with the real parse diagnostic, not a misleading one', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { rules: `)

  // Asserting only on the filename would pass even when the "no default export" branch fires,
  // which is what an earlier version of this code actually did.
  await expect(loadConfig(dir)).rejects.toThrow(/could not be parsed/)
  await expect(loadConfig(dir)).rejects.toThrow(/slop-gate\.config\.ts/)
  await expect(loadConfig(dir)).rejects.not.toThrow(/default export/)
})

test('leaves no scratch file behind when the config cannot be parsed', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { rules: `)
  await expect(loadConfig(dir)).rejects.toThrow()

  const { readdir } = await import('node:fs/promises')
  expect((await readdir(dir)).filter((f) => f.endsWith('.sgate.mjs'))).toEqual([])
})

test('explains path aliases when an import cannot be resolved', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `import { x } from '@app/shared'
     export default { ignore: [x] }
    `,
  )
  await expect(loadConfig(dir)).rejects.toThrow(/tsconfig path aliases/)
})

test('prefers .ts over .js when both exist', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignore: ['from-ts'] }`)
  await writeFile(join(dir, 'slop-gate.config.js'), `export default { ignore: ['from-js'] }`)
  expect((await loadConfig(dir))?.config.ignore).toEqual(['from-ts'])
})
