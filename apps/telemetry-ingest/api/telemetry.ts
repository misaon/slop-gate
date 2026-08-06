import { validateTelemetryPayload } from '@misaon/slop-gate-core'
import { neon } from '@neondatabase/serverless'

// The endpoint is public and every defence here follows from that: docs/telemetry.md#endpoint-defences.
const MAX_BYTES = 64 * 1024

let cached: ReturnType<typeof neon> | null = null

// Resolved on first use, not at module scope: a missing variable should fail one request, not the import.
function connection() {
  if (cached !== null) return cached
  const url = process.env['TELEMETRY_INGEST_URL']
  if (url === undefined || url === '') {
    throw new Error('TELEMETRY_INGEST_URL is not set; refusing to fall back to a broader role')
  }
  cached = neon(url)
  return cached
}

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.startsWith('application/json')) return new Response('unsupported', { status: 415 })

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) return new Response('too large', { status: 413 })

  const body = await request.text().catch(() => null)
  // Checked again after reading: `content-length` is the sender's claim, not a fact.
  if (body === null || body.length > MAX_BYTES) return new Response('too large', { status: 413 })

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Response('malformed', { status: 400 })
  }

  const validated = validateTelemetryPayload(parsed)
  if (!validated.ok) return new Response('rejected', { status: 400 })
  const payload = validated.payload

  try {
    const sql = connection()
    await sql.transaction([
      sql`
        insert into telemetry_report (
          run, project, slop_gate, node, platform, ci,
          duration_ms, files_scanned, files_analysed, preset, baseline, disabled_concepts
        ) values (
          ${payload.run}, ${payload.project}, ${payload.slopGate}, ${payload.node}, ${payload.platform},
          ${payload.ci}, ${payload.durationMs}, ${payload.filesScanned}, ${payload.filesAnalysed},
          ${payload.preset}, ${payload.baseline}, ${payload.disabledConcepts}
        )
        -- No conflict target on purpose: naming one makes Postgres look the row up, which needs
        -- SELECT, and the whole point of this role is that it cannot read. Untargeted DO NOTHING
        -- gets the same idempotency on INSERT alone, verified against the live database.
        on conflict do nothing
      `,
      sql`
        insert into telemetry_rule (run, rule, findings, suppressed, baselined, generated)
        select ${payload.run}, *
        from unnest(
          ${payload.rules.map((rule) => rule.rule)}::text[],
          ${payload.rules.map((rule) => rule.findings)}::int[],
          ${payload.rules.map((rule) => rule.suppressed)}::int[],
          ${payload.rules.map((rule) => rule.baselined)}::int[],
          ${payload.rules.map((rule) => rule.generated)}::int[]
        )
        on conflict do nothing
      `,
    ])
  } catch {
    // Whether the database is reachable is not the caller's business.
    return new Response('unavailable', { status: 503 })
  }

  return new Response(null, { status: 204 })
}
