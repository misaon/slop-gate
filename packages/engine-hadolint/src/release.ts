/**
 * The upstream release this adapter is pinned to, and the digests that make fetching it safe.
 *
 * **Upstream's own digests, transcribed verbatim** from
 * `https://github.com/hadolint/hadolint/releases/download/v2.15.1/checksums.sha256` — not computed
 * from a download of ours, which would only prove we hashed whatever we were served. This is the
 * stronger of the two options available and is worth stating, because the sibling engine that was
 * measured alongside this one could not have it: shellcheck publishes no checksums file and no build
 * attestations at all, so a shellcheck adapter would have to carry digests we computed ourselves.
 * hadolint does publish them, so we use them.
 *
 * **The layout changed under us and will again.** v2.14.0 published a per-asset `<name>.sha256`
 * beside each binary; v2.15.0 replaced that with the single `checksums.sha256` transcribed here. A
 * version bump has to re-check which file to read, not just which tag.
 *
 * **These are raw binaries, not archives.** hadolint publishes the executable directly, so unlike
 * actionlint there is no tar or zip to unpack — and consequently **Windows x86_64 works here**, where
 * actionlint's Windows support is blocked on its assets being `.zip` and Node shipping no zip reader.
 * The one platform upstream does not build is Windows arm64.
 */
export const HADOLINT_VERSION = '2.15.1'

/** `platform arch` → the release asset name, keyed the way `process.platform`/`process.arch` report. */
export const HADOLINT_ASSETS: Readonly<Record<string, string>> = {
  'darwin arm64': 'hadolint-macos-arm64',
  'darwin x64': 'hadolint-macos-x86_64',
  'linux arm64': 'hadolint-linux-arm64',
  'linux x64': 'hadolint-linux-x86_64',
  'win32 x64': 'hadolint-windows-x86_64.exe',
  // `win32 arm64` is deliberately absent: upstream builds no Windows arm64 binary. Nothing else is
  // missing — the Linux builds are produced inside an `alpine:3.24` container and statically linked,
  // so they run on musl as well as glibc. (The M0 follow-ups previously grouped hadolint with zizmor
  // as lacking a musl build; that was wrong, and is corrected there.)
}

/**
 * Asset name → SHA-256, transcribed from upstream's published `checksums.sha256`. Includes the
 * Windows entry, which this adapter can actually use.
 */
export const HADOLINT_CHECKSUMS: Readonly<Record<string, string>> = {
  'hadolint-linux-arm64': 'f6198ef8090f404dbb771abfee086eb8c48ac177f30da7fd3510aca35b344b5d',
  'hadolint-linux-x86_64': 'c7187db94eeeeca956519a6af171adc31453941a1e777961f6e680f697c8c507',
  'hadolint-macos-arm64': '5c09f3213f8e40406abe048233d985eebef336d4a6a20021be47fadb6cf480a2',
  'hadolint-macos-x86_64': 'ffe9bb18b23d5ed1eae50237aecdbb523d016e96da0bd4e7aa432040acfc3fde',
  'hadolint-windows-x86_64.exe': '01d927294962b5387f9ead4f18679158452be4f17c765ad0bdffe5264b9c7b0a',
}

export const HADOLINT_RELEASE_URL = `https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}`

/** The asset for a platform/arch pair, or `undefined` where upstream builds nothing. */
export function hadolintAsset(platform: string, arch: string): string | undefined {
  return HADOLINT_ASSETS[`${platform} ${arch}`]
}
