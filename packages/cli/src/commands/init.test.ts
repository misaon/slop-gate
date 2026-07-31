import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

test('writes a config, a gitignore entry and an AGENTS.md section', async () => {
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.ts')
  expect(result.created).toContain('AGENTS.md')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('defineConfig')
  expect(await readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).toContain('*')
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toContain('sgate check')
})

test('the generated config is loadable and yields the recommended preset', async () => {
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
