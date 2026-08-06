import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * `DO_NOT_TRACK` is the cross-tool convention and is honoured first, so someone who has already
 * expressed the preference once does not have to learn ours.
 */
const OFF_VALUES = new Set(['0', 'false', 'off', 'no'])
const ON_VALUES = new Set(['1', 'true', 'on', 'yes'])

export type ConsentDecision =
  | { readonly send: false; readonly why: 'disabled' | 'do-not-track' | 'too-soon' | 'no-endpoint' }
  | { readonly send: true; readonly project: string | null; readonly firstRun: boolean }

/** At most one report an hour per checkout: enough to see change, not enough to weight heavy users. */
const MIN_INTERVAL_MS = 60 * 60 * 1000

export type ConsentOptions = {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly stateDir: string
  readonly now?: number
}

export function telemetryDisabled(env: Readonly<Record<string, string | undefined>>): 'disabled' | 'do-not-track' | null {
  const doNotTrack = env['DO_NOT_TRACK']
  if (doNotTrack !== undefined && !OFF_VALUES.has(doNotTrack.toLowerCase())) return 'do-not-track'

  const own = env['SLOP_GATE_TELEMETRY']
  if (own !== undefined && OFF_VALUES.has(own.toLowerCase())) return 'disabled'
  if (own !== undefined && !ON_VALUES.has(own.toLowerCase())) return 'disabled'
  return null
}

/**
 * The project id is a random UUID written next to the cache. It is deliberately not derived from the
 * repository: a git remote has so little entropy that a hash of it is reversible by enumeration, and
 * a table keyed on that would be deanonymisable if it ever leaked.
 */
async function projectId(stateDir: string): Promise<string | null> {
  const path = join(stateDir, 'project-id')
  const existing = await readFile(path, 'utf8').catch(() => null)
  if (existing !== null && existing.trim() !== '') return existing.trim()

  const created = randomUUID()
  const written = await mkdir(stateDir, { recursive: true })
    .then(() => writeFile(path, `${created}\n`, { encoding: 'utf8', mode: 0o600 }))
    .then(() => true)
    .catch(() => false)
  return written ? created : null
}

async function lastSentAt(stateDir: string): Promise<number> {
  const stats = await stat(join(stateDir, 'telemetry-sent')).catch(() => null)
  return stats?.mtimeMs ?? 0
}

export async function markSent(stateDir: string): Promise<void> {
  await mkdir(stateDir, { recursive: true })
    .then(() => writeFile(join(stateDir, 'telemetry-sent'), '', 'utf8'))
    .catch(() => undefined)
}

export async function decideConsent(options: ConsentOptions): Promise<ConsentDecision> {
  const off = telemetryDisabled(options.env)
  if (off !== null) return { send: false, why: off }
  if ((options.env['SLOP_GATE_TELEMETRY_URL'] ?? '') === '') return { send: false, why: 'no-endpoint' }

  const now = options.now ?? Date.now()
  const previous = await lastSentAt(options.stateDir)
  if (now - previous < MIN_INTERVAL_MS) return { send: false, why: 'too-soon' }

  return { send: true, project: await projectId(options.stateDir), firstRun: previous === 0 }
}

export const FIRST_RUN_NOTICE = [
  'slop-gate reports anonymous usage data — rule identifiers and counts, no code, no paths, no',
  'messages, no configuration. It exists to find rules that are wrong, so they can be fixed.',
  '',
  '  See exactly what would be sent:  sgate telemetry',
  '  Turn it off:                     SLOP_GATE_TELEMETRY=0  (or DO_NOT_TRACK=1)',
].join('\n')
