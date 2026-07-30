import { expect, test } from 'vitest'
import { detectLanguage } from './language.ts'

test.each([
  ['src/a.ts', 'ts'],
  ['src/a.mts', 'ts'],
  ['src/a.cts', 'ts'],
  ['src/a.tsx', 'tsx'],
  ['src/a.js', 'js'],
  ['src/a.mjs', 'js'],
  ['src/a.jsx', 'jsx'],
  ['src/App.vue', 'vue'],
  ['src/App.svelte', 'svelte'],
  ['src/page.astro', 'astro'],
  ['styles/a.css', 'css'],
  ['styles/a.scss', 'scss'],
  ['styles/a.less', 'less'],
  ['index.html', 'html'],
  ['package.json', 'json'],
  ['tsconfig.json', 'jsonc'],
  ['.oxlintrc.json', 'jsonc'],
  ['config.yaml', 'yaml'],
  ['config.yml', 'yaml'],
  ['Cargo.toml', 'toml'],
  ['README.md', 'markdown'],
  ['LICENSE', 'unknown'],
])('detects %s as %s', (path, expected) => {
  expect(detectLanguage(path)).toBe(expected)
})

test.each([
  ['Dockerfile', 'dockerfile'],
  ['Dockerfile.prod', 'dockerfile'],
  ['docker/api.dockerfile', 'dockerfile'],
  ['apps/web/Dockerfile', 'dockerfile'],
])('detects %s as a dockerfile', (path) => {
  expect(detectLanguage(path)).toBe('dockerfile')
})

test.each([
  ['.github/workflows/ci.yml', 'github-workflow'],
  ['.github/workflows/release.yaml', 'github-workflow'],
])('detects %s as a github workflow', (path) => {
  expect(detectLanguage(path)).toBe('github-workflow')
})

test('does not treat other .github yaml as a workflow', () => {
  expect(detectLanguage('.github/dependabot.yml')).toBe('yaml')
})

test('is case-insensitive about extensions', () => {
  expect(detectLanguage('src/A.TS')).toBe('ts')
})
