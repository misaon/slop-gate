import type { Diagnostic } from '../diagnostics/types.ts'
import type { SuppressionDirective } from './parse.ts'

export type ApplySuppressionsResult = {
  diagnostics: Diagnostic[]
  unused: readonly SuppressionDirective[]
  missingReason: readonly SuppressionDirective[]
}

export function applySuppressions(
  directives: readonly SuppressionDirective[],
  diagnostics: readonly Diagnostic[],
): ApplySuppressionsResult {
  const unused = directives.filter((directive) => !diagnostics.some((d) => directiveMatches(directive, d)))
  const missingReason = directives.filter((directive) => directive.reason === null)

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
