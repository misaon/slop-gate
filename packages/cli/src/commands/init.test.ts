import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { missingPackageHint, runInit } from './init.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-init-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const installStubPackage = async (): Promise<void> => {
  const target = join(dir, 'node_modules', '@misaon', 'slop-gate')
  await mkdir(target, { recursive: true })
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify({ name: '@misaon/slop-gate', type: 'module', exports: { '.': './index.js' } }),
  )
  await writeFile(join(target, 'index.js'), 'export const defineConfig = (config) => config\n')
}

test('writes an .mts config, a gitignore entry and an AGENTS.md section for a non-ESM project', async () => {
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.mts')
  expect(result.created).toContain('AGENTS.md')
  await expect(readFile(join(dir, 'slop-gate.config.mts'), 'utf8')).resolves.toContain('defineConfig')
  await expect(readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).resolves.toContain('*')
  await expect(readFile(join(dir, 'AGENTS.md'), 'utf8')).resolves.toContain('sgate check')
})

test('exempts the baseline and the gitignore itself from the directory-wide ignore', async () => {
  await runInit({ rootDir: dir })
  await expect(readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).resolves.toBe('*\n!.gitignore\n!baseline.json\n')
})

test('writes a .ts config for a project that already declares "type": "module"', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.ts')
  await expect(readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).resolves.toContain('defineConfig')
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
  await expect(readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).resolves.toContain('// mine')
})

test('does not overwrite an existing .mts config either', async () => {
  await writeFile(join(dir, 'slop-gate.config.mts'), '// mine\nexport default {}\n')
  const result = await runInit({ rootDir: dir })

  expect(result.skipped).toContain('slop-gate.config.mts')
  await expect(readFile(join(dir, 'slop-gate.config.mts'), 'utf8')).resolves.toContain('// mine')
})

test('running init again after the project becomes ESM does not create a second config file', async () => {
  const first = await runInit({ rootDir: dir })
  expect(first.created).toContain('slop-gate.config.mts')

  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  const second = await runInit({ rootDir: dir })

  expect(second.skipped).toContain('slop-gate.config.mts')
  expect(second.created).not.toContain('slop-gate.config.ts')
  const files = await readdir(dir)
  expect(files.filter((f) => f.startsWith('slop-gate.config.'))).toEqual(['slop-gate.config.mts'])
})

test('overwrites an existing config when forced, in place, without changing its extension', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), '// mine\nexport default {}\n')
  const result = await runInit({ rootDir: dir, force: true })

  expect(result.created).toContain('slop-gate.config.ts')
  await expect(readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).resolves.not.toContain('// mine')
  const files = await readdir(dir)
  expect(files.filter((f) => f.startsWith('slop-gate.config.'))).toEqual(['slop-gate.config.ts'])
})

test('does not advertise commands that do not exist', async () => {
  const registered = ['check', 'fix', 'init', 'rules']
  await runInit({ rootDir: dir })
  const content = await readFile(join(dir, 'AGENTS.md'), 'utf8')

  const mentioned = [...content.matchAll(/\bsgate ([a-z-]+)/g)].map((match) => match[1]!)
  expect(mentioned.length).toBeGreaterThan(0)
  for (const command of mentioned) expect(registered, `sgate ${command}`).toContain(command)
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
  expect(second.created).not.toContain('slop-gate.config.mts')
  await expect(readFile(join(dir, 'AGENTS.md'), 'utf8')).resolves.toBe(before)
})

test('tells the user to install the package when the generated config could not load', async () => {
  await expect(missingPackageHint(dir)).resolves.toMatch(/npm install -D @misaon\/slop-gate/)
})

test('says nothing when the package is already a dependency of the project', async () => {
  await installStubPackage()
  await expect(missingPackageHint(dir)).resolves.toBeUndefined()
})
