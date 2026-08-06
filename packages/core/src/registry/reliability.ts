/**
 * How often a rule is right, measured by reading its findings rather than counting them.
 *
 * This is deliberately sparse. A rule with no entry is **unknown**, not 100% — claiming a precision
 * nobody measured is the kind of number this tool exists to distrust. Every entry names where its
 * sample came from so the figure can be re-taken when the rule or the engine changes.
 *
 * It is a separate axis from `impact.ts` on purpose. A rule that is wrong most of the time is not
 * "low impact", it is unreliable, and the answer to unreliable is to fix it or withhold it — not to
 * report it more quietly. `vitest/valid-title` below is exactly that mistake, caught after the fact.
 */
export type Reliability = {
  /** Findings read individually. */
  readonly sampled: number
  /** Of those, the ones that were right about the code. */
  readonly correct: number
  /** Where the sample came from, precisely enough to repeat it. */
  readonly source: string
  /** Engine version the sample was taken against, since a rule's precision moves with it. */
  readonly measuredAgainst: string
}

export const RULE_RELIABILITY: Readonly<Record<string, Reliability>> = {
  'oxlint/vitest/valid-title': {
    sampled: 174,
    correct: 11,
    source:
      'Every finding across five repositories of the 20-repository corpus — immich 157, hono 8, h3 4, ' +
      'excalidraw 4, preact 1 — read at its byte range. 163 are `Title must be a string` on a title ' +
      'passed as a variable or an expression from a table-driven test, and none of those is wrong ' +
      'about the type; `test(JSON.stringify(t[1]), …)` is among them. The 11 correct ones are leading ' +
      'or trailing whitespace.',
    measuredAgainst: 'oxlint 1.76.0',
  },
  'oxlint/import/no-unassigned-import': {
    sampled: 5,
    correct: 0,
    source:
      'Both repositories the generated registry was validated against: 1 finding on slop-gate, 4 on ' +
      'the srvc-bat playground. Every one is a deliberate side-effect-only import — `reflect-metadata`, ' +
      '`dotenv/config`, a VitePress theme CSS, app startup instrumentation, and this repository’s own ' +
      'CLI entry shim.',
    measuredAgainst: 'oxlint 1.76.0',
  },
  'actionlint/action': {
    sampled: 10,
    correct: 1,
    source:
      'All 10 findings over a 403-file corpus. The one true positive is a Docker action whose ' +
      '`runs.image` names a file that is not a Dockerfile; the other 9 are `could not parse action ' +
      'metadata` against composite-action inputs GitHub itself accepts at run time.',
    measuredAgainst: 'actionlint 1.7.12',
  },
}

export function reliabilityOf(ruleRefKey: string): Reliability | null {
  return RULE_RELIABILITY[ruleRefKey] ?? null
}

/** Rounded to whole percent; a sample this small does not support decimals. */
export function reliabilityPercent(reliability: Reliability): number {
  return Math.round((reliability.correct / reliability.sampled) * 100)
}
