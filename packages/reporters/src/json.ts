import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

/**
 * **The version is not a compatibility marker** — every reader keeps parsing this document — it is what a
 * consumer checks before believing an *emptiness*. Each bump expired one such assumption:
 * - 2, `unavailableEngines`: no `engineFailures` and no `diagnostics` no longer means "clean"; an engine may
 *   have been skipped.
 * - 3, `baseline`: an empty `diagnostics` array can mean "a baseline accepted every finding".
 * - 4, two renames — the first changes that are not additive, so a v3 reader finds the old keys missing
 *   rather than moved and would read that absence as a value: `ruleset.suppressed` → `ruleset.overlaps`
 *   (it counts rules that lost arbitration; `suppressed` now means only a finding a human silenced), and
 *   each diagnostic's `ruleId` → `ruleRefKey`, read as "this finding has no rule".
 */
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
            // Omitted entirely unless `--timing` asked for it, and **no version bump**: the version exists
            // to serve emptinesses whose meaning expired, and an absent `timings` says only that nobody
            // asked to measure, so a v4 reader's assumptions all survive it.
            ...(event.result.timings === undefined ? {} : { timings: event.result.timings }),
            ruleset: event.result.ruleset,
            engineFailures: event.result.engineFailures,
            // Emitted whole, including an absent engine that displaced nothing, which `pretty` and `agent`
            // filter out as not a gap: this document is also the record of *which machine produced it*, and
            // two machines whose reports differ need the raw fact available to compare.
            unavailableEngines: event.result.unavailableEngines,
            // `null` when no baseline was read, never omitted: a consumer has to tell "no baseline" from "a
            // field this producer does not emit". The accepted findings themselves are deliberately *not*
            // here — `diagnostics` is the contract for what fails a build, and a caller that wants the whole
            // truth runs `--no-baseline`.
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
