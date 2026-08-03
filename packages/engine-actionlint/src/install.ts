import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { ACTIONLINT_CHECKSUMS, ACTIONLINT_RELEASE_URL, ACTIONLINT_VERSION, actionlintAsset } from './release.ts'
import { actionlintBinaryName, actionlintCacheDir } from './resolve-binary.ts'

const TAR_BLOCK = 512

export type InstallActionlintOptions = {
  platform?: string
  arch?: string
  env?: Readonly<Record<string, string | undefined>>
  homeDir?: string
  /** Injected in tests. Production uses the global `fetch`. */
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>
  /**
   * Injected in tests so the success path can use a locally built archive. The *mismatch* path is
   * exercised against the real `ACTIONLINT_CHECKSUMS` — a suite that only ever supplied its own digests
   * would prove the comparison runs, not that the shipped digests are what it compares against.
   */
  checksums?: Readonly<Record<string, string>>
  signal?: AbortSignal
}

export type InstallActionlintResult = {
  readonly path: string
  readonly version: string
  /** True when the cache already held a binary and nothing was fetched. */
  readonly cached: boolean
}

export class ActionlintInstallError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ActionlintInstallError'
  }
}

/**
 * D3, implemented directly: download the pinned release, verify it against the digest upstream
 * published, and only then put it somewhere that will be executed.
 *
 * **Nothing on the check path ever calls this** — the only caller is `sgate engines install`. Why
 * "first use" cannot be the trigger is in `createActionlintEngine` and spec §13.5.
 *
 * **The digest is checked before anything is written, not after.** Verify-then-move over a file
 * already on disk leaves a window where a partially-written or substituted binary exists at the final
 * path; here the bytes are hashed in memory and a mismatch throws having created nothing. The
 * extracted binary then lands via a temporary file and a `rename`, so a concurrent
 * `resolveActionlintBinary` sees either no file or a complete, verified one.
 */
export async function installActionlint(options: InstallActionlintOptions = {}): Promise<InstallActionlintResult> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const fetchImpl = options.fetch ?? ((url: string) => fetch(url, options.signal === undefined ? {} : { signal: options.signal }))

  const asset = actionlintAsset(platform, arch)
  if (asset === undefined) {
    throw new ActionlintInstallError(
      `no actionlint ${ACTIONLINT_VERSION} download is available for ${platform}/${arch}. ` +
        (platform === 'win32'
          ? 'Upstream publishes a Windows binary as a .zip and this adapter reads only .tar.gz — install actionlint yourself and put it on PATH, or point SLOP_GATE_ACTIONLINT_PATH at it.'
          : 'Install actionlint yourself and put it on PATH, or point SLOP_GATE_ACTIONLINT_PATH at it.'),
    )
  }

  const expected = (options.checksums ?? ACTIONLINT_CHECKSUMS)[asset]
  if (expected === undefined) {
    // Unreachable while `ACTIONLINT_ASSETS` and `ACTIONLINT_CHECKSUMS` are transcribed from the same
    // upstream file — but an unverified download is what this module exists to refuse, so it refuses
    // rather than trusting that invariant at run time.
    throw new ActionlintInstallError(`no recorded SHA-256 for ${asset}; refusing to download an unverifiable binary`)
  }

  const directory = actionlintCacheDir({
    platform,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
  })
  const binaryName = actionlintBinaryName(platform)
  const destination = join(directory, binaryName)
  if (existsSync(destination)) return { path: destination, version: ACTIONLINT_VERSION, cached: true }

  const url = `${ACTIONLINT_RELEASE_URL}/${asset}`
  let archive: Uint8Array
  try {
    const response = await fetchImpl(url)
    if (!response.ok) throw new ActionlintInstallError(`${url} responded ${response.status}`)
    archive = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof ActionlintInstallError) throw error
    throw new ActionlintInstallError(`could not download ${url}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }

  const actual = createHash('sha256').update(archive).digest('hex')
  if (actual !== expected) {
    throw new ActionlintInstallError(
      `checksum mismatch for ${asset}: expected ${expected}, got ${actual}. Nothing was written. ` +
        'Either the download was corrupted or the published asset changed — do not work around this by rerunning.',
    )
  }

  const binary = extractTarGzEntry(archive, binaryName)
  if (binary === undefined) {
    throw new ActionlintInstallError(`${asset} verified against its digest but contains no \`${binaryName}\` entry`)
  }

  await mkdir(directory, { recursive: true })
  const staging = `${destination}.${process.pid}.partial`
  try {
    await writeFile(staging, binary, { mode: 0o755 })
    await rename(staging, destination)
  } catch (error) {
    await rm(staging, { force: true })
    throw new ActionlintInstallError(`could not write ${destination}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }

  return { path: destination, version: ACTIONLINT_VERSION, cached: false }
}

/**
 * Pulls one regular-file entry out of a gzipped tar by base name. A deliberately small ustar reader
 * rather than a dependency: adding a tar library to the install path of a security-sensitive download
 * is a worse trade than sixty lines that only ever read.
 *
 * Non-regular entries are skipped rather than treated as data — GoReleaser's own archives are plain
 * ustar, but `bsdtar` prepends a `pax_global_header` (type `g`) and per-entry `x` headers, and a reader
 * that mistook one for the payload would "succeed" with the wrong bytes. Nothing here follows a link,
 * writes a path from the archive, or extracts more than the single requested name, so the usual
 * tar-extraction traversal hazards have no surface to appear on.
 */
export function extractTarGzEntry(archive: Uint8Array, entryName: string): Uint8Array | undefined {
  const tar: Uint8Array = gunzipSync(archive)
  const decoder = new TextDecoder()

  for (let offset = 0; offset + TAR_BLOCK <= tar.length; ) {
    const header = tar.subarray(offset, offset + TAR_BLOCK)
    // Two consecutive zero blocks end the archive; one is enough to stop reading.
    if (header.every((byte) => byte === 0)) break

    const name = trimNul(decoder.decode(header.subarray(0, 100)))
    const prefix = trimNul(decoder.decode(header.subarray(345, 500)))
    const size = parseOctal(decoder.decode(header.subarray(124, 136)))
    const typeFlag = String.fromCharCode(header[156] ?? 0)
    const dataStart = offset + TAR_BLOCK
    const isRegularFile = typeFlag === '0' || typeFlag === '\0'
    const fullName = prefix === '' ? name : `${prefix}/${name}`

    if (isRegularFile && basename(fullName) === entryName) {
      if (dataStart + size > tar.length) return undefined
      return tar.subarray(dataStart, dataStart + size)
    }

    offset = dataStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
  }

  return undefined
}

function trimNul(value: string): string {
  const end = value.indexOf('\0')
  return end === -1 ? value : value.slice(0, end)
}

function parseOctal(field: string): number {
  const digits = field.replaceAll('\0', '').trim()
  if (digits === '') return 0
  const parsed = Number.parseInt(digits, 8)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Archive paths are always POSIX, so this must not be `node:path`'s host-dependent `basename`. */
function basename(entry: string): string {
  const slash = entry.lastIndexOf('/')
  return slash === -1 ? entry : entry.slice(slash + 1)
}
