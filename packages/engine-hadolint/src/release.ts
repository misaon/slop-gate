export const HADOLINT_VERSION = '2.15.1'

export const HADOLINT_ASSETS: Readonly<Record<string, string>> = {
  'darwin arm64': 'hadolint-macos-arm64',
  'darwin x64': 'hadolint-macos-x86_64',
  'linux arm64': 'hadolint-linux-arm64',
  'linux x64': 'hadolint-linux-x86_64',
  'win32 x64': 'hadolint-windows-x86_64.exe',
}

export const HADOLINT_CHECKSUMS: Readonly<Record<string, string>> = {
  'hadolint-linux-arm64': 'f6198ef8090f404dbb771abfee086eb8c48ac177f30da7fd3510aca35b344b5d',
  'hadolint-linux-x86_64': 'c7187db94eeeeca956519a6af171adc31453941a1e777961f6e680f697c8c507',
  'hadolint-macos-arm64': '5c09f3213f8e40406abe048233d985eebef336d4a6a20021be47fadb6cf480a2',
  'hadolint-macos-x86_64': 'ffe9bb18b23d5ed1eae50237aecdbb523d016e96da0bd4e7aa432040acfc3fde',
  'hadolint-windows-x86_64.exe': '01d927294962b5387f9ead4f18679158452be4f17c765ad0bdffe5264b9c7b0a',
}

export const HADOLINT_RELEASE_URL = `https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}`

export function hadolintAsset(platform: string, arch: string): string | undefined {
  return HADOLINT_ASSETS[`${platform} ${arch}`]
}
