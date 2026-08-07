import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { buildTelemetryPayload, runCheck, type TelemetryPayload } from '@misaon/slop-gate-core'
import { decideConsent, telemetryDisabled } from '../telemetry/consent.ts'
import { DEFAULT_CONFIG, loadCliConfig } from '../config.ts'
import { defaultEngines } from '../engine-registry.ts'
import { EXIT_CODES } from '../exit-codes.ts'
import { readCliVersion } from '../version.ts'

const WHY: Readonly<Record<string, string>> = {
  disabled: 'off — `SLOP_GATE_TELEMETRY` is set to a falsey value',
  'do-not-track': 'off — `DO_NOT_TRACK` is set',
  'too-soon': 'on — nothing would be sent right now; at most one report an hour per checkout',
  'no-endpoint': 'off — `SLOP_GATE_TELEMETRY_URL` is set to an empty value, which means nowhere',
}

// Prints the document itself: a tool arguing its output can be trusted must not ask to be believed here.
export const telemetry = defineCommand({
  meta: { name: 'telemetry', description: 'Show exactly what a run would report, and whether it would' },
  args: {
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd === undefined ? process.cwd() : resolve(args.cwd)
    const stateDir = join(rootDir, '.slop-gate')

    const off = telemetryDisabled(process.env)
    const decision = await decideConsent({ env: process.env, stateDir })
    const status = off !== null ? WHY[off] : (WHY[decision.send ? 'on' : (decision.why as string)] ?? 'on')

    process.stdout.write(`status: ${decision.send ? 'on — a run right now would send the document below' : status}\n`)
    process.stdout.write('contents: rule identifiers and counts. No code, paths, messages or configuration.\n')
    process.stdout.write('turn off: SLOP_GATE_TELEMETRY=0, or DO_NOT_TRACK=1\n\n')

    const loaded = await loadCliConfig(rootDir, DEFAULT_CONFIG)
    if (loaded.kind === 'error') {
      process.stderr.write(`${loaded.message}\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const result = await runCheck({
      rootDir,
      config: loaded.config,
      ...(loaded.kind === 'loaded' ? { configFile: loaded.configFile } : {}),
      engines: defaultEngines(rootDir, loaded.kind === 'loaded' ? loaded.configFile : undefined, loaded.config.ignore),
      startedAt: 0,
    })

    const payload: TelemetryPayload = buildTelemetryPayload(result, {
      run: '00000000-0000-4000-8000-000000000000',
      project: decision.send ? decision.project : null,
      slopGate: readCliVersion(),
      nodeVersion: process.version,
      platform: process.platform,
      ci: process.env['CI'] !== undefined,
      preset: loaded.config.extends?.[0] ?? null,
      disabledConcepts: Object.entries(loaded.config.rules ?? {})
        .filter(([, setting]) => (Array.isArray(setting) ? setting[0] : setting) === 'off')
        .map(([concept]) => concept),
    })

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    process.stdout.write('\nThe `run` id above is a placeholder; a real send uses a fresh random one.\n')
  },
})
