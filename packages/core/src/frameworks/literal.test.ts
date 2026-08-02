import { expect, test } from 'vitest'
import { extractStringList, extractStringLiteral } from './literal.ts'

test('reads a lone string as a one-element list', () => {
  expect(extractStringList('{ "extends": "./base.json" }', ['extends'])).toEqual({
    kind: 'values',
    values: ['./base.json'],
  })
})

test('reads the TypeScript 5.0 array form in source order', () => {
  const source = '{ "extends": ["./a.json", "@tsconfig/node20/tsconfig.json"] }'
  expect(extractStringList(source, ['extends'])).toEqual({
    kind: 'values',
    values: ['./a.json', '@tsconfig/node20/tsconfig.json'],
  })
})

test('reads an empty array as an empty list rather than a failure', () => {
  expect(extractStringList('{ "extends": [] }', ['extends'])).toEqual({ kind: 'values', values: [] })
})

test('distinguishes an absent key from one it cannot read', () => {
  expect(extractStringList('{ "compilerOptions": {} }', ['extends'])).toEqual({ kind: 'absent' })
  expect(extractStringList('{ "extends": BASE }', ['extends'])).toEqual({ kind: 'unreadable' })
  expect(extractStringList('{ "extends": ["./a.json", BASE] }', ['extends'])).toEqual({ kind: 'unreadable' })
})

test('does not read an extends that only appears inside a comment', () => {
  expect(extractStringList('{\n  // "extends": "./old.json"\n  "compilerOptions": {}\n}', ['extends'])).toEqual({
    kind: 'absent',
  })
})

test('reads a nested string literal', () => {
  const source = `export default { migrations: { path: './src/migrations' } }`
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('./src/migrations')
})

test('reads a top-level string literal', () => {
  expect(extractStringLiteral(`export default { srcDir: 'docs' }`, ['srcDir'])).toBe('docs')
})

test('accepts quoted keys and double-quoted values', () => {
  const source = `export default { "migrations": { 'path': "dist/migrations" } }`
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('dist/migrations')
})

test('reads across newlines and trailing commas', () => {
  const source = [
    'export default defineConfig({',
    '  entities: [Foo],',
    '  migrations: {',
    "    path: './db/migrations',",
    '    transactional: true,',
    '  },',
    '})',
  ].join('\n')
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('./db/migrations')
})

test('ignores a matching key inside a line comment', () => {
  const source = ["// migrations: { path: './wrong' }", "export default { migrations: { path: './right' } }"].join('\n')
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('./right')
})

test('ignores a matching key inside a block comment', () => {
  const source = "/* migrations: { path: './wrong' } */ export default { migrations: { path: './right' } }"
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('./right')
})

test('ignores a matching key inside a string literal', () => {
  const source = `const note = "migrations: { path: './wrong' }"\nexport default { migrations: { path: './right' } }`
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('./right')
})

test('does not descend into a nested object that merely repeats the leaf key', () => {
  const source = `export default { migrations: { snapshot: { path: './wrong' }, path: './right' } }`
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBe('./right')
})

test('does not match a key that is only a suffix of a longer identifier', () => {
  const source = `export default { seed_migrations: { path: './wrong' } }`
  expect(extractStringLiteral(source, ['migrations', 'path'])).toBeNull()
})

test('yields null for a value that is not a string literal', () => {
  expect(extractStringLiteral(`export default { migrations: { path: MIGRATIONS_DIR } }`, ['migrations', 'path'])).toBeNull()
  expect(extractStringLiteral('export default { migrations: { path: `./a/${b}` } }', ['migrations', 'path'])).toBeNull()
  expect(
    extractStringLiteral(`export default { migrations: { path: process.env['X'] } }`, ['migrations', 'path']),
  ).toBeNull()
})

test('yields null when the property path is absent', () => {
  expect(extractStringLiteral(`export default { entities: [] }`, ['migrations', 'path'])).toBeNull()
  expect(extractStringLiteral(`export default { migrations: [] }`, ['migrations', 'path'])).toBeNull()
})

test('yields null rather than throwing on an unbalanced or truncated source', () => {
  expect(extractStringLiteral(`export default { migrations: { path: './x'`, ['migrations', 'path'])).toBeNull()
  expect(extractStringLiteral(`export default { migrations: {`, ['migrations', 'path'])).toBeNull()
  expect(extractStringLiteral('', ['migrations', 'path'])).toBeNull()
})

test('reads an escaped quote in the value verbatim, without unescaping it', () => {
  expect(extractStringLiteral(`export default { srcDir: 'a\\'b' }`, ['srcDir'])).toBeNull()
})
