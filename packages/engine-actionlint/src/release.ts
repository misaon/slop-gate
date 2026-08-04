export const ACTIONLINT_VERSION = '1.7.12'

export const ACTIONLINT_ASSETS: Readonly<Record<string, string>> = {
  'darwin arm64': `actionlint_${ACTIONLINT_VERSION}_darwin_arm64.tar.gz`,
  'darwin x64': `actionlint_${ACTIONLINT_VERSION}_darwin_amd64.tar.gz`,
  'freebsd ia32': `actionlint_${ACTIONLINT_VERSION}_freebsd_386.tar.gz`,
  'freebsd x64': `actionlint_${ACTIONLINT_VERSION}_freebsd_amd64.tar.gz`,
  'linux arm': `actionlint_${ACTIONLINT_VERSION}_linux_armv6.tar.gz`,
  'linux arm64': `actionlint_${ACTIONLINT_VERSION}_linux_arm64.tar.gz`,
  'linux ia32': `actionlint_${ACTIONLINT_VERSION}_linux_386.tar.gz`,
  'linux x64': `actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz`,
}

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

export function actionlintAsset(platform: string, arch: string): string | undefined {
  return ACTIONLINT_ASSETS[`${platform} ${arch}`]
}
