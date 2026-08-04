import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HADOLINT_CHECKSUMS, HADOLINT_RELEASE_URL, HADOLINT_VERSION, hadolintAsset } from './release.ts'
import { hadolintBinaryName, hadolintCacheDir } from './resolve-binary.ts'

export type InstallHadolintOptions = {
  platform?: string
  arch?: string
  env?: Readonly<Record<string, string | undefined>>
  homeDir?: string
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>
  checksums?: Readonly<Record<string, string>>
  signal?: AbortSignal
}

export type InstallHadolintResult = {
  readonly path: string
  readonly version: string
  readonly cached: boolean
}

export class HadolintInstallError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'HadolintInstallError'
  }
}

export async function installHadolint(options: InstallHadolintOptions = {}): Promise<InstallHadolintResult> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const fetchImpl = options.fetch ?? ((url: string) => fetch(url, options.signal === undefined ? {} : { signal: options.signal }))

  const asset = hadolintAsset(platform, arch)
  if (asset === undefined) {
    throw new HadolintInstallError(
      `no hadolint ${HADOLINT_VERSION} download is available for ${platform}/${arch}. ` +
        (platform === 'win32'
          ? 'Upstream builds no Windows arm64 binary. Install hadolint yourself and put it on PATH, or point SLOP_GATE_HADOLINT_PATH at it.'
          : 'Install hadolint yourself and put it on PATH, or point SLOP_GATE_HADOLINT_PATH at it.'),
    )
  }

  const expected = (options.checksums ?? HADOLINT_CHECKSUMS)[asset]
  if (expected === undefined) {
    throw new HadolintInstallError(`no recorded SHA-256 for ${asset}; refusing to download an unverifiable binary`)
  }

  const directory = hadolintCacheDir({
    platform,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
  })
  const destination = join(directory, hadolintBinaryName(platform))
  if (existsSync(destination)) return { path: destination, version: HADOLINT_VERSION, cached: true }

  const url = `${HADOLINT_RELEASE_URL}/${asset}`
  let binary: Uint8Array
  try {
    const response = await fetchImpl(url)
    if (!response.ok) throw new HadolintInstallError(`${url} responded ${response.status}`)
    binary = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof HadolintInstallError) throw error
    throw new HadolintInstallError(`could not download ${url}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }

  const actual = createHash('sha256').update(binary).digest('hex')
  if (actual !== expected) {
    throw new HadolintInstallError(
      `checksum mismatch for ${asset}: expected ${expected}, got ${actual}. Nothing was written. ` +
        'Either the download was corrupted or the published asset changed — do not work around this by rerunning.',
    )
  }

  await mkdir(directory, { recursive: true })
  const staging = `${destination}.${process.pid}.partial`
  try {
    await writeFile(staging, binary, { mode: 0o755 })
    await rename(staging, destination)
  } catch (error) {
    await rm(staging, { force: true })
    throw new HadolintInstallError(`could not write ${destination}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }

  return { path: destination, version: HADOLINT_VERSION, cached: false }
}
