import { expect, test } from 'vitest'
import { HADOLINT_ASSETS, HADOLINT_CHECKSUMS, HADOLINT_RELEASE_URL, HADOLINT_VERSION, hadolintAsset } from './release.ts'

test('every asset this adapter can download has a recorded digest', () => {
  for (const asset of Object.values(HADOLINT_ASSETS)) {
    expect(HADOLINT_CHECKSUMS[asset], `no SHA-256 recorded for ${asset}`).toMatch(/^[0-9a-f]{64}$/)
  }
})

test('the checksum table records nothing that is not a published asset', () => {
  // The reverse of the assertion above. hadolint publishes exactly five binaries and this adapter can
  // use all five, so unlike actionlint's table there is no download-blocked entry to allow for — a
  // stray key here would be a transcription error.
  expect(Object.keys(HADOLINT_CHECKSUMS).sort()).toEqual(Object.values(HADOLINT_ASSETS).sort())
})

test('Windows x86_64 resolves, and Windows arm64 does not', () => {
  // The inverse of actionlint's platform gap, and worth pinning: hadolint ships a bare `.exe` rather
  // than a `.zip`, so Windows works here. Upstream builds no arm64 Windows binary at all.
  expect(hadolintAsset('win32', 'x64')).toBe('hadolint-windows-x86_64.exe')
  expect(hadolintAsset('win32', 'arm64')).toBeUndefined()
})

test('Linux resolves for both architectures, because the static Alpine build covers musl too', () => {
  expect(hadolintAsset('linux', 'x64')).toBe('hadolint-linux-x86_64')
  expect(hadolintAsset('linux', 'arm64')).toBe('hadolint-linux-arm64')
})

test('an unknown platform resolves to nothing rather than guessing', () => {
  expect(hadolintAsset('sunos', 'x64')).toBeUndefined()
  expect(hadolintAsset('linux', 'mips')).toBeUndefined()
})

test('the release URL names the pinned version', () => {
  expect(HADOLINT_RELEASE_URL).toBe(`https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}`)
})
