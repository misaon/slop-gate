import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { DEFAULT_CONFIG, loadCliConfig } from './config.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-config-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('falls back to the given default when no config file exists', async () => {
  const result = await loadCliConfig(dir, DEFAULT_CONFIG)
  expect(result).toEqual({ kind: 'default', config: DEFAULT_CONFIG })
})

test('loads a real config file and reports its path repo-relative and POSIX', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['strict'] }\n")
  const result = await loadCliConfig(dir, DEFAULT_CONFIG)

  expect(result.kind).toBe('loaded')
  if (result.kind !== 'loaded') throw new Error('expected loaded')
  expect(result.config.extends).toEqual(['strict'])
  expect(result.configFile).toBe('slop-gate.config.ts')
})

test('reports a broken config file as an error, without throwing, after writing to stderr', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), 'export default {\n')
  const stderr: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: string) => {
    stderr.push(chunk)
    return true
  }) as typeof process.stderr.write

  try {
    const result = await loadCliConfig(dir, DEFAULT_CONFIG)
    expect(result.kind).toBe('error')
    // The same text on both channels. stderr is where a human running a command looks; `message` is
    // for a caller with somewhere else to put it — `sgate mcp` hands it back to the client, since an
    // agent told only "configuration failed, check the log" has nothing to act on.
    expect(result.kind === 'error' && result.message).not.toBe('')
    expect(stderr.join('')).toContain(result.kind === 'error' ? result.message : 'unreachable')
  } finally {
    process.stderr.write = original
  }
})
