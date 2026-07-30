import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

export const JSON_REPORT_VERSION = 1

export function createJsonReporter(context: ReporterContext): Reporter {
  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return
      context.write(
        `${JSON.stringify(
          {
            version: JSON_REPORT_VERSION,
            counts: event.result.counts,
            stats: event.result.stats,
            ruleset: event.result.ruleset,
            engineFailures: event.result.engineFailures,
            diagnostics: event.result.diagnostics,
          },
          null,
          2,
        )}\n`,
      )
    },
  }
}
