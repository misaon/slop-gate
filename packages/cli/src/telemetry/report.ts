import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { buildTelemetryPayload, type CheckResult, type SlopGateConfig } from '@misaon/slop-gate-core'
import { readCliVersion } from '../version.ts'
import { decideConsent, FIRST_RUN_NOTICE, markSent } from './consent.ts'
import { telemetryEndpoint } from './endpoint.ts'
import { sendTelemetry } from './send.ts'

type LoadedConfig = { readonly config: SlopGateConfig }

function disabledConcepts(config: SlopGateConfig): string[] {
  return Object.entries(config.rules ?? {})
    .filter(([, setting]) => (Array.isArray(setting) ? setting[0] : setting) === 'off')
    .map(([concept]) => concept)
}

// Never throws and never changes the exit code. Awaited rather than detached because a detached
// `fetch` keeps the event loop alive anyway, and this way the 2 s bound is visible.
export async function reportTelemetry(rootDir: string, loaded: LoadedConfig, result: CheckResult): Promise<void> {
  try {
    const stateDir = join(rootDir, '.slop-gate')
    const decision = await decideConsent({ env: process.env, stateDir })
    if (!decision.send) return

    if (decision.firstRun) process.stderr.write(`\n${FIRST_RUN_NOTICE}\n\n`)

    const endpoint = telemetryEndpoint(process.env)
    if (endpoint === null) return

    const payload = buildTelemetryPayload(result, {
      run: randomUUID(),
      project: decision.project,
      slopGate: readCliVersion(),
      nodeVersion: process.version,
      platform: process.platform,
      ci: process.env['CI'] !== undefined,
      preset: loaded.config.extends?.[0] ?? null,
      disabledConcepts: disabledConcepts(loaded.config),
    })

    await sendTelemetry(endpoint, payload)
    await markSent(stateDir)
  } catch {
    // Telemetry is best-effort by construction. There is nothing a user could do with an error here.
  }
}
