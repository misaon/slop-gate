import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ConfigError } from '../errors.ts'
import { findConfigFile, loadConfig, suppressModuleTypelessPackageJsonWarning } from './load.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-config-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('returns null when no config file exists', async () => {
  await expect(findConfigFile(dir)).resolves.toBeNull()
  await expect(loadConfig(dir)).resolves.toBeNull()
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

test('loads a .mts config', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.mts'),
    `type Level = 'warn' | 'error'
     const level: Level = 'error'
     export default { extends: ['recommended'], rules: { 'style.no-var': level } }
    `,
  )

  const loaded = await loadConfig(dir)
  expect(loaded?.config.extends).toEqual(['recommended'])
  expect(loaded?.config.rules?.['style.no-var']).toBe('error')
})

test('finds a config in a parent directory', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default {}`)
  const nested = join(dir, 'packages', 'app')
  await import('node:fs/promises').then((fs) => fs.mkdir(nested, { recursive: true }))
  await expect(findConfigFile(nested)).resolves.toBe(join(dir, 'slop-gate.config.ts'))
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

  await expect(loadConfig(dir)).rejects.toThrow(/could not be parsed/)
  await expect(loadConfig(dir)).rejects.toThrow(/slop-gate\.config\.ts/)
  await expect(loadConfig(dir)).rejects.not.toThrow(/default export/)
})

test('leaves no scratch file behind when the config cannot be parsed', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { rules: `)
  await expect(loadConfig(dir)).rejects.toThrow(/could not be parsed/)

  const { readdir } = await import('node:fs/promises')
  expect((await readdir(dir)).filter((f) => f.endsWith('.sgate.mjs'))).toEqual([])
})

test('names the package that is missing, and says to install it', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `import { defineConfig } from '@acme/not-installed'
     export default defineConfig({ extends: ['recommended'] })
    `,
  )

  await expect(loadConfig(dir)).rejects.toThrow(/@acme\/not-installed/)
  await expect(loadConfig(dir)).rejects.toThrow(/npm install -D @acme\/not-installed/)
})

test('still explains path aliases when the unresolved import is a relative one', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `import { x } from './does-not-exist.js'
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

test('suppresses only the MODULE_TYPELESS_PACKAGE_JSON code, letting any other warning code through', async () => {
  const seen: string[] = []
  const listener = (warning: NodeJS.ErrnoException): void => {
    seen.push(warning.code ?? warning.message)
  }
  process.on('warning', listener)

  try {
    await suppressModuleTypelessPackageJsonWarning(async () => {
      process.emitWarning('typeless config warning', { code: 'MODULE_TYPELESS_PACKAGE_JSON' })
      process.emitWarning('an unrelated warning', { code: 'SOME_OTHER_CODE' })
      await new Promise<void>((resolve) => setImmediate(resolve))
    })
  } finally {
    process.removeListener('warning', listener)
  }

  expect(seen).toEqual(['SOME_OTHER_CODE'])
})

test('restores the previous listeners afterwards, so a later unrelated warning still reaches them', async () => {
  const seenAfter: string[] = []
  const listener = (warning: NodeJS.ErrnoException): void => {
    seenAfter.push(warning.code ?? warning.message)
  }
  process.on('warning', listener)
  const countBefore = process.listeners('warning').length

  try {
    await suppressModuleTypelessPackageJsonWarning(async () => {})

    expect(process.listeners('warning')).toHaveLength(countBefore)

    process.emitWarning('after the config load finished', { code: 'AFTER_RESTORE_CODE' })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(seenAfter).toEqual(['AFTER_RESTORE_CODE'])
  } finally {
    process.removeListener('warning', listener)
  }
})

test('two overlapping suppressions still restore the original listeners, in either finish order', async () => {
  const before = process.listeners('warning')

  const outerGate = Promise.withResolvers<void>()
  const innerGate = Promise.withResolvers<void>()
  const outer = suppressModuleTypelessPackageJsonWarning(() => outerGate.promise)
  const inner = suppressModuleTypelessPackageJsonWarning(() => innerGate.promise)

  outerGate.resolve()
  await outer
  innerGate.resolve()
  await inner

  expect(process.listeners('warning')).toEqual(before)
})

test('a suppression still in flight keeps filtering after an overlapping one finishes', async () => {
  const seen: string[] = []
  const listener = (warning: NodeJS.ErrnoException): void => {
    seen.push(warning.code ?? warning.message)
  }
  process.on('warning', listener)

  const gate = Promise.withResolvers<void>()
  try {
    const outer = suppressModuleTypelessPackageJsonWarning(() => gate.promise)
    await suppressModuleTypelessPackageJsonWarning(async () => {})

    process.emitWarning('still loading', { code: 'MODULE_TYPELESS_PACKAGE_JSON' })
    process.emitWarning('unrelated', { code: 'STILL_LOADING_OTHER_CODE' })
    await new Promise<void>((resolve) => setImmediate(resolve))

    gate.resolve()
    await outer
  } finally {
    process.removeListener('warning', listener)
  }

  expect(seen).toEqual(['STILL_LOADING_OTHER_CODE'])
})

test('rejects a config key whose value is the wrong shape, naming the key and the file', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { extends: 'recommended' }`)

  await expect(loadConfig(dir)).rejects.toThrow(/slop-gate\.config\.ts/)
  await expect(loadConfig(dir)).rejects.toThrow(/`extends`/)
  await expect(loadConfig(dir)).rejects.not.toThrow(/Cannot convert/)
})

test('rejects a single override block written where a list belongs', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { overrides: { files: ['a'], rules: {} } }`)
  await expect(loadConfig(dir)).rejects.toThrow(/`overrides`/)
})

test('rejects a string where a list of ignore patterns belongs, rather than reading it as characters', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignore: 'dist' }`)
  await expect(loadConfig(dir)).rejects.toThrow(/`ignore`/)
})

test('rejects a non-object where a rule map belongs', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { rules: 'nope' }`)
  await expect(loadConfig(dir)).rejects.toThrow(/`rules`/)
})

test('accepts every documented key at its documented shape', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `export default {
       extends: ['recommended'],
       workspaces: 'auto',
       rules: { 'style.no-var': 'error', 'oxlint/no-debugger': ['warn', 'smart'] },
       overrides: [{ files: ['src/**'], rules: { 'style.no-var': 'off' } }],
       owners: { 'correctness.parse-error': 'oxlint' },
       engines: { oxlint: { enabled: true } },
       ignore: ['dist/**'],
       generated: 'skip',
     }`,
  )

  const loaded = await loadConfig(dir)
  expect(loaded?.config.workspaces).toBe('auto')
  expect(loaded?.config.generated).toBe('skip')
  expect(loaded?.config.overrides?.[0]?.files).toEqual(['src/**'])
})

test('accepts an explicit list of workspaces as well as auto', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { workspaces: ['packages/*'] }`)
  expect((await loadConfig(dir))?.config.workspaces).toEqual(['packages/*'])
})

test('reports an unknown top-level key rather than accepting it in silence', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignoer: ['dist/**'] }`)
  await expect(loadConfig(dir)).rejects.toThrow(/`ignoer`/)
})

test('names the key a typo most likely meant, since a typo is why the key is unknown', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignoer: ['dist/**'] }`)
  await expect(loadConfig(dir)).rejects.toThrow(/Did you mean `ignore`\?/)
})

test('lists the known keys when the unknown one resembles none of them', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { plugins: [] }`)
  const failure = await loadConfig(dir).then(() => null, (error: unknown) => error)
  expect(String(failure)).toContain('Known keys:')
  expect(String(failure)).not.toContain('Did you mean')
})

test('prefers .ts over .mts when both exist', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignore: ['from-ts'] }`)
  await writeFile(join(dir, 'slop-gate.config.mts'), `export default { ignore: ['from-mts'] }`)
  expect((await loadConfig(dir))?.config.ignore).toEqual(['from-ts'])
})
