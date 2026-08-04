import { expect, test } from 'vitest'
import { resolveIncludeScope, resolveJsx, resolveJsxImportSource } from './tsconfig.ts'

const from = (files: Record<string, string>) => async (path: string) => files[path] ?? null

const jsx = (value: string) => JSON.stringify({ compilerOptions: { jsx: value } })

test('reads a value the file sets itself', async () => {
  expect(await resolveJsx('tsconfig.json', from({ 'tsconfig.json': jsx('react-jsx') }))).toEqual({
    kind: 'set',
    transform: 'automatic',
    value: 'react-jsx',
    declaredIn: 'tsconfig.json',
  })
})

test('follows extends two levels up to the file that actually sets jsx', async () => {
  const result = await resolveJsx(
    'apps/web/tsconfig.json',
    from({
      'apps/web/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.app.json', include: ['src'] }),
      'tsconfig.app.json': JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: { jsx: 'react-jsx' } }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { strict: true } }),
    }),
  )

  expect(result).toEqual({
    kind: 'set',
    transform: 'automatic',
    value: 'react-jsx',
    declaredIn: 'tsconfig.app.json',
  })
})

test('lets the extending file win over what it extends', async () => {
  const result = await resolveJsx(
    'apps/legacy/tsconfig.json',
    from({
      'apps/legacy/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.app.json', compilerOptions: { jsx: 'react' } }),
      'tsconfig.app.json': jsx('react-jsx'),
    }),
  )

  expect(result).toMatchObject({ transform: 'classic', declaredIn: 'apps/legacy/tsconfig.json' })
})

test('lets a later array entry win over an earlier one', async () => {
  const result = await resolveJsx(
    'tsconfig.json',
    from({
      'tsconfig.json': JSON.stringify({ extends: ['./classic.json', './modern.json'] }),
      'classic.json': jsx('react'),
      'modern.json': jsx('react-jsx'),
    }),
  )

  expect(result).toMatchObject({ transform: 'automatic', declaredIn: 'modern.json' })
})

test('falls back to an earlier array entry when the later one says nothing', async () => {
  const result = await resolveJsx(
    'tsconfig.json',
    from({
      'tsconfig.json': JSON.stringify({ extends: ['./modern.json', './strict.json'] }),
      'modern.json': jsx('react-jsx'),
      'strict.json': JSON.stringify({ compilerOptions: { strict: true } }),
    }),
  )

  expect(result).toMatchObject({ transform: 'automatic', declaredIn: 'modern.json' })
})

test('resolves a bare specifier through node_modules', async () => {
  const result = await resolveJsx(
    'apps/web/tsconfig.json',
    from({
      'apps/web/tsconfig.json': JSON.stringify({ extends: '@acme/tsconfig/react.json' }),
      'node_modules/@acme/tsconfig/react.json': jsx('react-jsx'),
    }),
  )

  expect(result).toMatchObject({ transform: 'automatic', declaredIn: 'node_modules/@acme/tsconfig/react.json' })
})

test('completes a bare specifier that names only a package', async () => {
  const result = await resolveJsx(
    'tsconfig.json',
    from({
      'tsconfig.json': JSON.stringify({ extends: '@tsconfig/next' }),
      'node_modules/@tsconfig/next/tsconfig.json': jsx('preserve'),
    }),
  )

  expect(result).toMatchObject({ transform: 'deferred', value: 'preserve' })
})

test('reports a chain it cannot follow rather than calling it empty', async () => {
  const missing = await resolveJsx(
    'tsconfig.json',
    from({ 'tsconfig.json': JSON.stringify({ extends: '@tsconfig/absent' }) }),
  )
  expect(missing).toEqual({ kind: 'unknown', reason: expect.stringContaining('@tsconfig/absent') })

  const computed = await resolveJsx('tsconfig.json', from({ 'tsconfig.json': '{ "extends": BASE }' }))
  expect(computed).toEqual({ kind: 'unknown', reason: expect.stringContaining('not a plain string') })
})

test('a chain that completes without configuring jsx is empty, not unknown', async () => {
  const result = await resolveJsx(
    'tsconfig.json',
    from({
      'tsconfig.json': JSON.stringify({ extends: './base.json' }),
      'base.json': JSON.stringify({ compilerOptions: { strict: true } }),
    }),
  )
  expect(result).toEqual({ kind: 'none' })
})

test('ends rather than hangs on a cycle', async () => {
  const result = await resolveJsx(
    'a.json',
    from({
      'a.json': JSON.stringify({ extends: './b.json' }),
      'b.json': JSON.stringify({ extends: './a.json' }),
    }),
  )
  expect(result).toEqual({ kind: 'none' })
})

test('resolves jsxImportSource through the same extends chain as jsx', async () => {
  const result = await resolveJsxImportSource(
    'apps/site/tsconfig.json',
    from({
      'apps/site/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.base.json', compilerOptions: { jsx: 'preserve' } }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { jsxImportSource: 'solid-js' } }),
    }),
  )

  expect(result).toEqual({ kind: 'set', value: 'solid-js', declaredIn: 'tsconfig.base.json' })
})

test('a chain that configures no jsxImportSource is empty, not unknown', async () => {
  expect(await resolveJsxImportSource('tsconfig.json', from({ 'tsconfig.json': jsx('react-jsx') }))).toEqual({ kind: 'none' })
})

test('reports a jsxImportSource chain it cannot follow rather than calling it empty', async () => {
  const result = await resolveJsxImportSource(
    'tsconfig.json',
    from({ 'tsconfig.json': JSON.stringify({ extends: './missing.json' }) }),
  )

  expect(result.kind).toBe('unknown')
})

test('scopes a config to its own include patterns, cut back to their literal prefix', async () => {
  expect(await resolveIncludeScope('tsconfig.spec.json', from({
    'tsconfig.spec.json': JSON.stringify({ include: ['src', 'src/middleware/keys.test.json'] }),
  }))).toEqual(['src/**'])
})

test('scopes a config with no include to its whole directory', async () => {
  expect(await resolveIncludeScope('packages/ui/tsconfig.json', from({
    'packages/ui/tsconfig.json': jsx('react-jsx'),
  }))).toEqual(['packages/ui/**'])
})

test('resolves include patterns relative to the config, not the repository root', async () => {
  expect(await resolveIncludeScope('packages/dash/tsconfig.json', from({
    'packages/dash/tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' }, include: ['src'] }),
  }))).toEqual(['packages/dash/src/**'])
})

test('an include list that is not plain string literals falls back to the whole directory', async () => {
  expect(await resolveIncludeScope('packages/ui/tsconfig.json', from({
    'packages/ui/tsconfig.json': '{ "include": [1, 2] }',
  }))).toEqual(['packages/ui/**'])
})
