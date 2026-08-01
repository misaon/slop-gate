import { expect, test } from 'vitest'
import { CORE_VERSION } from './index.ts'

test('core exposes its version', () => {
  expect(CORE_VERSION).toBe('0.0.0')
})
