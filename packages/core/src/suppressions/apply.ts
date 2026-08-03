import type { Diagnostic } from '../diagnostics/types.ts'
import type { SuppressionDirective } from './parse.ts'

export type ApplySuppressionsResult = {
  /**
   * Same length and order as the input `diagnostics`, with `.suppressed` set on every entry a directive matched.
   * Nothing is dropped here — a suppressed diagnostic is still a real object `engine/normalize.ts` can cache, and
   * `run/check.ts` is the layer that decides to hide it from the default result.
   */
  diagnostics: Diagnostic[]
  /** Directives that matched no diagnostic in their scope — reported as `config.unused-suppression`. */
  unused: readonly SuppressionDirective[]
  /** Directives with no `-- reason` — reported as `config.suppression-missing-reason`, independently
   *  of whether the same directive is also unused: the two are different problems. */
  missingReason: readonly SuppressionDirective[]
}

/**
 * Given the directives `parseSuppressions` (`parse.ts`) found in a file and the diagnostics already produced for
 * it, decides which diagnostics are suppressed and which directives never matched anything or never gave a reason.
 * Pure — no I/O and no knowledge of severity or config; `engine/normalize.ts` turns `unused`/`missingReason` into
 * actual `Diagnostic`s because only it has `levelOf`, a `LineIndex` and `fingerprint()` in scope.
 */
export function applySuppressions(
  directives: readonly SuppressionDirective[],
  diagnostics: readonly Diagnostic[],
): ApplySuppressionsResult {
  // Independent per directive, against the *original* diagnostic set — not "what's left after an earlier directive
  // already claimed it". Two directives that both cover the same finding (an overlapping `disable-file` and
  // `disable-next-line`) are each separately "used"; no finding is consumed such that a sibling loses its claim.
  const unused = directives.filter((directive) => !diagnostics.some((d) => directiveMatches(directive, d)))
  const missingReason = directives.filter((directive) => directive.reason === null)

  // Marking, by contrast, picks exactly one directive per diagnostic — first match in source order — since a
  // diagnostic can only carry one `.suppressed` reason. Which one wins when two both match is an arbitrary but
  // deterministic tie-break, and has no effect on `unused`/`missingReason`, computed independently above.
  const diagnosticsWithMarkers = diagnostics.map((diagnostic) => {
    const directive = directives.find((candidate) => directiveMatches(candidate, diagnostic))
    if (directive === undefined) return diagnostic
    return {
      ...diagnostic,
      suppressed: directive.reason === null ? { by: 'inline' as const } : { by: 'inline' as const, reason: directive.reason },
    }
  })

  return { diagnostics: diagnosticsWithMarkers, unused, missingReason }
}

function directiveMatches(directive: SuppressionDirective, diagnostic: Diagnostic): boolean {
  if (directive.appliesToLine !== null && diagnostic.position.startLine !== directive.appliesToLine) return false
  if (directive.targets.length === 0) return true
  return directive.targets.some((target) => target === diagnostic.concept || target === diagnostic.ruleRefKey)
}
