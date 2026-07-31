import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { runInit } from './init.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-init-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// A real `npm install -D @misaon/slop-gate` is what makes the generated config's
// `import { defineConfig } from '@misaon/slop-gate'` resolve — nobody runs `sgate init` without
// having installed the package that provides `sgate` in the first place. This stands in for that
// install without depending on packages/cli's own dist (this repo's `pnpm test` does not build
// first; see index.test.ts for the same reasoning). It deliberately mirrors only the *contract*
// packages/cli/src/index.ts and package.json establish — a module type and a `defineConfig`
// identity function — not the real package's build output, since index.test.ts already proves
// that contract holds for the real thing.
const installStubPackage = async (): Promise<void> => {
  const target = join(dir, 'node_modules', '@misaon', 'slop-gate')
  await mkdir(target, { recursive: true })
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify({ name: '@misaon/slop-gate', type: 'module', exports: { '.': './index.js' } }),
  )
  await writeFile(join(target, 'index.js'), 'export const defineConfig = (config) => config\n')
}

test('writes a config, a gitignore entry and an AGENTS.md section', async () => {
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.ts')
  expect(result.created).toContain('AGENTS.md')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('defineConfig')
  expect(await readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).toContain('*')
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toContain('sgate check')
})

test('the generated config is loadable and yields the recommended preset', async () => {
  await installStubPackage()
  await runInit({ rootDir: dir })
  const { loadConfig } = await import('@misaon/slop-gate-core')

  expect((await loadConfig(dir))?.config.extends).toEqual(['recommended'])
})

test('does not overwrite an existing config', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), '// mine\nexport default {}\n')
  const result = await runInit({ rootDir: dir })

  expect(result.skipped).toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('// mine')
})

test('overwrites an existing config when forced', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), '// mine\nexport default {}\n')
  await runInit({ rootDir: dir, force: true })

  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).not.toContain('// mine')
})

test('does not advertise commands that do not exist', async () => {
  // `sgate fix` and `sgate rules why <concept>` are not registered subcommands (packages/cli/src/
  // main.ts lists only `check` and `init`) — an agent following this file's own advice would run
  // one and get `Unknown command`, exit code 2.
  await runInit({ rootDir: dir })
  const content = await readFile(join(dir, 'AGENTS.md'), 'utf8')

  expect(content).not.toContain('sgate fix')
  expect(content).not.toContain('rules why')
})

test('merges into an existing AGENTS.md without losing content', async () => {
  await writeFile(join(dir, 'AGENTS.md'), '# Project\n\nExisting guidance.\n')
  await runInit({ rootDir: dir })
  const content = await readFile(join(dir, 'AGENTS.md'), 'utf8')

  expect(content).toContain('Existing guidance.')
  expect(content).toContain('sgate check')
})

test('running init twice changes nothing the second time', async () => {
  await runInit({ rootDir: dir })
  const before = await readFile(join(dir, 'AGENTS.md'), 'utf8')
  const second = await runInit({ rootDir: dir })

  expect(second.created).not.toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toBe(before)
})
