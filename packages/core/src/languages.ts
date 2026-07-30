export const LANGUAGES = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'vue',
  'svelte',
  'astro',
  'css',
  'scss',
  'less',
  'html',
  'json',
  'jsonc',
  'yaml',
  'toml',
  'markdown',
  'dockerfile',
  'github-workflow',
  'unknown',
] as const

export type LanguageId = (typeof LANGUAGES)[number]

export const SCRIPT_LANGUAGES: readonly LanguageId[] = ['ts', 'tsx', 'js', 'jsx']
