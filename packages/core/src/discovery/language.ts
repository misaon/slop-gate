import type { LanguageId } from '../languages.ts'

const BY_EXTENSION: Readonly<Record<string, LanguageId>> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  mdx: 'markdown',
  dockerfile: 'dockerfile',
}

/** Files whose name, not extension, decides the language. */
const JSONC_BASENAMES = new Set(['tsconfig.json', 'jsconfig.json', '.oxlintrc.json', 'biome.json'])

/** `tsconfig.build.json`, `jsconfig.app.json` — the project-references naming convention. */
const JSONC_PATTERN = /^(?:tsconfig|jsconfig)\..+\.json$/

const WORKFLOW_PATTERN = /^\.github\/workflows\/[^/]+\.ya?ml$/

export function detectLanguage(relativePath: string): LanguageId {
  const normalized = relativePath.replaceAll('\\', '/')
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
  const lower = basename.toLowerCase()

  if (WORKFLOW_PATTERN.test(normalized)) return 'github-workflow'
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (JSONC_BASENAMES.has(lower) || JSONC_PATTERN.test(lower) || lower.endsWith('.tsconfig.json')) return 'jsonc'

  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return 'unknown'
  return BY_EXTENSION[lower.slice(dot + 1)] ?? 'unknown'
}
