import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { resolveRootDir } from './root-dir.ts'

test('a relative --cwd becomes absolute, which is what every caller needs it to be', () => {
  // `sgate check --cwd fixtures/basic` used to exit 2 with an unhandled Node error from `createRequire`.
  expect(resolveRootDir('fixtures/basic')).toBe(resolve('fixtures/basic'))
})

test('an absolute --cwd is unchanged', () => {
  expect(resolveRootDir(resolve('/tmp/x'))).toBe(resolve('/tmp/x'))
})

test('no --cwd means the process directory', () => {
  expect(resolveRootDir(undefined)).toBe(process.cwd())
})
