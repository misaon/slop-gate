import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

// Not a compatibility marker — every reader keeps parsing this document. It is what a consumer
// checks before believing an *emptiness*: each bump expired one such assumption. 5 added
// `truncated`, so a short `diagnostics` array no longer means the run found that few.
export const JSON_REPORT_VERSION = 5

export function createJsonReporter(context: ReporterContext): Reporter {
  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return

      // Bounded only when asked. `medusajs/medusa` emitted 23 MB and `directus/directus` 10.5 MB,
      // but this document is a machine contract and silently shortening it by default would break
      // a consumer that counts on having everything.
      const all = event.result.diagnostics
      const limit = context.maxFindings
      const kept = limit === undefined || all.length <= limit ? all : all.slice(0, limit)

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
            // Absent when nothing was dropped: absence is how this document says "complete", so it
            // must not appear merely because a bound was offered.
            ...(kept.length === all.length ? {} : { truncated: { dropped: all.length - kept.length, of: all.length } }),
            diagnostics: kept,
          },
          null,
          2,
        )}\n`,
      )
    },
  }
}
