import { validateTelemetryPayload } from '@misaon/slop-gate-core'
import { neon } from '@neondatabase/serverless'

/**
 * Receives one anonymous report.
 *
 * The endpoint is public because anonymous senders cannot be authenticated and a secret shipped in an
 * npm package is a published secret. So the defences here are the ones that survive that:
 *
 * - a hard body cap, before anything is parsed;
 * - `validateTelemetryPayload`, which refuses anything a real run could not have produced — including
 *   any rule or concept id not in slop-gate's own registry;
 * - a role that can `INSERT` into two tables and do nothing else, so a total compromise of this
 *   function reads nothing and destroys nothing;
 * - per-IP rate limiting, which lives in the Vercel firewall rather than here, because a limiter that
 *   runs after the function has already been invoked has not saved anything.
 *
 * Responses are deliberately terse. A validator that explains precisely why it refused is one that
 * teaches an attacker how to pass.
 */
const MAX_BYTES = 64 * 1024

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const

function connection() {
  const url = process.env['TELEMETRY_INGEST_URL']
  if (url === undefined || url === '') {
    throw new Error('TELEMETRY_INGEST_URL is not set; refusing to fall back to a broader role')
  }
  return neon(url)
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) return new Response('too large', { status: 413, headers: CORS })

  const body = await request.text().catch(() => null)
  // Checked again after reading: `content-length` is the sender's claim, not a fact.
  if (body === null || body.length > MAX_BYTES) return new Response('too large', { status: 413, headers: CORS })

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Response('malformed', { status: 400, headers: CORS })
  }

  const validated = validateTelemetryPayload(parsed)
  if (!validated.ok) return new Response('rejected', { status: 400, headers: CORS })
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
    // The sender swallows every error by design, so nothing here reaches a user. Say as little as
    // possible: whether the database is reachable is not the caller's business.
    return new Response('unavailable', { status: 503, headers: CORS })
  }

  return new Response(null, { status: 204, headers: CORS })
}
