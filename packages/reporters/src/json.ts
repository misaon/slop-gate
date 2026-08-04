import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

// Not a compatibility marker — every reader keeps parsing this document. It is what a consumer
// checks before believing an *emptiness*: each bump expired one such assumption.
export const JSON_REPORT_VERSION = 4

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
            ...(event.result.timings === undefined ? {} : { timings: event.result.timings }),
            ruleset: event.result.ruleset,
            engineFailures: event.result.engineFailures,
            unavailableEngines: event.result.unavailableEngines,
            baseline: event.result.baseline,
            diagnostics: event.result.diagnostics,
          },
          null,
          2,
        )}\n`,
      )
    },
  }
}
