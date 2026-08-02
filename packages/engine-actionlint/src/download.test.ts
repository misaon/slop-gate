import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { ActionlintInstallError, extractTarGzEntry, installActionlint } from './download.ts'
import { ACTIONLINT_CHECKSUMS, ACTIONLINT_VERSION, actionlintAsset } from './release.ts'

const run = promisify(execFile)

const PAYLOAD = '#!/bin/sh\necho actionlint 1.7.12\n'
const LINUX_ASSET = actionlintAsset('linux', 'x64')!

let workspace: string
let archive: Uint8Array
let digest: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'sgate-actionlint-download-'))
  // Built with the system `tar`, not hand-assembled: an extractor tested only against blocks this
  // same file wrote would prove the reader agrees with itself, which is not the property under test.
  // A real archiver produces the padding, the header checksum and (on bsdtar) the pax entries the
  // reader has to skip past.
  const staging = join(workspace, 'staging')
  await mkdir(staging, { recursive: true })
  await writeFile(join(staging, 'actionlint'), PAYLOAD, { mode: 0o755 })
  await writeFile(join(staging, 'README.md'), '# not the binary\n')
  await run('tar', ['-czf', join(workspace, 'release.tar.gz'), '-C', staging, 'README.md', 'actionlint'])
  archive = new Uint8Array(await readFile(join(workspace, 'release.tar.gz')))
  digest = createHash('sha256').update(archive).digest('hex')
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

const respond = (bytes: Uint8Array) => async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
})

const refuse = () => {
  throw new Error('no request should have been made')
}

test('extracts the named entry and ignores every other one', () => {
  expect(new TextDecoder().decode(extractTarGzEntry(archive, 'actionlint'))).toBe(PAYLOAD)
  expect(extractTarGzEntry(archive, 'nothing-by-this-name')).toBeUndefined()
})

test('a verified download lands intact in the version-scoped cache', async () => {
  const cache = join(workspace, 'cache-ok')
  const result = await installActionlint({
    platform: 'linux',
    arch: 'x64',
    env: { SLOP_GATE_CACHE_DIR: cache },
    fetch: respond(archive),
    checksums: { [LINUX_ASSET]: digest },
  })

  const directory = join(cache, 'actionlint', ACTIONLINT_VERSION)
  const expectedPath = join(directory, 'actionlint')
  expect(result).toEqual({ path: expectedPath, version: ACTIONLINT_VERSION, cached: false })
  // The digest of what landed, not just its text: this is the assertion that says the bytes executed
  // later are the bytes that were verified, and it is the same statement on every platform.
  expect(createHash('sha256').update(await readFile(expectedPath)).digest('hex')).toBe(
    createHash('sha256').update(PAYLOAD).digest('hex'),
  )
  // Nothing left behind from the staged write. `readdir` rather than shelling out to `ls`, which
  // does not exist on a Windows runner.
  expect(await readdir(directory)).toEqual(['actionlint'])
})

test.skipIf(process.platform === 'win32')('the installed binary is executable', async () => {
  // Split out and skipped on Windows because the *behaviour* is platform-specific rather than the
  // test being lazy: NTFS has no POSIX execute bit, so `mode & 0o111` is always 0 there and `chmod`
  // is a no-op — an assertion that can only ever fail. Everything portable about the install is
  // asserted in the test above, on every platform.
  //
  // Worth asserting at all because it is a defect that has actually shipped: the npm `hadolint`
  // wrapper writes its downloaded binary with `writeFile` and never chmods it, so on any Unix the
  // file lands 0644 and every spawn fails EACCES (M0 follow-ups, distribution findings).
  const cache = join(workspace, 'cache-mode')
  await installActionlint({
    platform: 'linux',
    arch: 'x64',
    env: { SLOP_GATE_CACHE_DIR: cache },
    fetch: respond(archive),
    checksums: { [LINUX_ASSET]: digest },
  })
  expect((await stat(join(cache, 'actionlint', ACTIONLINT_VERSION, 'actionlint'))).mode & 0o111).not.toBe(0)
})

test('the shipped digest table is what a real install is compared against', async () => {
  // Driven against `ACTIONLINT_CHECKSUMS` with no override: the fixture archive is not the upstream
  // asset, so a working verifier must reject it. This is the test that would fail if the comparison
  // were ever short-circuited or the table quietly emptied.
  const cache = join(workspace, 'cache-mismatch')
  const failure = await installActionlint({
    platform: 'linux',
    arch: 'x64',
    env: { SLOP_GATE_CACHE_DIR: cache },
    fetch: respond(archive),
  }).catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(ActionlintInstallError)
  expect(String(failure)).toContain('checksum mismatch')
  expect(String(failure)).toContain(ACTIONLINT_CHECKSUMS[LINUX_ASSET]!)
  expect(String(failure)).toContain('Nothing was written')
  await expect(stat(join(cache, 'actionlint', ACTIONLINT_VERSION, 'actionlint'))).rejects.toThrow(/ENOENT/)
})

test('an already-populated cache is reported without fetching anything', async () => {
  const cache = join(workspace, 'cache-warm')
  const directory = join(cache, 'actionlint', ACTIONLINT_VERSION)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'actionlint'), PAYLOAD, { mode: 0o755 })

  expect(
    await installActionlint({ platform: 'linux', arch: 'x64', env: { SLOP_GATE_CACHE_DIR: cache }, fetch: refuse }),
  ).toEqual({ path: join(directory, 'actionlint'), version: ACTIONLINT_VERSION, cached: true })
})

test('an archive that verifies but holds no binary is a failure, not an empty install', async () => {
  const staging = join(workspace, 'empty-staging')
  await mkdir(staging, { recursive: true })
  await writeFile(join(staging, 'README.md'), '# only docs\n')
  await run('tar', ['-czf', join(workspace, 'empty.tar.gz'), '-C', staging, 'README.md'])
  const empty = new Uint8Array(await readFile(join(workspace, 'empty.tar.gz')))

  await expect(
    installActionlint({
      platform: 'linux',
      arch: 'x64',
      env: { SLOP_GATE_CACHE_DIR: join(workspace, 'cache-empty') },
      fetch: respond(empty),
      checksums: { [LINUX_ASSET]: createHash('sha256').update(empty).digest('hex') },
    }),
  ).rejects.toThrow(/contains no `actionlint` entry/)
})

test('Windows is refused by name, with the reason and the two ways out', async () => {
  await expect(installActionlint({ platform: 'win32', arch: 'x64', fetch: refuse })).rejects.toThrow(/\.zip/)
  await expect(installActionlint({ platform: 'win32', arch: 'x64', fetch: refuse })).rejects.toThrow(
    /SLOP_GATE_ACTIONLINT_PATH/,
  )
})

test('an unsupported platform is refused before any request is made', async () => {
  await expect(installActionlint({ platform: 'aix', arch: 'ppc64', fetch: refuse })).rejects.toThrow(
    new RegExp(`no actionlint ${ACTIONLINT_VERSION.replaceAll('.', '\\.')} download is available for aix/ppc64`),
  )
})

test('a failed request is reported as an install error rather than a raw fetch failure', async () => {
  await expect(
    installActionlint({
      platform: 'linux',
      arch: 'x64',
      env: { SLOP_GATE_CACHE_DIR: join(workspace, 'cache-404') },
      fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    }),
  ).rejects.toThrow(/responded 404/)
})

test('an asset with no recorded digest is refused rather than downloaded unverified', async () => {
  await expect(
    installActionlint({
      platform: 'linux',
      arch: 'x64',
      env: { SLOP_GATE_CACHE_DIR: join(workspace, 'cache-nodigest') },
      fetch: refuse,
      checksums: {},
    }),
  ).rejects.toThrow(/refusing to download an unverifiable binary/)
})
