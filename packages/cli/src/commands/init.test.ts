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

// A real `npm install -D sgate` is what makes the generated config's
// `import { defineConfig } from 'sgate'` resolve. This used to say nobody runs
// `sgate init` without having installed that package first; `npx sgate init` does
// exactly that, which is why `missingPackageHint` exists. This stands in for that
// install without depending on packages/cli's own dist (this repo's `pnpm test` does not build
// first; see index.test.ts for the same reasoning). It deliberately mirrors only the *contract*
// packages/cli/src/index.ts and package.json establish — a module type and a `defineConfig`
// identity function — not the real package's build output, since index.test.ts already proves
// that contract holds for the real thing.
const installStubPackage = async (): Promise<void> => {
  const target = join(dir, 'node_modules', 'sgate')
  await mkdir(target, { recursive: true })
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify({ name: 'sgate', type: 'module', exports: { '.': './index.js' } }),
  )
  await writeFile(join(target, 'index.js'), 'export const defineConfig = (config) => config\n')
}

test('writes an .mts config, a gitignore entry and an AGENTS.md section for a non-ESM project', async () => {
  // `beforeEach` writes a `package.json` with no `"type"` field — a plain CommonJS-by-default
  // project, same as the real repository that surfaced this bug. `.ts` would make Node print
  // `MODULE_TYPELESS_PACKAGE_JSON` on every `sgate check`; `.mts` is unambiguous ESM regardless of
  // `package.json`, so it never does.
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.mts')
  expect(result.created).toContain('AGENTS.md')
  expect(await readFile(join(dir, 'slop-gate.config.mts'), 'utf8')).toContain('defineConfig')
  expect(await readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).toContain('*')
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toContain('sgate check')
})

test('exempts the baseline and the gitignore itself from the directory-wide ignore', async () => {
  // `*` alone matched both. A baseline nobody can commit is read by no CI job, and a `.gitignore`
  // that ignores itself is re-created untracked on every teammate's first run.
  await runInit({ rootDir: dir })
  expect(await readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).toBe('*\n!.gitignore\n!baseline.json\n')
})

test('writes a .ts config for a project that already declares "type": "module"', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('defineConfig')
})

test('the generated config is loadable and yields the recommended preset', async () => {
  await installStubPackage()
  await runInit({ rootDir: dir })
  const { loadConfig } = await import('@misaon/slop-gate-core')

  expect((await loadConfig(dir))?.config.extends).toEqual(['recommended'])
})

test('does not overwrite an existing config', async () => {
  // `dir`'s package.json is non-ESM (see `beforeEach`), so a fresh `runInit` here would pick
  // `.mts` — but an existing `.ts` (however it got there) must still be recognised and left alone,
  // not shadowed by a second, freshly-preferred file.
  await writeFile(join(dir, 'slop-gate.config.ts'), '// mine\nexport default {}\n')
  const result = await runInit({ rootDir: dir })

  expect(result.skipped).toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('// mine')
})

test('does not overwrite an existing .mts config either', async () => {
  await writeFile(join(dir, 'slop-gate.config.mts'), '// mine\nexport default {}\n')
  const result = await runInit({ rootDir: dir })

  expect(result.skipped).toContain('slop-gate.config.mts')
  expect(await readFile(join(dir, 'slop-gate.config.mts'), 'utf8')).toContain('// mine')
})

test('running init again after the project becomes ESM does not create a second config file', async () => {
  // Reproduces the knock-on effect fix 3 has to guard against: `runInit` on a non-ESM project
  // writes `.mts`. If the project later adds `"type": "module"` and someone runs `sgate init`
  // again without `--force`, the existence check must still find that `.mts` — checking only
  // `.ts` (the now-preferred extension) would miss it and write a second, redundant config file.
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

  // `dir` is non-ESM, so a first-time write would prefer `.mts` — but force overwrites whatever
  // config already exists in place rather than switching its extension underneath it.
  expect(result.created).toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).not.toContain('// mine')
  const files = await readdir(dir)
  expect(files.filter((f) => f.startsWith('slop-gate.config.'))).toEqual(['slop-gate.config.ts'])
})

test('does not advertise commands that do not exist', async () => {
  // An agent follows this file literally, so a command named here that main.ts does not register
  // means `Unknown command` and exit code 2. Written as "every `sgate <word>` mentioned is one of
  // the registered subcommands" rather than as a blocklist of specific spellings: the blocklist
  // version named `sgate fix` and stayed in place after `fix` shipped, so the advice kept omitting
  // a command that had existed for weeks and the test read as if that were deliberate.
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
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toBe(before)
})

test('tells the user to install the package when the generated config could not load', async () => {
  // The `npx sgate init` path, reported from a real project. `init` writes a config
  // importing `defineConfig` from this package, and npx runs the CLI from its own cache — so the
  // project has no such dependency and the very next `sgate check` dies loading the config. `init`
  // is the last moment anyone can be told, so it tells them here.
  expect(await missingPackageHint(dir)).toMatch(/npm install -D sgate/)
})

test('says nothing when the package is already a dependency of the project', async () => {
  await installStubPackage()
  expect(await missingPackageHint(dir)).toBeUndefined()
})
