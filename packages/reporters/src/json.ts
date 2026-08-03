import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

/**
 * Bumped to 2 by `unavailableEngines`, even though the field is purely additive and every v1 reader
 * keeps parsing this document unchanged. The version is not a compatibility marker here, it is what
 * a consumer checks before believing an emptiness: a v1 document with no `engineFailures` and no
 * `diagnostics` meant "clean", and in a v2 document it does not — an engine may have been skipped.
 * A reader that never learns the field exists must at least be able to learn that its assumption
 * expired.
 *
 * Bumped to 3 by `baseline`, for exactly that reason again and more sharply: in a v3 document an empty
 * `diagnostics` array can mean "a baseline accepted every finding", so a v2 reader's equation of empty
 * with clean has expired a second time.
 *
 * Bumped to 4 by two renames — the first changes here that are not additive, so a v3 reader finds the
 * old keys missing rather than moved and would read that absence as a value:
 * - `ruleset.suppressed` → `ruleset.overlaps`, read as "no rules overlapped". It counts rules that
 *   lost arbitration; `suppressed` now means only a finding a human silenced.
 * - each diagnostic's `ruleId` → `ruleRefKey`, read as "this finding has no rule".
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
            // Omitted entirely unless `--timing` asked for it, and **no version bump**: every rule this
            // document's version exists to serve is about an emptiness whose meaning expired, and an
            // absent `timings` says only that nobody asked to measure. A v4 reader's assumptions all
            // survive it. `phases` accounts for the whole of `stats.durationMs`; `rules` carries a
            // finding count per rule rather than a duration, for the reason `TimingReport` gives.
            ...(event.result.timings === undefined ? {} : { timings: event.result.timings }),
            ruleset: event.result.ruleset,
            engineFailures: event.result.engineFailures,
            // Emitted whole, including an absent engine that displaced nothing: `pretty` and `agent`
            // filter that case out because it is not a gap and a human reader does not need it, but
            // this document is also the record of *which machine produced it*, and two machines
            // whose reports differ need the raw fact available to compare.
            unavailableEngines: event.result.unavailableEngines,
            // `null` when no baseline was read, never omitted: a consumer has to be able to tell "no
            // baseline" from "a field this producer does not emit". The accepted findings themselves
            // are deliberately *not* here — `diagnostics` is the contract for what fails a build, and
            // a caller that wants the whole truth runs `--no-baseline`.
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
