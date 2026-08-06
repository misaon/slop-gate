import { CONCEPTS } from '../concepts/catalogue.ts'
import { PRESETS } from '../config/presets.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { ruleRefKey } from '../registry/types.ts'
import { TELEMETRY_SCHEMA_VERSION, type TelemetryPayload } from './payload.ts'

/**
 * The ingest endpoint is public and cannot be otherwise: anonymous senders cannot be authenticated,
 * and any secret shipped in an npm package is a published secret. So the defence is not "who sent
 * this" but "could a real run have produced this", and this is that question in code.
 *
 * The strong check is that **every rule and concept id must exist in our own registry**. Fabricating
 * plausible traffic then means using our vocabulary and our ratios, which is a far higher bar than
 * posting arbitrary JSON, and it makes the junk that does get through look like the real thing —
 * bounded, and removable by ingest window.
 *
 * Rejections are deliberately coarse to the caller. A validator that explains precisely why is a
 * validator that teaches an attacker how to pass.
 */
export type ValidationResult =
  | { readonly ok: true; readonly payload: TelemetryPayload }
  | { readonly ok: false; readonly reason: string }

/** Bounds are far above any real run and far below anything that would hurt the table. */
const LIMITS = {
  rules: 2_000,
  disabledConcepts: 2_000,
  engines: 32,
  perRule: 5_000_000,
  files: 10_000_000,
  durationMs: 24 * 60 * 60 * 1000,
} as const

const PLATFORMS = new Set(['linux', 'darwin', 'win32', 'freebsd', 'openbsd', 'sunos', 'aix', 'android'])
const PRESET_NAMES = new Set(Object.keys(PRESETS))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[\w.]{1,32})?$/
const MAJOR = /^\d{1,3}$/

const KNOWN_RULES: ReadonlySet<string> = new Set(RULE_ENTRIES.map((entry) => ruleRefKey(entry)))
const KNOWN_CONCEPTS: ReadonlySet<string> = new Set(CONCEPTS.map((concept) => concept.id))
const KNOWN_ENGINES: ReadonlySet<string> = new Set(RULE_ENTRIES.map((entry) => entry.engine))

const TOP_LEVEL_KEYS = new Set([
  'schema', 'run', 'project', 'slopGate', 'node', 'platform', 'ci', 'durationMs',
  'filesScanned', 'filesAnalysed', 'engines', 'rules', 'disabledConcepts', 'preset', 'baseline',
])

const RULE_KEYS = new Set(['rule', 'findings', 'suppressed', 'baselined', 'generated'])
const ENGINE_KEYS = new Set(['id', 'version', 'ran'])

function isCount(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= limit
}

function onlyKnownKeys(value: object, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateTelemetryPayload(input: unknown): ValidationResult {
  const reject = (reason: string): ValidationResult => ({ ok: false, reason })

  if (!isRecord(input)) return reject('not an object')
  // An unknown key is how someone smuggles a field past a validator that only checks the ones it knows.
  if (!onlyKnownKeys(input, TOP_LEVEL_KEYS)) return reject('unknown key')

  if (input['schema'] !== TELEMETRY_SCHEMA_VERSION) return reject('schema')
  if (typeof input['run'] !== 'string' || !UUID.test(input['run'])) return reject('run')
  if (input['project'] !== null && (typeof input['project'] !== 'string' || !UUID.test(input['project']))) {
    return reject('project')
  }
  if (typeof input['slopGate'] !== 'string' || !SEMVER.test(input['slopGate'])) return reject('version')
  if (typeof input['node'] !== 'string' || !MAJOR.test(input['node'])) return reject('node')
  if (typeof input['platform'] !== 'string' || !PLATFORMS.has(input['platform'])) return reject('platform')
  if (typeof input['ci'] !== 'boolean') return reject('ci')
  if (typeof input['baseline'] !== 'boolean') return reject('baseline')
  if (!isCount(input['durationMs'], LIMITS.durationMs)) return reject('duration')
  if (!isCount(input['filesScanned'], LIMITS.files)) return reject('filesScanned')
  if (!isCount(input['filesAnalysed'], LIMITS.files)) return reject('filesAnalysed')
  // A run cannot analyse more files than it scanned. Internal consistency is cheap to check and
  // annoying to fake, because it forces generated traffic to model a real run rather than pick numbers.
  if (input['filesAnalysed'] > input['filesScanned']) return reject('analysed exceeds scanned')

  const preset = input['preset']
  if (preset !== null && (typeof preset !== 'string' || !PRESET_NAMES.has(preset))) return reject('preset')

  const engines = input['engines']
  if (!Array.isArray(engines) || engines.length > LIMITS.engines) return reject('engines')
  for (const engine of engines) {
    if (!isRecord(engine) || !onlyKnownKeys(engine, ENGINE_KEYS)) return reject('engine shape')
    if (typeof engine['id'] !== 'string' || !KNOWN_ENGINES.has(engine['id'])) return reject('engine id')
    if (engine['version'] !== null && typeof engine['version'] !== 'string') return reject('engine version')
    if (typeof engine['ran'] !== 'boolean') return reject('engine ran')
  }

  const rules = input['rules']
  if (!Array.isArray(rules) || rules.length > LIMITS.rules) return reject('rules')
  const seen = new Set<string>()
  for (const rule of rules) {
    if (!isRecord(rule) || !onlyKnownKeys(rule, RULE_KEYS)) return reject('rule shape')
    const id = rule['rule']
    if (typeof id !== 'string' || !KNOWN_RULES.has(id)) return reject('unknown rule')
    if (seen.has(id)) return reject('duplicate rule')
    seen.add(id)
    for (const field of ['findings', 'suppressed', 'baselined', 'generated'] as const) {
      if (!isCount(rule[field], LIMITS.perRule)) return reject(`rule ${field}`)
    }
  }

  const disabled = input['disabledConcepts']
  if (!Array.isArray(disabled) || disabled.length > LIMITS.disabledConcepts) return reject('disabledConcepts')
  for (const concept of disabled) {
    if (typeof concept !== 'string' || !KNOWN_CONCEPTS.has(concept)) return reject('unknown concept')
  }
  if (new Set(disabled).size !== disabled.length) return reject('duplicate concept')

  return { ok: true, payload: input as unknown as TelemetryPayload }
}
