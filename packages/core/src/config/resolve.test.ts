import { expect, test } from 'vitest'
import { createRuleSetResolver } from './resolve.ts'

test('applies a preset', () => {
  const { base } = createRuleSetResolver({ config: { extends: ['recommended'] } })
  expect(base.rules.get('correctness.no-debugger')?.level).toBe('error')
  expect(base.enabledConcepts.has('correctness.no-debugger')).toBe(true)
})

test('later presets win over earlier ones', () => {
  const { base } = createRuleSetResolver({ config: { extends: ['recommended', 'strict'] } })
  expect(base.rules.get('dead-code.unused-variable')?.level).toBe('error')
})

test('root rules win over presets and the provenance shows both steps', () => {
  const { base } = createRuleSetResolver({
    config: { extends: ['recommended'], rules: { 'correctness.no-debugger': 'warn' } },
  })
  const resolution = base.rules.get('correctness.no-debugger')
  expect(resolution?.level).toBe('warn')
  expect(resolution?.provenance).toEqual([
    { layer: 'preset', source: 'recommended', setting: 'error' },
    { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'warn' },
  ])
})

test('a workspace config wins over the root config', () => {
  const { base } = createRuleSetResolver({
    config: { rules: { 'style.no-var': 'warn' } },
    workspaceConfig: { file: 'packages/app/slop-gate.config.ts', config: { rules: { 'style.no-var': 'error' } } },
  })
  expect(base.rules.get('style.no-var')?.level).toBe('error')
  expect(base.rules.get('style.no-var')?.provenance.at(-1)?.layer).toBe('workspace-config')
})

test('a rule set to off is retained but not enabled', () => {
  const { base } = createRuleSetResolver({
    config: { extends: ['recommended'], rules: { 'correctness.no-debugger': 'off' } },
  })
  expect(base.rules.get('correctness.no-debugger')?.level).toBe('off')
  expect(base.enabledConcepts.has('correctness.no-debugger')).toBe(false)
})

test('an override that enables a concept widens the planner view without reviving a disabled rule', () => {
  const { anyEnabledConcepts, maxLevelOf } = createRuleSetResolver({
    config: {
      extends: ['recommended'],
      rules: { 'correctness.no-debugger': 'off' },
      overrides: [{ files: ['legacy/**'], rules: { 'style.no-var': 'error' } }],
    },
  })

  // Turned off by the root config on top of the preset: the base cascade is last-wins, so this
  // must stay off for the planner too.
  expect(anyEnabledConcepts.has('correctness.no-debugger')).toBe(false)
  expect(maxLevelOf('correctness.no-debugger')).toBe('off')

  // Enabled only by an override: the engine must still be configured to run it.
  expect(anyEnabledConcepts.has('style.no-var')).toBe(true)
  expect(maxLevelOf('style.no-var')).toBe('error')
})

test('options replace rather than merge', () => {
  const resolver = createRuleSetResolver({
    config: { rules: { 'style.no-var': ['warn', { a: 1, b: 2 }] } },
    workspaceConfig: {
      file: 'packages/app/slop-gate.config.ts',
      config: { rules: { 'style.no-var': ['warn', { b: 3 }] } },
    },
  })
  expect(resolver.base.rules.get('style.no-var')?.options).toEqual([{ b: 3 }])
})

test('a later layer setting only a level keeps the options an earlier one set', () => {
  // The single most likely edit anyone makes to a config — raise a rule's severity — and the one
  // that silently undid an earlier layer's measured option choice while a setting was replaced
  // whole. Level and options are settled independently, so the raise costs nothing.
  const resolver = createRuleSetResolver({
    config: { rules: { 'pedantic.eqeqeq': ['warn', 'smart'] } },
    workspaceConfig: { file: 'packages/app/slop-gate.config.ts', config: { rules: { 'pedantic.eqeqeq': 'error' } } },
  })

  expect(resolver.base.rules.get('pedantic.eqeqeq')?.level).toBe('error')
  expect(resolver.optionsOf('pedantic.eqeqeq')).toEqual(['smart'])
  expect(resolver.base.rules.get('pedantic.eqeqeq')?.optionsFrom).toEqual({
    layer: 'root-config',
    source: 'slop-gate.config.ts',
  })
})

test('the empty tuple clears inherited options', () => {
  const resolver = createRuleSetResolver({
    config: { rules: { 'pedantic.eqeqeq': ['warn', 'smart'] } },
    workspaceConfig: { file: 'packages/app/slop-gate.config.ts', config: { rules: { 'pedantic.eqeqeq': ['error'] } } },
  })
  expect(resolver.optionsOf('pedantic.eqeqeq')).toEqual([])
  expect(resolver.base.rules.get('pedantic.eqeqeq')?.optionsFrom).toEqual({
    layer: 'workspace-config',
    source: 'packages/app/slop-gate.config.ts',
  })
})

test('options in an override are ignored and recorded, while its level still applies', () => {
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'pedantic.eqeqeq': ['warn', 'smart'] },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'pedantic.eqeqeq': ['error', 'always'] } }],
    },
  })

  expect(resolver.optionsOf('pedantic.eqeqeq')).toEqual(['smart'])
  expect(resolver.maxLevelOf('pedantic.eqeqeq')).toBe('error')
  expect(resolver.ignoredOverrideOptions).toEqual([
    { source: 'overrides[0] (**/*.test.ts)', key: 'pedantic.eqeqeq' },
  ])
})

test('an override that sets only a level is not reported as carrying options', () => {
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'pedantic.eqeqeq': ['warn', 'smart'] },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'pedantic.eqeqeq': 'off' } }],
    },
  })
  expect(resolver.ignoredOverrideOptions).toEqual([])
})

test('an override applies only to matching files', () => {
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'style.no-var': 'error' },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }],
    },
  })
  expect(resolver.forFile('src/a.test.ts').rules.get('style.no-var')?.level).toBe('off')
  expect(resolver.forFile('src/a.ts').rules.get('style.no-var')?.level).toBe('error')
})

test('overrides apply in declaration order', () => {
  const resolver = createRuleSetResolver({
    config: {
      overrides: [
        { files: ['src/**'], rules: { 'style.no-var': 'warn' } },
        { files: ['src/legacy/**'], rules: { 'style.no-var': 'off' } },
      ],
    },
  })
  expect(resolver.forFile('src/legacy/a.ts').rules.get('style.no-var')?.level).toBe('off')
  expect(resolver.forFile('src/new/a.ts').rules.get('style.no-var')?.level).toBe('warn')
})

test('files matching the same overrides share one resolved bucket', () => {
  const resolver = createRuleSetResolver({
    config: { overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }] },
  })
  const first = resolver.forFile('a/b.test.ts')
  const second = resolver.forFile('c/d.test.ts')
  expect(second).toBe(first)
  expect(resolver.forFile('a/b.ts')).not.toBe(first)
  expect(resolver.bucketCount()).toBe(2)
})

test('records the provenance of an override', () => {
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'style.no-var': 'error' },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }],
    },
  })
  expect(resolver.forFile('a.test.ts').rules.get('style.no-var')?.provenance).toEqual([
    { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'error' },
    { layer: 'override', source: 'overrides[0] (**/*.test.ts)', setting: 'off' },
  ])
})

test('accepts an engine rule id as an escape hatch', () => {
  const { base } = createRuleSetResolver({ config: { rules: { 'oxlint/no-debugger': 'error' } } })
  expect(base.rules.get('oxlint/no-debugger')?.level).toBe('error')
  expect(base.unknownKeys).toEqual([])
})

test('reports a key that names neither a concept nor a shipped rule', () => {
  const { base } = createRuleSetResolver({
    config: { rules: { 'oxlint/no-such-rule': 'error' } as never },
  })
  expect(base.unknownKeys).toEqual(['oxlint/no-such-rule'])
})

test('reports every override block that mentions a concept, regardless of which files it matches', () => {
  const resolver = createRuleSetResolver({
    config: {
      overrides: [
        { files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } },
        { files: ['legacy/**'], rules: { 'style.no-var': 'warn' } },
        { files: ['src/**'], rules: { 'dead-code.unused-variable': 'error' } },
      ],
    },
  })

  expect(resolver.overridesFor('style.no-var')).toEqual([
    { source: 'overrides[0] (**/*.test.ts)', setting: 'off' },
    { source: 'overrides[1] (legacy/**)', setting: 'warn' },
  ])
})

test('reports no overrides for a key no override block mentions', () => {
  const resolver = createRuleSetResolver({
    config: { overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }] },
  })

  expect(resolver.overridesFor('correctness.no-debugger')).toEqual([])
})

test('passes pinned owners through', () => {
  const { base } = createRuleSetResolver({
    config: { owners: { 'dead-code.unused-variable': 'knip' } },
  })
  expect(base.pinnedOwners['dead-code.unused-variable']).toBe('knip')
})
