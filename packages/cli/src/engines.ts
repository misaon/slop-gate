import type { Engine } from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'

/**
 * The engines a real `sgate` run registers. Shared by `check` and the `rules` governance
 * commands so arbitration's `participatingEngines`/`capabilities` — which drive `rules why`'s
 * explanations — are always computed from exactly the same engine set a real `check` would use,
 * never a second, hand-maintained guess at it.
 */
export function defaultEngines(): Engine[] {
  return [createOxlintEngine()]
}
