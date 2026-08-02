/**
 * The upstream release this adapter is pinned to, and the digests that make fetching it safe.
 *
 * **Pinned, not resolved at run time.** `github-actionlint`, the npm wrapper, resolves `latest` on
 * first run and executes what it downloads without checking a digest (recorded in the M0 follow-ups'
 * distribution findings). Both halves of that are avoided here: the version is a constant reviewed in
 * a pull request, and nothing is executed before its SHA-256 matches the line below.
 *
 * **The digests are upstream's own, transcribed verbatim** from
 * `https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_checksums.txt`
 * — not computed from a download of ours, which would only prove we hashed whatever we were served.
 *
 * **Pinning has a cost, and it is measured rather than theoretical.** Every false positive the
 * corpus measurement attributed to `syntax-check` — 7 of 9 — is actionlint 1.7.12 not yet knowing
 * about GitHub Actions features that shipped in May and June 2026 (`concurrency.queue`, background
 * and `wait:` steps), and 18 of the `runner-label` findings are `ubuntu-26.04`, a real GitHub-hosted
 * runner that upstream adds in the release after this one. Because we pin, that staleness is *our*
 * choice on behalf of the user: someone whose `PATH` already has a newer actionlint gets strictly
 * fewer false positives than someone we downloaded for. That asymmetry is the argument for tracking
 * upstream releases actively rather than pinning and forgetting — see the M0 follow-ups.
 */
export const ACTIONLINT_VERSION = '1.7.12'

/** `platform arch` → the release asset's base name, keyed the way `process.platform`/`process.arch` report. */
export const ACTIONLINT_ASSETS: Readonly<Record<string, string>> = {
  'darwin arm64': `actionlint_${ACTIONLINT_VERSION}_darwin_arm64.tar.gz`,
  'darwin x64': `actionlint_${ACTIONLINT_VERSION}_darwin_amd64.tar.gz`,
  'freebsd ia32': `actionlint_${ACTIONLINT_VERSION}_freebsd_386.tar.gz`,
  'freebsd x64': `actionlint_${ACTIONLINT_VERSION}_freebsd_amd64.tar.gz`,
  'linux arm': `actionlint_${ACTIONLINT_VERSION}_linux_armv6.tar.gz`,
  'linux arm64': `actionlint_${ACTIONLINT_VERSION}_linux_arm64.tar.gz`,
  'linux ia32': `actionlint_${ACTIONLINT_VERSION}_linux_386.tar.gz`,
  'linux x64': `actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz`,
  // The three Windows assets upstream publishes are deliberately absent. They are `.zip`, and Node
  // ships no zip reader — `node:zlib` gunzips, which is all the tar path below needs, but a zip needs
  // a central-directory parse as well. Rather than carry a zip implementation for one platform, this
  // adapter tells a Windows user to put `actionlint.exe` on `PATH` (or name it with
  // `SLOP_GATE_ACTIONLINT_PATH`) and reports itself unavailable until they do. Upstream's own
  // coverage is complete, including Windows arm64; ours is not, and saying so is better than a
  // half-working extractor.
}

/**
 * Asset name → SHA-256, transcribed from upstream's published `actionlint_1.7.12_checksums.txt`.
 * Includes the Windows entries even though nothing downloads them: the file is the record of what
 * upstream published, and trimming it to what today's extractor happens to support would make a
 * future Windows implementation start from a smaller, unverifiable copy.
 */
export const ACTIONLINT_CHECKSUMS: Readonly<Record<string, string>> = {
  [`actionlint_${ACTIONLINT_VERSION}_darwin_amd64.tar.gz`]:
    '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644',
  [`actionlint_${ACTIONLINT_VERSION}_darwin_arm64.tar.gz`]:
    'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
  [`actionlint_${ACTIONLINT_VERSION}_freebsd_386.tar.gz`]:
    '7170cc3db006f83154583dc385c84bea3f6ee767a167bb9ca41de6593ebbb186',
  [`actionlint_${ACTIONLINT_VERSION}_freebsd_amd64.tar.gz`]:
    '3de1b027d0b749e81d6d972cbf5d14dc708a275248da1ba4eed4a9af707d1339',
  [`actionlint_${ACTIONLINT_VERSION}_linux_386.tar.gz`]:
    '72a44b32c2d032700e6d0c23ca2f540b67519ec68db098ddfcfa96059e61f723',
  [`actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz`]:
    '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
  [`actionlint_${ACTIONLINT_VERSION}_linux_arm64.tar.gz`]:
    '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6',
  [`actionlint_${ACTIONLINT_VERSION}_linux_armv6.tar.gz`]:
    'ae4a0a5227578e66f5d00ee02788d5c64fdae1fa6484ab88ceaeee9359c28fa4',
  [`actionlint_${ACTIONLINT_VERSION}_windows_386.zip`]:
    'cdc8643b2c8dc890c76ad16095da97e75f86572805cc3573cc13f31ea0f19127',
  [`actionlint_${ACTIONLINT_VERSION}_windows_amd64.zip`]:
    '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9',
  [`actionlint_${ACTIONLINT_VERSION}_windows_arm64.zip`]:
    'cadcf7ea4efe3a68728893813643cebe1185e5b1d4be5b96245f65c9a4d5ea41',
}

export const ACTIONLINT_RELEASE_URL = `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}`

/** The asset for a platform/arch pair, or `undefined` where upstream ships nothing this adapter can extract. */
export function actionlintAsset(platform: string, arch: string): string | undefined {
  return ACTIONLINT_ASSETS[`${platform} ${arch}`]
}
