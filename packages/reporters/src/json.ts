import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

/**
 * Bumped to 2 by `unavailableEngines`, even though the field is purely additive and every v1 reader
 * keeps parsing this document unchanged. The version is not a compatibility marker here, it is what
 * a consumer checks before believing an emptiness: a v1 document with no `engineFailures` and no
 * `diagnostics` meant "clean", and in a v2 document it does not — an engine may have been skipped.
 * A reader that never learns the field exists must at least be able to learn that its assumption
 * expired.
 */
export const JSON_REPORT_VERSION = 2

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
            // Emitted whole, including an absent engine that displaced nothing: `pretty` and `agent`
            // filter that case out because it is not a gap and a human reader does not need it, but
            // this document is also the record of *which machine produced it*, and two machines
            // whose reports differ need the raw fact available to compare.
            unavailableEngines: event.result.unavailableEngines,
            diagnostics: event.result.diagnostics,
          },
          null,
          2,
        )}\n`,
      )
    },
  }
}
