import { expect, test } from 'vitest'
import { ACTIONLINT_ASSETS, ACTIONLINT_CHECKSUMS, ACTIONLINT_VERSION, actionlintAsset } from './release.ts'

test('every downloadable asset has a recorded digest', () => {
  for (const asset of Object.values(ACTIONLINT_ASSETS)) {
    expect(ACTIONLINT_CHECKSUMS[asset], `${asset} has no recorded SHA-256`).toMatch(/^[0-9a-f]{64}$/)
  }
})

test('every recorded digest is a SHA-256 of the pinned version', () => {
  for (const [asset, sha] of Object.entries(ACTIONLINT_CHECKSUMS)) {
    expect(sha, asset).toMatch(/^[0-9a-f]{64}$/)
    expect(asset).toContain(`_${ACTIONLINT_VERSION}_`)
  }
})

test('Windows assets are recorded but deliberately not downloadable', () => {
  for (const arch of ['x64', 'arm64', 'ia32']) expect(actionlintAsset('win32', arch)).toBeUndefined()
  expect(Object.keys(ACTIONLINT_CHECKSUMS).filter((asset) => asset.includes('windows'))).toHaveLength(3)
})

test('the platforms this repository is developed and tested on are downloadable', () => {
  expect(actionlintAsset('darwin', 'arm64')).toBe(`actionlint_${ACTIONLINT_VERSION}_darwin_arm64.tar.gz`)
  expect(actionlintAsset('linux', 'x64')).toBe(`actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz`)
  expect(actionlintAsset('linux', 'arm64')).toBe(`actionlint_${ACTIONLINT_VERSION}_linux_arm64.tar.gz`)
})
