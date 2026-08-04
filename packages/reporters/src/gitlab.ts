import type { CheckEvent, Diagnostic } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'
import { PLATFORM_SEVERITY } from './platform.ts'

export function createGitlabReporter(context: ReporterContext): Reporter {
  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return
      context.write(`${JSON.stringify(event.result.diagnostics.map(toCodeQualityViolation), null, 2)}\n`)
    },
  }
}

export function toCodeQualityViolation(diagnostic: Diagnostic): unknown {
  return {
    description: diagnostic.message,
    check_name: diagnostic.concept,
    fingerprint: diagnostic.fingerprint,
    severity: PLATFORM_SEVERITY.gitlab[diagnostic.severity],
    location: {
      path: diagnostic.file ?? 'slop-gate.config.ts',
      lines: { begin: diagnostic.file === null ? 1 : diagnostic.position.startLine },
    },
  }
}
