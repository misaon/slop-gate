import { expect, test } from 'vitest'
import { createRuleSetResolver } from '../config/resolve.ts'
import { resolveEnablement, wasEnabledBeforeBeingDisabled } from './enablement.ts'

test('reports a concept no layer mentions as not enabled, with empty provenance', () => {
  const resolver = createRuleSetResolver({ config: {} })
  const enablement = resolveEnablement(resolver, 'correctness.no-debugger')

  expect(enablement.enabled).toBe(false)
  expect(enablement.level).toBe('off')
  expect(enablement.baseProvenance).toEqual([])
  expect(enablement.overrides).toEqual([])
})

test('reports a preset-enabled concept with its provenance trail', () => {
  const resolver = createRuleSetResolver({ config: { extends: ['recommended'] } })
  const enablement = resolveEnablement(resolver, 'correctness.no-debugger')

  expect(enablement.enabled).toBe(true)
  expect(enablement.level).toBe('error')
  expect(enablement.baseProvenance).toEqual([{ layer: 'preset', source: 'recommended', setting: 'error' }])
})

test('reports a concept enabled only by an override, with an empty base provenance', () => {
  const resolver = createRuleSetResolver({
    config: { overrides: [{ files: ['legacy/**'], rules: { 'style.no-var': 'error' } }] },
  })
  const enablement = resolveEnablement(resolver, 'style.no-var')

  expect(enablement.enabled).toBe(true)
  expect(enablement.level).toBe('error')
  expect(enablement.baseProvenance).toEqual([])
  expect(enablement.overrides).toEqual([{ source: 'overrides[0] (legacy/**)', setting: 'error' }])
})

test('wasEnabledBeforeBeingDisabled is false when no layer ever set a non-off level', () => {
  expect(wasEnabledBeforeBeingDisabled([])).toBe(false)
  expect(wasEnabledBeforeBeingDisabled([{ layer: 'root-config', source: 'slop-gate.config.ts', setting: 'off' }])).toBe(false)
})

test('wasEnabledBeforeBeingDisabled is true when a later layer turned an enabled concept off', () => {
  const provenance = [
    { layer: 'preset' as const, source: 'recommended', setting: 'error' as const },
    { layer: 'root-config' as const, source: 'slop-gate.config.ts', setting: 'off' as const },
  ]
  expect(wasEnabledBeforeBeingDisabled(provenance)).toBe(true)
})

test('wasEnabledBeforeBeingDisabled is false when the concept is still enabled (the disabling question does not apply)', () => {
  const provenance = [{ layer: 'preset' as const, source: 'recommended', setting: 'error' as const }]
  expect(wasEnabledBeforeBeingDisabled(provenance)).toBe(false)
})
