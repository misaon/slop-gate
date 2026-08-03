import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { HadolintInstallError, installHadolint } from './install.ts'
import { HADOLINT_VERSION } from './release.ts'
import { hadolintCacheDir } from './resolve-binary.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sgate-hadolint-'))
  roots.push(root)
  return root
}

const bytes = new TextEncoder().encode('#!/bin/sh\necho hadolint\n')
const digest = createHash('sha256').update(bytes).digest('hex')

const respond = (payload: Uint8Array) => async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer,
})

test('a verified download lands executable at the version-scoped path', async () => {
  const home = await scratch()
  const result = await installHadolint({
    platform: 'linux',
    arch: 'x64',
    env: {},
    homeDir: home,
    fetch: respond(bytes),
    checksums: { 'hadolint-linux-x86_64': digest },
  })

  expect(result.cached).toBe(false)
  expect(result.version).toBe(HADOLINT_VERSION)
  expect(result.path).toBe(join(hadolintCacheDir({ platform: 'linux', env: {}, homeDir: home }), 'hadolint'))
  await expect(readFile(result.path, 'utf8')).resolves.toContain('echo hadolint')
  // The npm hadolint wrapper's second defect is writing 0644 and never chmodding, so every Unix spawn
  // fails EACCES. Asserted rather than assumed — but the assertion differs by platform rather than
  // vanishing on one: Windows has no execute bit, so `mode & 0o111` is always 0 there and demanding it
  // would fail a correct install. Both branches assert, because a test that silently checks nothing on
  // one platform is how a Windows regression would ship unnoticed.
  const { mode, size } = await stat(result.path)
  const usable = process.platform === 'win32' ? size > 0 : (mode & 0o111) !== 0
  expect(usable).toBe(true)
})

test('a digest mismatch throws and writes nothing at all', async () => {
  const home = await scratch()
  await expect(
    installHadolint({
      platform: 'linux',
      arch: 'x64',
      env: {},
      homeDir: home,
      fetch: respond(bytes),
      checksums: { 'hadolint-linux-x86_64': 'f'.repeat(64) },
    }),
  ).rejects.toThrow(/checksum mismatch/)

  const destination = join(hadolintCacheDir({ platform: 'linux', env: {}, homeDir: home }), 'hadolint')
  await expect(stat(destination)).rejects.toThrow(/ENOENT/)
})

test('the shipped digests are the ones compared against, not just any digests', async () => {
  // No `checksums` override: this drives the real `HADOLINT_CHECKSUMS` table, so a table that had
  // drifted from upstream would fail here rather than pass against a fixture of its own making.
  const home = await scratch()
  await expect(
    installHadolint({ platform: 'linux', arch: 'x64', env: {}, homeDir: home, fetch: respond(bytes) }),
  ).rejects.toThrow(/checksum mismatch for hadolint-linux-x86_64/)
})

test('a second install is served from the cache without fetching', async () => {
  const home = await scratch()
  const options = {
    platform: 'linux' as const,
    arch: 'x64' as const,
    env: {},
    homeDir: home,
    checksums: { 'hadolint-linux-x86_64': digest },
  }
  await installHadolint({ ...options, fetch: respond(bytes) })

  let fetched = false
  const result = await installHadolint({
    ...options,
    fetch: async () => {
      fetched = true
      throw new Error('should not be reached')
    },
  })
  expect(result.cached).toBe(true)
  expect(fetched).toBe(false)
})

test('Windows arm64 refuses with the reason, since upstream builds nothing for it', async () => {
  await expect(installHadolint({ platform: 'win32', arch: 'arm64', env: {}, homeDir: await scratch() })).rejects.toThrow(
    /no Windows arm64 binary/,
  )
})

test('a non-ok response is an install error rather than a corrupt cache entry', async () => {
  const home = await scratch()
  await expect(
    installHadolint({
      platform: 'linux',
      arch: 'x64',
      env: {},
      homeDir: home,
      fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    }),
  ).rejects.toThrow(HadolintInstallError)
})
