import { expect, test } from 'vitest'
import type { CheckResult, Diagnostic } from '@misaon/slop-gate-core'
import { createReporter } from './index.ts'

/**
 * Real findings, captured verbatim from `sgate check --format json --no-cache` run against this
 * repository at commit 412575d — a subset covering every concept that run produced, with the
 * complete `correctness.no-useless-spread` set kept intact because that is the whole of the
 * automated side and the thing these tests exist to pin.
 *
 * Captured rather than synthesised because the split this file asserts is only interesting if the
 * diagnostics are ones the pipeline really emits: the `slop-gate/config.*` rule ids that have no
 * `RuleEntry` at all, the generated concepts whose descriptions are boilerplate, and the one rule
 * in the repository that the registry declares fixable — and declares fixable at `unsafe`, so the
 * agent has to be told which flag it needs. A hand-written fixture would have had a `safe` fix in
 * it, which no rule this repository triggers actually has.
 *
 * The cross-check the split is measured against, run at the same commit:
 *
 *     $ sgate fix --dry-run --unsafe
 *     sgate fix would change 3 files (3 edits, tier `unsafe`):
 *       packages/cli/src/engine-registry.ts — 1 edit
 *       packages/core/src/frameworks/detect.test.ts — 1 edit
 *       packages/engine-knip/src/index.ts — 1 edit
 *     Rules applied:
 *       oxlint/unicorn/no-useless-spread — 3
 *     65 findings on the first pass; fixable: 0 safe, 0 suggested, 3 unsafe.
 */
const CAPTURED: readonly Diagnostic[] = [
  {
    concept: 'correctness.no-useless-spread',
    ruleRefKey: 'oxlint/unicorn/no-useless-spread',
    engine: 'oxlint',
    severity: 'error',
    message: 'Using a spread operator here creates a new object unnecessarily.',
    file: 'packages/cli/src/engine-registry.ts',
    range: { start: 2528, end: 2531 },
    position: { startLine: 39, startColumn: 24, endLine: 39, endColumn: 27 },
    help: '`configFile === undefined ? {} : { configFile }` returns a new object. Spreading it into an object expression to create a new object is redundant.',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/no-useless-spread.html',
    fingerprint: 'd76432dcd7cb8b4be43a7d8c23abd1a1',
  },
  {
    concept: 'correctness.vitest-require-to-throw-message',
    ruleRefKey: 'oxlint/vitest/require-to-throw-message',
    engine: 'oxlint',
    severity: 'error',
    message: 'Require a message for "toThrow".',
    file: 'packages/core/src/config/load.test.ts',
    range: { start: 3690, end: 3697 },
    position: { startLine: 89, startColumn: 41, endLine: 89, endColumn: 48 },
    help: 'Add an error message to "toThrow"',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/vitest/require-to-throw-message.html',
    fingerprint: '9dc556c8b2f2469059ddff1027d06026',
  },
  {
    concept: 'config.unused-suppression',
    ruleRefKey: 'slop-gate/config.unused-suppression',
    engine: 'slop-gate',
    severity: 'warn',
    message: 'This suppression for `correctness.no-debugger` does not match any diagnostic on this line.',
    file: 'packages/core/src/engine/normalize.test.ts',
    range: { start: 6921, end: 7021 },
    position: { startLine: 171, startColumn: 1, endLine: 171, endColumn: 101 },
    help: 'Remove the suppression, or fix its target so it matches again.',
    docsUrl: 'https://slop-gate.dev/concepts/config.unused-suppression',
    fingerprint: '17f18baf0e8708aabdddbc4e8cc2c036',
  },
  {
    concept: 'config.unused-suppression',
    ruleRefKey: 'slop-gate/config.unused-suppression',
    engine: 'slop-gate',
    severity: 'warn',
    message: 'This suppression for `correctness.no-debugger` does not match any diagnostic on this line.',
    file: 'packages/core/src/engine/normalize.test.ts',
    range: { start: 7786, end: 7880 },
    position: { startLine: 190, startColumn: 1, endLine: 190, endColumn: 95 },
    help: 'Remove the suppression, or fix its target so it matches again.',
    docsUrl: 'https://slop-gate.dev/concepts/config.unused-suppression',
    fingerprint: '4c11fc1a28014e90403efa76064fbd34',
  },
  {
    concept: 'config.unused-suppression',
    ruleRefKey: 'slop-gate/config.unused-suppression',
    engine: 'slop-gate',
    severity: 'warn',
    message: 'This suppression for `correctness.no-debugger` does not match any diagnostic in this file.',
    file: 'packages/core/src/engine/normalize.test.ts',
    range: { start: 8297, end: 8398 },
    position: { startLine: 205, startColumn: 1, endLine: 205, endColumn: 102 },
    help: 'Remove the suppression, or fix its target so it matches again.',
    docsUrl: 'https://slop-gate.dev/concepts/config.unused-suppression',
    fingerprint: '5f1676009d067c37ea4b3618df88d1c0',
  },
  {
    concept: 'config.suppression-missing-reason',
    ruleRefKey: 'slop-gate/config.suppression-missing-reason',
    engine: 'slop-gate',
    severity: 'warn',
    message: 'This suppression has no reason. Add one so a future reader knows why the finding is safe to ignore.',
    file: 'packages/core/src/engine/normalize.test.ts',
    range: { start: 11780, end: 11865 },
    position: { startLine: 300, startColumn: 1, endLine: 300, endColumn: 86 },
    help: 'Append `-- reason` after the directive (and its targets, if any) — e.g. `-- see #482`.',
    docsUrl: 'https://slop-gate.dev/concepts/config.suppression-missing-reason',
    fingerprint: '2531886dd389c6477e29bf362a952d6c',
  },
  {
    concept: 'suspicious.consistent-function-scoping',
    ruleRefKey: 'oxlint/unicorn/consistent-function-scoping',
    engine: 'oxlint',
    severity: 'warn',
    message: 'Function `values` does not capture any variables from its parent scope',
    file: 'packages/core/src/frameworks/detect.test.ts',
    range: { start: 10935, end: 10941 },
    position: { startLine: 255, startColumn: 9, endLine: 255, endColumn: 15 },
    help: 'Move `values` to the outer scope to avoid recreating it on every call.',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/consistent-function-scoping.html',
    fingerprint: '39f8b5cec3f7d3770c878a73c5a5b0ed',
  },
  {
    concept: 'correctness.no-useless-spread',
    ruleRefKey: 'oxlint/unicorn/no-useless-spread',
    engine: 'oxlint',
    severity: 'error',
    message: 'Using a spread operator here creates a new array unnecessarily.',
    file: 'packages/core/src/frameworks/detect.test.ts',
    range: { start: 14893, end: 14896 },
    position: { startLine: 336, startColumn: 53, endLine: 336, endColumn: 56 },
    help: '`forward.applied.map` returns a new array. Spreading it into an array expression to create a new array is redundant.',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/no-useless-spread.html',
    fingerprint: '178965e2fe38c965796d01f83449d57d',
  },
  {
    concept: 'correctness.vitest-no-conditional-expect',
    ruleRefKey: 'oxlint/vitest/no-conditional-expect',
    engine: 'oxlint',
    severity: 'error',
    message: 'Unexpected conditional expect',
    file: 'packages/core/src/registry/entries.generated.test.ts',
    range: { start: 2499, end: 2505 },
    position: { startLine: 54, startColumn: 35, endLine: 54, endColumn: 41 },
    help: 'Avoid calling `expect` conditionally',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/vitest/no-conditional-expect.html',
    fingerprint: 'f87f609387a5dd11536802622160ebf5',
  },
  {
    concept: 'correctness.vitest-no-conditional-expect',
    ruleRefKey: 'oxlint/vitest/no-conditional-expect',
    engine: 'oxlint',
    severity: 'error',
    message: 'Unexpected conditional expect',
    file: 'packages/core/src/registry/entries.generated.test.ts',
    range: { start: 2564, end: 2570 },
    position: { startLine: 55, startColumn: 10, endLine: 55, endColumn: 16 },
    help: 'Avoid calling `expect` conditionally',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/vitest/no-conditional-expect.html',
    fingerprint: '3b0e5366febbb436875644c9341b5943',
  },
  {
    concept: 'suspicious.consistent-function-scoping',
    ruleRefKey: 'oxlint/unicorn/consistent-function-scoping',
    engine: 'oxlint',
    severity: 'warn',
    message: 'Function `finding` does not capture any variables from its parent scope',
    file: 'packages/core/src/run/check.test.ts',
    range: { start: 12841, end: 12848 },
    position: { startLine: 337, startColumn: 9, endLine: 337, endColumn: 16 },
    help: 'Move `finding` to the outer scope to avoid recreating it on every call.',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/consistent-function-scoping.html',
    fingerprint: '2df444cfa4f5bf15b51a4011b63e302d',
  },
  {
    concept: 'correctness.no-useless-spread',
    ruleRefKey: 'oxlint/unicorn/no-useless-spread',
    engine: 'oxlint',
    severity: 'error',
    message: 'Using a spread operator here creates a new object unnecessarily.',
    file: 'packages/engine-knip/src/index.ts',
    range: { start: 5173, end: 5176 },
    position: { startLine: 101, startColumn: 9, endLine: 101, endColumn: 12 },
    help: 'This expression returns a new object. Spreading it into an object expression to create a new object is redundant.',
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/no-useless-spread.html',
    fingerprint: '32388fe46d4bc5d1bde91ef516153e5f',
  },
]

const AUTOMATED_FILES = [
  'packages/cli/src/engine-registry.ts',
  'packages/core/src/frameworks/detect.test.ts',
  'packages/engine-knip/src/index.ts',
]

const report = (maxTokens?: number): string => {
  let output = ''
  const result: CheckResult = {
    diagnostics: [...CAPTURED],
    counts: { error: CAPTURED.filter((d) => d.severity === 'error').length, warn: CAPTURED.filter((d) => d.severity === 'warn').length, info: 0 },
    engineFailures: [],
    unavailableEngines: [],
    baseline: null,
    stats: { filesScanned: 232, filesAnalysed: 199, filesFromCache: 0, cacheByEngine: [], enginesRun: 1, durationMs: 155 },
    ruleset: { enabledConcepts: 284, overlaps: 0, uncovered: [], unknownKeys: [] },
  }
  const reporter = createReporter('agent', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
    ...(maxTokens === undefined ? {} : { maxTokens }),
  })
  reporter.onEvent({ type: 'done', result })
  return output
}

const sectionOf = (output: string, heading: string): string => {
  const body = output.slice(output.indexOf(heading))
  const next = body.indexOf('\n## ', 1)
  const end = next === -1 ? body.indexOf('\nnextActions') : next
  return body.slice(0, end)
}

test('the automated side is exactly what `sgate fix --unsafe` applies, and names the flag it needs', () => {
  const output = report()
  const automated = sectionOf(output, '## automated')

  expect(automated).toContain('### correctness.no-useless-spread')
  expect(automated).toContain('tier unsafe')
  expect(automated).toContain('Run: `sgate fix --unsafe`')
  for (const file of AUTOMATED_FILES) expect(automated).toContain(file)

  // The other five concepts the run produced are all `fixKind: 'none'` (three oxlint rules) or have
  // no registry entry at all (the two `slop-gate/config.*` ones slop-gate emits itself). Asserted as
  // absence from the automated section rather than presence in the judgement one, because the
  // failure that matters is a finding wrongly promised to `sgate fix`.
  for (const concept of [
    'correctness.vitest-no-conditional-expect',
    'correctness.vitest-require-to-throw-message',
    'config.unused-suppression',
    'config.suppression-missing-reason',
    'suspicious.consistent-function-scoping',
  ]) {
    expect(automated).not.toContain(`### ${concept}`)
    expect(sectionOf(output, '## judgement')).toContain(`### ${concept}`)
  }
})

test('a concept slop-gate emits itself lands on the judgement side rather than being dropped', () => {
  // `slop-gate/config.unused-suppression` has no `RuleEntry`, so a tier lookup returns nothing. The
  // failure this guards against is treating "no entry" as "unknown, skip it": these are three of the
  // largest finding groups on a real run of this repository, and losing them silently would be the
  // exact class of bug this reporter exists to prevent.
  const judgement = sectionOf(report(), '## judgement')
  expect(judgement).toContain('rule: slop-gate/config.unused-suppression')
  expect(judgement).toContain('3 findings in 1 file')
})

test('every captured finding appears in exactly one of the two sections', () => {
  const output = report()
  const automated = sectionOf(output, '## automated')
  const judgement = sectionOf(output, '## judgement')

  for (const diagnostic of CAPTURED) {
    const location = `${diagnostic.file}:${diagnostic.position.startLine}:${diagnostic.position.startColumn}`
    expect(automated.includes(location) !== judgement.includes(location), location).toBe(true)
  }
})

test('every concept a real run produces states why it matters', () => {
  const output = report()

  expect(output).toContain('why: A suppression comment that matches no diagnostic, left behind after a fix.')
  // `correctness.no-useless-spread` used to be the counter-example here: the registry generator named
  // it *and* described it ("Generated from oxlint's `unicorn/no-useless-spread` rule..."), which
  // restates the rule name instead of giving a reason, so the reporter dropped its `why:` line and
  // fell back to the third-party docs URL. It now has a rationale (concepts/curated.ts), as does
  // every other concept in this capture — which is why the note explaining an absent `why:` is
  // itself absent. That note is asserted on a synthetic run in `agent.test.ts`; asserting it here
  // would mean keeping one real concept deliberately unexplained to have something to point at.
  expect(output).not.toContain('Generated from')
  expect(output).not.toContain('`why:` appears only where')
  expect(output).toContain('why: Spreading a literal into a literal of the same kind')

  const groups = new Map(
    output
      .split('\n### ')
      .slice(1)
      .map((group) => [group.slice(0, group.indexOf(' —')), group.slice(0, group.indexOf('\n\n'))]),
  )
  for (const concept of new Set(CAPTURED.map((diagnostic) => diagnostic.concept))) {
    expect(groups.get(concept), concept).toContain('\nwhy: ')
  }
})

test('the report over real findings is byte-identical across two runs', () => {
  expect(report()).toBe(report())
  expect(report(1_500)).toBe(report(1_500))
})
