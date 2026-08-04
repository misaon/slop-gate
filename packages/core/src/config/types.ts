import { isOneOf } from '../guards.ts'
import type { ConceptId } from '../concepts/catalogue.ts'
import type { EngineId } from '../registry/types.ts'

export type RuleLevel = 'off' | 'info' | 'warn' | 'error'

/**
 * A rule's options, **opaque to core** — the same arrangement `RuleEntry.engineRuleId` uses: core carries the
 * value, sorts nothing inside it, validates nothing about it, and the engine adapter that owns the elected rule is
 * the only thing that gives it meaning. Interpreting an oxlint option shape here would couple the two and be wrong
 * for the next engine.
 *
 * A **positional list**, not an object, because the ESLint-family option grammar every engine here inherits is
 * positional and its first element is frequently a bare string rather than a settings object. `eqeqeq`'s `smart`
 * mode — the one `recommended` needs, worth 2553 fewer findings on the corpus — is only reachable as
 * `["warn", "smart"]`; oxlint 1.76.0 rejects the object form outright: *unknown variant `null`, expected
 * `always` or `smart`*.
 *
 * Declining to validate costs little because the engine usually does — oxlint refuses to parse the whole config
 * file and names the rule and the offending key (*unknown field `nulll`, expected `null`*). Usually, not always:
 * `typescript/ban-ts-comment` accepts an unknown key *and* an unknown value in silence (both confirmed against
 * 1.76.0), so a typo in *some* rules' options is invisible — an argument for the generated per-concept option
 * types spec §5.6 already plans, not for core growing an opinion about a grammar it does not own.
 */
export type RuleOptions = readonly unknown[]

/**
 * `'warn'` and `['warn', ...options]` mean different things: only the tuple form *expresses an opinion about
 * options at all*. A later layer writing the bare level raises severity and inherits whatever options an earlier
 * layer set (see `materialize` in `./resolve.ts`), which is what keeps a user's `'pedantic.eqeqeq': 'error'` from
 * silently discarding `recommended`'s `smart` and restoring 2553 findings. `['error']` is the explicit reset.
 */
export type RuleSetting = RuleLevel | readonly [RuleLevel, ...RuleOptions]

type EngineRuleKey = `${EngineId}/${string}`

export type RuleKey = ConceptId | EngineRuleKey

export type RuleMap = Partial<Record<RuleKey, RuleSetting>>

export type OverrideBlock = {
  readonly files: readonly string[]
  readonly rules: RuleMap
}

export type PresetName = 'essential' | 'recommended' | 'strict' | 'slop'

type EngineOptions = { readonly enabled?: boolean | 'auto' }

/**
 * What to do about findings in machine-written files (`discovery/detect-generated.ts`). `'skip'` is the default
 * and marks them suppressed; `'check'` reports them like any other file. A switch rather than an `ignore` entry
 * because the two are not the same operation: `ignore` takes files out of the inventory, which also takes them
 * out of knip's import graph and can *manufacture* findings — a hand-written module whose only importer was
 * generated then reads as unreachable. This leaves every engine's view of the repository intact and only hides
 * the report.
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
 * Narrows on `typeof === 'string'`, not `Array.isArray`: a `readonly` tuple is not assignable to
 * `Array.isArray`'s `any[]` predicate, so that form narrows in neither direction — the tuple branch degrades to
 * `any` and the string branch still needs a cast, escaping the strict checking this function exists to provide.
 * `options` is `undefined` for the bare-level form and an array — possibly empty — for the tuple form, which is
 * what the cascade uses to tell "this layer said nothing about options" from "this layer cleared them" (see
 * `RuleSetting`).
 */
export function splitRuleSetting(setting: RuleSetting): {
  level: RuleLevel
  options: RuleOptions | undefined
} {
  return typeof setting === 'string'
    ? { level: setting, options: undefined }
    : { level: setting[0], options: setting.slice(1) }
}
