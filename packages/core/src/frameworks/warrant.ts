import type { EnabledLevel, FrameworkEvidence, FrameworkMeasurement } from './types.ts'

/**
 * The higher bar an addition has to clear, as arithmetic rather than as a note in the spec.
 *
 * A subtraction and an addition fail in opposite directions and the costs are not comparable. A
 * wrong subtraction loses one rule's coverage, which the user restores in a single config line and
 * which spec §23.5 already accepts on a warrant as thin as mechanism identity. A wrong addition
 * produces findings on code that passed yesterday, triggered by a dependency somebody added for an
 * unrelated reason — and at `error` it stops the build on the way past.
 *
 * Returns the sentence to refuse with, or `null` to let the adjustment through.
 */
export function refuseEnable(
  adjustment: { readonly level: EnabledLevel; readonly measured: FrameworkMeasurement },
  evidence: readonly FrameworkEvidence[],
): string | null {
  const { findings, falsePositives, repository } = adjustment.measured

  // `test-framework` is the one profile that applies with no evidence at all: neither jest nor
  // vitest being declared *is* its finding, and spec §23.2 licenses that only because it disables.
  // An addition from the same position would be a rule switched on because a repository failed to
  // mention something, which is the one detection shape that cannot be wrong in a safe direction.
  if (evidence.length === 0) {
    return 'a profile that applied on no evidence may only subtract, never add'
  }
  if (findings < 1) {
    return `the rule never fired on ${repository}, so nothing about it was measured`
  }
  if (falsePositives > findings) {
    return `the measurement on ${repository} claims more false positives (${falsePositives}) than findings (${findings})`
  }

  // The one threshold here that is derived rather than chosen. `resolveExitCode` fails a run on a
  // single `error` with no opt-in anywhere, where a `warn` costs nothing unless the user asked for
  // `--max-warnings` — so `error` is the level at which installing a package can stop a build, and
  // the only defensible bar for that is the one `slop.narrative-comment` and `slop.stub-implementation`
  // cleared before they went into `recommended`: no false positive at all.
  if (adjustment.level === 'error' && falsePositives > 0) {
    return `an addition at \`error\` fails a build on its own, so it needs a clean measurement; ${falsePositives} of ${findings} findings on ${repository} were false`
  }

  // Below `error` the user has opted into any build effect, so the bar is the ordinary one — and it
  // is set where the `no-conditional-expect` retraction (M0 follow-ups) put it: 4 wrong out of 8 was
  // judged not enough to take a rule *out*, so it cannot be enough to put one *in* either.
  if (falsePositives * 2 >= findings) {
    return `${falsePositives} of ${findings} findings on ${repository} were false, which is not a majority right`
  }

  return null
}
