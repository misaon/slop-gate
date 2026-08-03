import { isOneOf } from '../guards.ts'
import type { ConceptId } from '../concepts/catalogue.ts'
import type { EngineId } from '../registry/types.ts'

export type RuleLevel = 'off' | 'info' | 'warn' | 'error'

/**
 * A rule's options, **opaque to core** — exactly the arrangement `RuleEntry.engineRuleId` already
 * uses: core carries the value, sorts nothing inside it, validates nothing about it, and the engine
 * adapter that owns the elected rule is the only thing that gives it meaning. Core interpreting an
 * oxlint option shape would couple the two and be wrong for the next engine.
 *
 * A **positional list**, not an object, because the ESLint-family option grammar every engine here
 * inherits is positional and its first element is frequently a bare string rather than a settings
 * object. This is not theoretical: `eqeqeq`'s `smart` mode — the one `recommended` needs, worth 2553
 * fewer findings on the corpus — is only reachable as `["warn", "smart"]`. Verified against oxlint
 * 1.76.0, which rejects the object form outright: *unknown variant `null`, expected `always` or
 * `smart`*. The previous `Record<string, unknown>` could not express it at all.
 *
 * Core declining to validate the contents costs little, because the engine usually does: oxlint
 * refuses to parse the whole config file and names the rule and the offending key — *unknown field
 * `nulll`, expected `null`*. Usually, not always: `typescript/ban-ts-comment` accepts an unknown key
 * and an unknown value in silence (both confirmed against 1.76.0), so a typo in *some* rules' options
 * is invisible. That is an argument for the generated per-concept option types spec §5.6 already
 * plans, not for core growing an opinion about a grammar it does not own.
 */
export type RuleOptions = readonly unknown[]

/**
 * `'warn'` and `['warn', ...options]` mean different things beyond the obvious: only the tuple form
 * *expresses an opinion about options at all*. A later layer writing the bare level raises severity
 * and inherits whatever options an earlier layer set (see `materialize` in `./resolve.ts`), which is
 * what keeps a user's `'pedantic.eqeqeq': 'error'` from silently discarding `recommended`'s `smart`
 * and restoring 2553 findings. `['error']` — the tuple with no options — is the explicit reset.
 */
export type RuleSetting = RuleLevel | readonly [RuleLevel, ...RuleOptions]

export type EngineRuleKey = `${EngineId}/${string}`

export type RuleKey = ConceptId | EngineRuleKey

export type RuleMap = Partial<Record<RuleKey, RuleSetting>>

export type OverrideBlock = {
  readonly files: readonly string[]
  readonly rules: RuleMap
}

export type PresetName = 'recommended' | 'strict' | 'slop'

export type EngineOptions = { readonly enabled?: boolean | 'auto' }

/**
 * What to do about findings in machine-written files (`discovery/detect-generated.ts`). `'skip'` is the
 * default and marks them suppressed; `'check'` reports them like any other file.
 *
 * A switch rather than an `ignore` entry because the two are not the same operation: `ignore` takes
 * files out of the inventory, which also takes them out of knip's import graph and can *manufacture*
 * findings — a hand-written module whose only importer was generated then reads as unreachable. This
 * leaves every engine's view of the repository intact and only hides the report.
 */
export type GeneratedPolicy = 'skip' | 'check'

export type SlopGateConfig = {
  readonly extends?: readonly PresetName[]
  readonly workspaces?: 'auto' | readonly string[]
  readonly rules?: RuleMap
  readonly overrides?: readonly OverrideBlock[]
  readonly owners?: Partial<Record<ConceptId, EngineId>>
  readonly engines?: Partial<Record<EngineId, EngineOptions>>
  readonly ignore?: readonly string[]
  readonly generated?: GeneratedPolicy
}

const RULE_LEVELS: readonly RuleLevel[] = ['off', 'info', 'warn', 'error']

/** Ordinal strength, for "the strongest level any layer assigns". */
export const LEVEL_STRENGTH: Readonly<Record<RuleLevel, number>> = { off: 0, info: 1, warn: 2, error: 3 }

export function isRuleLevel(value: unknown): value is RuleLevel {
  return typeof value === 'string' && isOneOf(value, RULE_LEVELS)
}

/**
 * Narrows on `typeof === 'string'`, not `Array.isArray`. A `readonly` tuple is not assignable to
 * `Array.isArray`'s `any[]` predicate, so that form narrows in neither direction: the tuple branch
 * degrades to `any` and the string branch still needs a cast. Both sides then escape strict
 * checking entirely, which is exactly what this function exists to provide.
 *
 * `options` is `undefined` for the bare-level form and an array — possibly empty — for the tuple
 * form. The distinction is load-bearing rather than cosmetic: it is what the cascade uses to tell
 * "this layer said nothing about options" from "this layer cleared them" (see `RuleSetting`).
 */
export function splitRuleSetting(setting: RuleSetting): {
  level: RuleLevel
  options: RuleOptions | undefined
} {
  return typeof setting === 'string'
    ? { level: setting, options: undefined }
    : { level: setting[0], options: setting.slice(1) }
}
