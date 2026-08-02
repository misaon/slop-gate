import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

test('a verified download lands executable in the version-scoped cache', async () => {
  const cache = join(workspace, 'cache-ok')
  const result = await installActionlint({
    platform: 'linux',
    arch: 'x64',
    env: { SLOP_GATE_CACHE_DIR: cache },
    fetch: respond(archive),
    checksums: { [LINUX_ASSET]: digest },
  })

  const expectedPath = join(cache, 'actionlint', ACTIONLINT_VERSION, 'actionlint')
  expect(result).toEqual({ path: expectedPath, version: ACTIONLINT_VERSION, cached: false })
  expect(await readFile(expectedPath, 'utf8')).toBe(PAYLOAD)
  // Executable, which `install.js` in the npm `hadolint` wrapper famously is not — the M0 follow-ups
  // record that exact defect (a 0644 binary and a spawn that fails EACCES) as a reason not to depend
  // on these wrappers, so it is asserted here rather than assumed.
  expect((await stat(expectedPath)).mode & 0o111).not.toBe(0)
  // Nothing is left behind from the staged write.
  expect(await run('sh', ['-c', `ls ${JSON.stringify(join(cache, 'actionlint', ACTIONLINT_VERSION))}`])).toHaveProperty(
    'stdout',
    'actionlint\n',
  )
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
