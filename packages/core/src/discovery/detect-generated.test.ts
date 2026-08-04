import { expect, test } from 'vitest'
import { isGeneratedPath } from './detect-generated.ts'

test.each([
  'packages/bat-api/src/v1/client/client.gen.ts',
  'packages/loan-api/src/v2/client/types.gen.ts',
  'src/core/queryKeySerializer.gen.ts',
  'src/schema.generated.ts',
  'src/api/__generated__/operations.ts',
  'proto/service.gen.go',
])('treats %s as generated', (path) => {
  expect(isGeneratedPath(path)).toBe(true)
})

test.each([
  'apps/app-acquisition/src/types/nextAuth.d.ts',
  'apps/app-client-zone/src/types/global.d.ts',
  'packages/theme/src/muiTheme/palette.d.ts',
  'src/generator.ts',
  'src/regenerate.ts',
  'src/gen.ts',
  'src/generated.ts',
  'docs/generated-output.md',
])('leaves %s alone', (path) => {
  expect(isGeneratedPath(path)).toBe(false)
})

test('a declaration file that also carries a marker is still generated', () => {
  expect(isGeneratedPath('src/client/types.gen.d.ts')).toBe(true)
})
