import type { Engine } from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { createTscEngine } from '@misaon/slop-gate-engine-tsc'

/**
 * The engines a real `sgate` run registers. Shared by `check` and the `rules` governance
 * commands so arbitration's `participatingEngines`/`capabilities` — which drive `rules why`'s
 * explanations — are always computed from exactly the same engine set a real `check` would use,
 * never a second, hand-maintained guess at it.
 *
 * `rootDir` is now a required parameter (previously none): `tsc` is project-granularity and
 * `typescript` is a peer dependency resolved from the analysed project itself, not from wherever
 * `@misaon/slop-gate-engine-tsc` happens to be installed — there is no project-independent default
 * the way there is for oxlint. Both existing call sites (`commands/check.ts`,
 * `commands/rules/shared.ts`) already compute `rootDir` before calling this, so the change is
 * mechanical for them.
 *
 * Registering `tsc` here does not, on its own, make `sgate check` invoke it: arbitration only
 * assigns it work if some enabled concept resolves to it, and `types.type-error` is not part of the
 * `recommended` preset (see `packages/core/src/config/presets.ts`'s own comment on that decision) —
 * a user opts in today via `rules: { 'types.type-error': 'error' }` until a future preset does it by
 * default.
 */
export function defaultEngines(rootDir: string): Engine[] {
  return [createOxlintEngine(), createTscEngine({ rootDir })]
}
