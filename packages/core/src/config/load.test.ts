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

test('loads a .mts config', async () => {
  // `runInit` (packages/cli/src/commands/init.ts) writes `.mts` for a project whose package.json
  // lacks `"type": "module"`, specifically so Node never has to guess `.ts`'s module system and
  // print MODULE_TYPELESS_PACKAGE_JSON. That only closes the bug if `findConfigFile` actually
  // discovers `.mts` — this is the end-to-end proof, not just a listed basename.
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
  await expect(loadConfig(dir)).rejects.toThrow(/could not be parsed/)

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

// `suppressModuleTypelessPackageJsonWarning` unit tests below exercise the wrapper directly via
// synthetic `process.emitWarning` calls, deliberately not through `loadConfig` importing a real
// typeless `.ts` fixture: vitest loads test-tree files (including a dynamically imported fixture
// under a `mkdtemp` temp dir) through its own transform pipeline rather than Node's native
// CommonJS-or-ESM detection, so the real MODULE_TYPELESS_PACKAGE_JSON warning never actually fires
// under vitest regardless of this fix — confirmed by running the existing CLI-level fixtures
// (which already combine a typeless `package.json` with a `.ts` config) under `vitest run` and
// finding zero occurrences even before this change existed. The real, load-bearing proof that Node
// itself no longer prints it is the external, plain-`node` scratch-project verification in
// `.superpowers/rules-commands-report.md`; these two tests instead pin the wrapper's own
// removal/filter/restore contract, which vitest can observe directly and reliably.

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
      // `emitWarning`'s own dispatch is not necessarily synchronous with this call — give both a
      // full tick to actually be delivered while the wrapper's filter is still installed, the same
      // margin the wrapper itself grants Node's real, deferred module-type warning.
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

    // Exactly restored — not leaked (extra filter left behind) and not duplicated.
    expect(process.listeners('warning').length).toBe(countBefore)

    process.emitWarning('after the config load finished', { code: 'AFTER_RESTORE_CODE' })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(seenAfter).toEqual(['AFTER_RESTORE_CODE'])
  } finally {
    process.removeListener('warning', listener)
  }
})

test('prefers .ts over .mts when both exist', async () => {
  // Deliberately unchanged by fix 3 (packages/cli/src/commands/init.ts): `runInit` only ever
  // writes one of the two (its own existence check looks for both before choosing), so in the
  // normal lifecycle of a project the two never coexist. The one case where they legitimately can
  // — `sgate init --force` regenerates the extension for the project's *current* module type
  // while a stale file from before a "type": "module" migration is still sitting on disk — is
  // exactly the case where the fresher, actively-chosen file should win, and it is also the one a
  // human is more likely to be editing by hand. `.ts` first serves both.
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignore: ['from-ts'] }`)
  await writeFile(join(dir, 'slop-gate.config.mts'), `export default { ignore: ['from-mts'] }`)
  expect((await loadConfig(dir))?.config.ignore).toEqual(['from-ts'])
})
