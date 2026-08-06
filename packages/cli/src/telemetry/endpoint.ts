/**
 * Where reports go when nobody says otherwise. Baked in rather than configured: an endpoint a user
 * has to set is an endpoint nobody sets, and the switch that matters to them is off, not where-to.
 *
 * The host is a custom domain, not the project's `.vercel.app` name, for two reasons — the platform
 * URL is behind deployment protection, and this address is published in an npm package, so it has to
 * survive changing where the thing is hosted.
 */
export const DEFAULT_TELEMETRY_ENDPOINT = 'https://slop-gate-telemetry.ondrejmisak.cz/api/telemetry'

/**
 * An explicitly empty `SLOP_GATE_TELEMETRY_URL` means nowhere. That is a third state, distinct from
 * both the default and a custom address, and it is what a test or an air-gapped build sets when it
 * wants the rest of the machinery to run and the send not to happen.
 */
export function telemetryEndpoint(env: Readonly<Record<string, string | undefined>>): string | null {
  const configured = env['SLOP_GATE_TELEMETRY_URL']
  if (configured === undefined) return DEFAULT_TELEMETRY_ENDPOINT
  return configured === '' ? null : configured
}
