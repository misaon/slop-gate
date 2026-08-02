import { expect, test } from 'vitest'
import type { ConceptId } from '../concepts/catalogue.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { RuleLevel } from '../config/types.ts'
import { frameworkRuleLayers } from './adjustments.ts'
import type { FrameworkAdjustment, FrameworkApplication, FrameworkDetection, FrameworkId } from './types.ts'

const UNSTABLE = 'suspicious.no-unstable-nested-components' as ConceptId
const EXTRANEOUS = 'suspicious.no-extraneous-class' as ConceptId

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
  applied: [...applications].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
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

// --- the join across profiles -------------------------------------------------------------------

test('a profile can now turn a concept on, which is the whole point of this change', () => {
  expect(levelsFor(UNSTABLE, applied('nestjs', [enable(UNSTABLE, 'error')]))).toEqual([['nestjs', 'error']])
})

/**
 * The case the user described as Next.js deviating from plain React: two profiles that both want a
 * concept on, one of them louder. No precedence table decides it — the strictest is simply the join
 * of a chain, so the answer is the same whichever order they ran in.
 */
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

/**
 * The asymmetry the whole design turns on, as an algebraic property rather than a policy check:
 * `off` is absorbing, so no addition can ever revive a concept another profile measured as wrong
 * here. A wrong addition loses to a subtraction; a wrong subtraction only ever costs coverage.
 */
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

// --- what the cascade does with the layer --------------------------------------------------------

const resolve = (rules: Record<string, RuleLevel>, ...applications: readonly FrameworkApplication[]) =>
  createRuleSetResolver({
    config: { rules: rules as never },
    frameworks: frameworkRuleLayers(detection(...applications)),
  })

const levelOf = (concept: ConceptId, resolver: ReturnType<typeof resolve>) => resolver.base.rules.get(concept as never)?.level

/** The property the task called non-negotiable, and the one `rules why` has to be able to say. */
test('a user writing `off` beats a profile enabling the same concept at `error`', () => {
  const resolver = resolve({ [UNSTABLE]: 'off' }, applied('nestjs', [enable(UNSTABLE, 'error')]))
  expect(levelOf(UNSTABLE, resolver)).toBe('off')
  expect(resolver.anyEnabledConcepts.has(UNSTABLE)).toBe(false)
  expect(resolver.base.rules.get(UNSTABLE as never)?.provenance.map((step) => [step.layer, step.setting])).toEqual([
    ['framework', 'error'],
    ['root-config', 'off'],
  ])
})

test('a user writing `warn` beats a profile enabling the same concept at `error`', () => {
  expect(levelOf(UNSTABLE, resolve({ [UNSTABLE]: 'warn' }, applied('nestjs', [enable(UNSTABLE, 'error')])))).toBe('warn')
})

/**
 * A profile states a floor, never a ceiling. Without this an author writing `'x': 'warn'` to mean
 * "make sure this is on" would silently downgrade a preset that had it at `error` — a subtraction
 * wearing the vocabulary of an addition, and the one way `enable-concept` could lose coverage.
 */
test('a profile enabling below what an earlier layer already set changes nothing, and records nothing', () => {
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [enable(UNSTABLE, 'info')]))),
  })
  const resolution = resolver.base.rules.get(UNSTABLE as never)
  expect(resolution?.level).toBe('warn')
  expect(resolution?.provenance.map((step) => step.layer)).toEqual(['preset'])
})

test('a profile enabling above what an earlier layer set does apply, and is recorded', () => {
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [enable(UNSTABLE, 'error')]))),
  })
  const resolution = resolver.base.rules.get(UNSTABLE as never)
  expect(resolution?.level).toBe('error')
  expect(resolution?.provenance.map((step) => [step.layer, step.setting])).toEqual([
    ['preset', 'warn'],
    ['framework', 'error'],
  ])
})

/** `off` is not a level to be outranked — a subtraction applies against anything the presets said. */
test('a profile disabling a concept a preset set at `warn` still applies', () => {
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [disable(UNSTABLE)]))),
  })
  expect(resolver.base.rules.get(UNSTABLE as never)?.level).toBe('off')
})

/**
 * A raise must not discard the options the preset chose. `materialize` already separates the two
 * facts; this pins that an addition, which never carries options, is not an exception to it.
 */
test('raising the level of an optioned preset rule leaves its options alone', () => {
  const resolver = createRuleSetResolver({
    config: { rules: { [UNSTABLE]: ['warn', { allowAsProps: true }] } as never },
    frameworks: [],
  })
  const withFramework = createRuleSetResolver({
    config: { extends: ['recommended'], rules: {} },
    frameworks: frameworkRuleLayers(detection(applied('nestjs', [enable(UNSTABLE, 'error')]))),
  })
  expect(resolver.base.rules.get(UNSTABLE as never)?.options).toEqual([{ allowAsProps: true }])
  expect(withFramework.base.rules.get(UNSTABLE as never)?.optionsFrom?.layer).not.toBe('framework')
})
