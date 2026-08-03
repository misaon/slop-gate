import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { baselinePathFor, readBaseline, runCheck, writeBaseline, type SlopGateConfig } from '@misaon/slop-gate-core'
import { DEFAULT_CONFIG, loadCliConfig } from '../../config.ts'
import { defaultEngines } from '../../engine-registry.ts'
import { EXIT_CODES } from '../../exit-codes.ts'
import { baseline } from './index.ts'
import { create } from './create.ts'
import { show } from './show.ts'
import { update } from './update.ts'

let dir: string
let originalExitCode: number | undefined

const CONFIG = "export default { extends: ['recommended'], rules: { 'types.type-error': 'off', 'dead-code.unused-file': 'off' } }\n"

beforeEach(async () => {
  originalExitCode = typeof process.exitCode === 'number' ? process.exitCode : undefined
  process.exitCode = undefined
  dir = await mkdtemp(join(tmpdir(), 'sgate-baseline-cmd-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  await writeFile(join(dir, 'slop-gate.config.ts'), CONFIG)
  await writeFile(join(dir, 'dirty.ts'), 'export function f() {\n  debugger\n}\n')
})

afterEach(async () => {
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

/** The fixture's own config, resolved the way every command resolves it. */
const loadedConfig = async (): Promise<SlopGateConfig> => {
  const loaded = await loadCliConfig(dir, DEFAULT_CONFIG)
  if (loaded.kind === 'error') throw new Error(loaded.message)
  return loaded.config
}

type Command = typeof create | typeof update | typeof show

const run = async (command: Command, args: Record<string, unknown>): Promise<{ out: string; err: string }> => {
  let out = ''
  let err = ''
  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk)
    return true
  })
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err += String(chunk)
    return true
  })
  try {
    await command.run!({ args: { cwd: dir, ...args }, rawArgs: [], cmd: command } as never)
  } finally {
    outSpy.mockRestore()
    errSpy.mockRestore()
  }
  return { out, err }
}

test('registers exactly the three subcommands spec §12.2 names, and no bare default', () => {
  expect(Object.keys(baseline.subCommands!)).toEqual(['create', 'update', 'show'])
  expect(baseline.run).toBeUndefined()
})

test('create writes every current finding and exits clean, because they were accepted not missed', async () => {
  const { out } = await run(create, { force: false })

  const written = await readBaseline(baselinePathFor(dir))
  expect(written?.accepted.length).toBeGreaterThan(0)
  expect(written?.accepted.some((entry) => entry.concept === 'correctness.no-debugger')).toBe(true)
  expect(out).toContain('correctness.no-debugger')
  expect(out).toContain(`Commit ${join('.slop-gate', 'baseline.json').replaceAll('\\', '/')}`)
  expect(process.exitCode ?? 0).toBe(EXIT_CODES.clean)
})

test('a check after create has nothing left to fail on, and says the baseline is why', async () => {
  await run(create, { force: false })

  const loaded = await loadedConfig()
  const result = await runCheck({
    rootDir: dir,
    config: loaded,
    engines: defaultEngines(dir, undefined, undefined),
  })

  expect(result.diagnostics).toEqual([])
  expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 })
  expect(result.baseline?.accepted).toBe(1)
  expect(result.baseline?.path).toBe('.slop-gate/baseline.json')
  expect(result.baseline?.stale).toEqual([])
})

test('a finding written after the baseline is new, and the baseline does not hide it', async () => {
  await run(create, { force: false })
  await writeFile(join(dir, 'new.ts'), 'export function h() {\n  debugger\n}\n')

  const loaded = await loadedConfig()
  const result = await runCheck({
    rootDir: dir,
    config: loaded,
    engines: defaultEngines(dir, undefined, undefined),
  })

  expect(result.diagnostics.map((finding) => finding.file)).toEqual(['new.ts'])
  expect(result.counts.error).toBe(1)
  expect(result.baseline?.accepted).toBe(1)
})

test('an unrelated edit above an accepted finding keeps it accepted', async () => {
  await run(create, { force: false })
  await writeFile(join(dir, 'dirty.ts'), '// a comment nobody asked for\n\nexport function f() {\n  debugger\n}\n')

  const loaded = await loadedConfig()
  const result = await runCheck({
    rootDir: dir,
    config: loaded,
    engines: defaultEngines(dir, undefined, undefined),
  })

  expect(result.diagnostics).toEqual([])
  expect(result.baseline?.accepted).toBe(1)
  expect(result.baseline?.stale).toEqual([])
})

test('create refuses to replace an existing baseline without --force', async () => {
  await run(create, { force: false })
  const { err } = await run(create, { force: false })

  expect(err).toContain('already exists')
  expect(err).toContain('sgate baseline create --force')
  expect(process.exitCode).toBe(EXIT_CODES.config)
})

test('create --force states how many findings it newly accepted, so laundering debt is visible', async () => {
  await writeBaseline(baselinePathFor(dir), [])
  const { out } = await run(create, { force: true })
  expect(out).toMatch(/\n {2}[1-9]\d* newly accepted, 0 no longer found\n/)
})

test('update drops an entry whose finding is fixed and keeps the rest', async () => {
  await writeFile(join(dir, 'other.ts'), 'export function g() {\n  debugger\n}\n')
  await run(create, { force: false })
  const before = await readBaseline(baselinePathFor(dir))
  expect(before?.accepted.length).toBe(2)

  await writeFile(join(dir, 'other.ts'), 'export function g() {\n  return 1\n}\n')
  const { out } = await run(update, {})

  const after = await readBaseline(baselinePathFor(dir))
  expect(after?.accepted.length).toBe(1)
  expect(after?.accepted[0]?.file).toBe('dirty.ts')
  expect(out).toContain('dropped 1 fixed finding(s)')
})

test('update never adds an entry, and names what still fails instead', async () => {
  await run(create, { force: false })
  await writeFile(join(dir, 'new.ts'), 'export function h() {\n  debugger\n}\n')

  const { out } = await run(update, {})

  const after = await readBaseline(baselinePathFor(dir))
  expect(after?.accepted.length).toBe(1)
  expect(after?.accepted.some((entry) => entry.file === 'new.ts')).toBe(false)
  expect(out).toContain('still fail `sgate check`')
  expect(out).toContain('sgate baseline create --force')
})

test('update leaves the file untouched when nothing is fixed', async () => {
  await run(create, { force: false })
  const before = await readFile(baselinePathFor(dir), 'utf8')

  const { out } = await run(update, {})

  expect(await readFile(baselinePathFor(dir), 'utf8')).toBe(before)
  expect(out).toContain('already current')
})

test('update on a repository with no baseline points at create rather than writing one', async () => {
  const { err } = await run(update, {})
  expect(err).toContain('sgate baseline create')
  expect(process.exitCode).toBe(EXIT_CODES.config)
})

test('show reads the file and spawns no engine, so it cannot report staleness', async () => {
  await run(create, { force: false })
  // Deleting the source would make the finding stale for a *run*; `show` reads the file only, so its
  // answer is unchanged. That is the boundary, asserted rather than described.
  await rm(join(dir, 'dirty.ts'))
  const { out } = await run(show, {})

  expect(out).toContain('1 accepted finding(s) in 1 file(s)')
  expect(out).toContain('dirty.ts')
  expect(out).toContain('sgate baseline update')
})

test('show treats an absent baseline as the answer, not as an error', async () => {
  const { out } = await run(show, {})
  expect(out).toContain('no baseline at')
  expect(process.exitCode ?? 0).toBe(EXIT_CODES.clean)
})

test('create warns when the gitignore `sgate init` writes would swallow the baseline', async () => {
  await mkdir(join(dir, '.slop-gate'), { recursive: true })
  await writeFile(join(dir, '.slop-gate', '.gitignore'), '*\n')
  const { err } = await run(create, { force: false })
  expect(err).toContain('!baseline.json')
})

test('create is silent about the gitignore once it exempts the baseline', async () => {
  await mkdir(join(dir, '.slop-gate'), { recursive: true })
  await writeBaseline(baselinePathFor(dir), [])
  await writeFile(join(dir, '.slop-gate', '.gitignore'), '*\n!.gitignore\n!baseline.json\n')
  const { err } = await run(create, { force: true })
  expect(err).not.toContain('!baseline.json')
})

test('a malformed baseline stops a run rather than being read as no baseline at all', async () => {
  await writeBaseline(baselinePathFor(dir), [])
  await writeFile(baselinePathFor(dir), '{ "version": 1 }\n')
  await expect(run(update, {})).rejects.toThrow(/accepted/)
})
