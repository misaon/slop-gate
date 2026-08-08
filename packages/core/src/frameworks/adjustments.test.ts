import { expect, test } from 'vitest'
import type { ConceptId } from '../concepts/catalogue.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { RuleKey, RuleLevel } from '../config/types.ts'
import { frameworkOverrideLayers, frameworkRuleLayers } from './adjustments.ts'
import type { FrameworkAdjustment, FrameworkApplication, FrameworkDetection, FrameworkId } from './types.ts'

const UNSTABLE = 'suspicious.no-unstable-nested-components' as ConceptId
const EXTRANEOUS = 'suspicious.no-extraneous-class' as ConceptId
const HOOKS = 'restriction.no-restricted-imports' as ConceptId

const evidence = [
  { kind: 'manifest-dependency', file: 'package.json', workspace: '', name: 'next', field: 'dependencies' },
] as const

const applied = (id: FrameworkId, adjustments: readonly FrameworkAdjustment[]): FrameworkApplication => ({
  id,
  summary: `${id} — a profile`,
  evidence,
  adjustments,
  rejected: [],
})

const detection = (...applications: readonly FrameworkApplication[]): FrameworkDetection => ({
  applied: [...applications].sort((a, b) => (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))),
  inapplicable: [],
})

const disable = (concept: ConceptId): FrameworkAdjustment => ({ kind: 'disable-concept', concept, reason: 'off' })

const enable = (concept: ConceptId, level: 'info' | 'warn' | 'error'): FrameworkAdjustment => ({
  kind: 'enable-concept',
  concept,
  level,
  reason: 'on',
  measured: { repository: 'a real one', findings: 35, falsePositives: 0 },
})

const levelsFor = (concept: ConceptId, ...applications: readonly FrameworkApplication[]) =>
  frameworkRuleLayers(detection(...applications))
    .filter((layer) => layer.rules[concept] !== undefined)
    .map((layer) => [layer.source, layer.rules[concept]])

test('a profile can now turn a concept on, which is the whole point of this change', () => {
  expect(levelsFor(UNSTABLE, applied('nestjs', [enable(UNSTABLE, 'error')]))).toEqual([['nestjs', 'error']])
})

test('two profiles enabling one concept settle on the stricter level, and only that one is emitted', () => {
  const levels = levelsFor(UNSTABLE, applied('angular', [enable(UNSTABLE, 'warn')]), applied('nestjs', [enable(UNSTABLE, 'error')]))
  expect(levels).toEqual([['nestjs', 'error']])
})

test('and the answer does not depend on which profile is listed first', () => {
  const forwards = frameworkRuleLayers(
    detection(applied('angular', [enable(UNSTABLE, 'warn')]), applied('nestjs', [enable(UNSTABLE, 'error')])),
  )
  const backwards = frameworkRuleLayers({
    applied: [applied('nestjs', [enable(UNSTABLE, 'error')]), applied('angular', [enable(UNSTABLE, 'warn')])],
    inapplicable: [],
  })
  expect(backwards).toEqual(forwards)
})

test('`off` from any profile beats a louder setting from any other, whichever ran first', () => {
  expect(levelsFor(EXTRANEOUS, applied('angular', [disable(EXTRANEOUS)]), applied('nestjs', [enable(EXTRANEOUS, 'error')]))).toEqual([
    ['angular', 'off'],
  ])
})

test('two profiles disabling the same concept still both carry it, so each keeps its own reason', () => {
  expect(levelsFor(EXTRANEOUS, applied('angular', [disable(EXTRANEOUS)]), applied('nestjs', [disable(EXTRANEOUS)]))).toEqual([
    ['angular', 'off'],
    ['nestjs', 'off'],
  ])
})

test('one profile contradicting itself resolves by the same join rather than by adjustment order', () => {
  expect(levelsFor(UNSTABLE, applied('nestjs', [enable(UNSTABLE, 'warn'), enable(UNSTABLE, 'error')]))).toEqual([
    ['nestjs', 'error'],
  ])
  expect(levelsFor(UNSTABLE, applied('nestjs', [enable(UNSTABLE, 'error'), disable(UNSTABLE)]))).toEqual([['nestjs', 'off']])
})

const resolve = (rules: Record<string, RuleLevel>, ...applications: readonly FrameworkApplication[]) =>
  createRuleSetResolver({
    config: { rules },
    frameworks: frameworkRuleLayers(detection(...applications)),
  })

const levelOf = (concept: ConceptId, resolver: ReturnType<typeof resolve>) => resolver.base.rules.get(concept)?.level

test('a user writing `off` beats a profile enabling the same concept at `error`', () => {
  const resolver = resolve({ [UNSTABLE]: 'off' }, applied('nestjs', [enable(UNSTABLE, 'error')]))
  expect(levelOf(UNSTABLE, resolver)).toBe('off')
  expect(resolver.anyEnabledConcepts.has(UNSTABLE)).toBe(false)
  expect(resolver.base.rules.get(UNSTABLE as RuleKey)?.provenance.map((step) => [step.layer, step.setting])).toEqual([
    ['framework', 'error'],
    ['root-config', 'off'],
  ])
})

test('a user writing `warn` beats a profile enabling the same concept at `error`', () => {
  expect(levelOf(UNSTABLE, resolve({ [UNSTABLE]: 'warn' }, applied('nestjs', [enable(UNSTABLE, 'error')])))).toBe('warn')
})

test('a profile enabling below what an earlier layer already set changes nothing, and records nothing', () => {
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [enable(UNSTABLE, 'info')]))),
  })
  const resolution = resolver.base.rules.get(UNSTABLE)
  expect(resolution?.level).toBe('warn')
  expect(resolution?.provenance.map((step) => step.layer)).toEqual(['preset'])
})

test('a profile enabling above what an earlier layer set does apply, and is recorded', () => {
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [enable(UNSTABLE, 'error')]))),
  })
  const resolution = resolver.base.rules.get(UNSTABLE)
  expect(resolution?.level).toBe('error')
  expect(resolution?.provenance.map((step) => [step.layer, step.setting])).toEqual([
    ['preset', 'warn'],
    ['framework', 'error'],
  ])
})

test('a profile disabling a concept a preset set at `warn` still applies', () => {
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [disable(UNSTABLE)]))),
  })
  expect(resolver.base.rules.get(UNSTABLE as RuleKey)?.level).toBe('off')
})

test('raising the level of an optioned preset rule leaves its options alone', () => {
  const resolver = createRuleSetResolver({
    config: { rules: { [UNSTABLE]: ['warn', { allowAsProps: true }] } as never },
    frameworks: [],
  })
  const withFramework = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [enable(UNSTABLE, 'error')]))),
  })
  expect(resolver.base.rules.get(UNSTABLE as RuleKey)?.options).toEqual([{ allowAsProps: true }])
  expect(withFramework.base.rules.get(UNSTABLE as RuleKey)?.optionsFrom?.layer).not.toBe('framework')
})

const scopedDisable = (concept: ConceptId, paths: readonly string[]): FrameworkAdjustment => ({
  kind: 'disable-concept',
  concept,
  reason: 'off here only',
  paths,
})

const scopedEnable = (concept: ConceptId, level: 'info' | 'warn' | 'error', paths: readonly string[]): FrameworkAdjustment => ({
  kind: 'enable-concept',
  concept,
  level,
  reason: 'on here only',
  measured: { repository: 'a real one', findings: 35, falsePositives: 0 },
  paths,
})

const scoped = (...applications: readonly FrameworkApplication[]) =>
  createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(...applications)),
    frameworkOverrides: frameworkOverrideLayers(detection(...applications)),
  })

test('an adjustment naming `paths` leaves the base cascade alone and becomes an override instead', () => {
  const application = applied('nextjs', [scopedDisable(UNSTABLE, ['packages/ui/**'])])
  expect(frameworkRuleLayers(detection(application))).toEqual([])
  expect(frameworkOverrideLayers(detection(application))).toEqual([
    { source: 'nextjs', files: ['packages/ui/**'], rules: { [UNSTABLE]: 'off' } },
  ])
})

test('the scoped level reaches only the files its globs match', () => {
  const resolver = scoped(applied('nextjs', [scopedDisable(UNSTABLE, ['packages/ui/**'])]))
  expect(resolver.forFile('packages/ui/Button.tsx').rules.get(UNSTABLE as RuleKey)?.level).toBe('off')
  expect(resolver.forFile('apps/web/page.tsx').rules.get(UNSTABLE as RuleKey)?.level).toBe('warn')
  expect(resolver.base.rules.get(UNSTABLE as RuleKey)?.level).toBe('warn')
})

test('the provenance names the profile and the globs, not an anonymous override block', () => {
  const resolver = scoped(applied('nextjs', [scopedDisable(UNSTABLE, ['packages/ui/**', 'packages/email/**'])]))
  expect(
    resolver.forFile('packages/ui/Button.tsx').rules.get(UNSTABLE as RuleKey)?.provenance.map((step) => [step.layer, step.source, step.setting]),
  ).toEqual([
    ['preset', 'recommended', 'warn'],
    ['framework-override', 'framework nextjs (packages/email/**, packages/ui/**)', 'off'],
  ])
})

test('a user writing `off` still beats a path-scoped profile enabling the same concept at `error`', () => {
  const application = applied('nextjs', [scopedEnable(UNSTABLE, 'error', ['apps/web/**'])])
  const resolver = createRuleSetResolver({
    config: { rules: { [UNSTABLE]: 'off' } as never },
    frameworks: frameworkRuleLayers(detection(application)),
    frameworkOverrides: frameworkOverrideLayers(detection(application)),
  })
  expect(resolver.forFile('apps/web/page.tsx').rules.get(UNSTABLE as RuleKey)?.level).toBe('off')
})

test('a path-scoped level below what the base cascade holds changes nothing there', () => {
  const resolver = scoped(applied('nextjs', [scopedEnable(UNSTABLE, 'info', ['apps/web/**'])]))
  const resolution = resolver.forFile('apps/web/page.tsx').rules.get(UNSTABLE)
  expect(resolution?.level).toBe('warn')
  expect(resolution?.provenance.map((step) => step.layer)).toEqual(['preset'])
})

test('a concept only a scoped addition enables still counts as enabled somewhere', () => {
  const resolver = scoped(applied('nextjs', [scopedEnable(HOOKS, 'error', ['apps/web/**'])]))
  expect(resolver.base.rules.get(HOOKS as RuleKey)).toBeUndefined()
  expect(resolver.anyEnabledConcepts.has(HOOKS)).toBe(true)
  expect(resolver.maxLevelOf(HOOKS)).toBe('error')
  expect(resolver.forFile('packages/ui/Button.tsx').rules.get(HOOKS as RuleKey)).toBeUndefined()
  expect(resolver.forFile('apps/web/page.tsx').rules.get(HOOKS as RuleKey)?.level).toBe('error')
})

test('a scoped and an unscoped opinion about one concept stay two facts rather than one join', () => {
  const application = applied('nextjs', [disable(UNSTABLE), scopedEnable(UNSTABLE, 'error', ['apps/web/**'])])
  expect(frameworkRuleLayers(detection(application))).toEqual([{ source: 'nextjs', rules: { [UNSTABLE]: 'off' } }])
  expect(frameworkOverrideLayers(detection(application))).toEqual([
    { source: 'nextjs', files: ['apps/web/**'], rules: { [UNSTABLE]: 'error' } },
  ])
})

test('two profiles scoping one concept to the same globs join, and the result is order-free', () => {
  const forwards = frameworkOverrideLayers(
    detection(applied('angular', [scopedEnable(UNSTABLE, 'warn', ['apps/**'])]), applied('nestjs', [scopedDisable(UNSTABLE, ['apps/**'])])),
  )
  const backwards = frameworkOverrideLayers({
    applied: [applied('nestjs', [scopedDisable(UNSTABLE, ['apps/**'])]), applied('angular', [scopedEnable(UNSTABLE, 'warn', ['apps/**'])])],
    inapplicable: [],
  })
  expect(forwards).toEqual([{ source: 'nestjs', files: ['apps/**'], rules: { [UNSTABLE]: 'off' } }])
  expect(backwards).toEqual(forwards)
})

test('one profile scoping two different concepts to two glob sets emits one layer per set', () => {
  expect(
    frameworkOverrideLayers(
      detection(applied('nextjs', [scopedDisable(UNSTABLE, ['b/**']), scopedDisable(EXTRANEOUS, ['a/**'])])),
    ),
  ).toEqual([
    { source: 'nextjs', files: ['a/**'], rules: { [EXTRANEOUS]: 'off' } },
    { source: 'nextjs', files: ['b/**'], rules: { [UNSTABLE]: 'off' } },
  ])
})

test('a path-scoped layer never lands in `ignoredOverrideOptions`', () => {
  expect(scoped(applied('nextjs', [scopedDisable(UNSTABLE, ['packages/ui/**'])])).ignoredOverrideOptions).toEqual([])
})
