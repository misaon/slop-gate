import type { CheckEvent, Diagnostic, Severity } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'
import { PLATFORM_LIMITS, PLATFORM_SEVERITY, escapeCommandData, escapeCommandProperty } from './platform.ts'

export function createGithubReporter(context: ReporterContext): Reporter {
  const emitted: Record<Severity, number> = { error: 0, warn: 0, info: 0 }

  return {
    onEvent(event: CheckEvent) {
      if (event.type === 'diagnostic') {
        emitted[event.diagnostic.severity] += 1
        context.write(`${annotation(event.diagnostic)}\n`)
        return
      }

      if (event.type === 'engine-failed') {
        context.write(`::error title=slop-gate::engine ${event.engine} failed: ${escapeCommandData(event.message)}\n`)
        return
      }

      if (event.type !== 'done') return
      for (const notice of truncationNotices(emitted)) context.write(`${notice}\n`)
    },
  }
}

function annotation(diagnostic: Diagnostic): string {
  const properties = [
    `title=${escapeCommandProperty(diagnostic.concept)}`,
    ...(diagnostic.file === null
      ? []
      : [
          `file=${escapeCommandProperty(diagnostic.file)}`,
          `line=${diagnostic.position.startLine}`,
          `col=${diagnostic.position.startColumn}`,
          `endLine=${diagnostic.position.endLine}`,
          `endColumn=${diagnostic.position.endColumn}`,
        ]),
  ]

  return `::${PLATFORM_SEVERITY.github[diagnostic.severity]} ${properties.join(',')}::${escapeCommandData(diagnostic.message)}`
}

function truncationNotices(emitted: Readonly<Record<Severity, number>>): readonly string[] {
  const cap = PLATFORM_LIMITS.githubAnnotationsPerLevel

  return (['error', 'warn', 'info'] as const)
    .filter((severity) => emitted[severity] > cap)
    .map((severity) => {
      const level = PLATFORM_SEVERITY.github[severity]
      return (
        `::notice title=slop-gate::${emitted[severity]} ${level} annotations were emitted and GitHub renders ` +
        `${cap} per step. Read the step log, or upload the SARIF report, for the rest.`
      )
    })
}
