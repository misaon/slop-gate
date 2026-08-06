// A custom domain, not the project's `.vercel.app` name: that one is behind deployment protection, and
// this address ships inside an npm package, so it has to outlive where the thing is hosted.
export const DEFAULT_TELEMETRY_ENDPOINT = 'https://slop-gate-telemetry.ondrejmisak.cz/api/telemetry'

// An explicitly empty `SLOP_GATE_TELEMETRY_URL` is a third state: run everything, send nothing.
export function telemetryEndpoint(env: Readonly<Record<string, string | undefined>>): string | null {
  const configured = env['SLOP_GATE_TELEMETRY_URL']
  if (configured === undefined) return DEFAULT_TELEMETRY_ENDPOINT
  return configured === '' ? null : configured
}
