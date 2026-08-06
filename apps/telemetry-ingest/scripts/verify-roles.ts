import { neon } from '@neondatabase/serverless'

// The security argument for a public endpoint is a claim about `GRANT`s, so it is tested rather than
// read. Run after any migration that adds a table. Never print a connection string: that is how a
// password reaches a log.
type Probe = { readonly label: string; readonly sql: string; readonly expect: 'allowed' | 'denied' }

const OWNER = process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL']
const INGEST = process.env['TELEMETRY_INGEST_URL']
const READ = process.env['TELEMETRY_READ_URL']

if (OWNER === undefined || INGEST === undefined || READ === undefined) {
  process.stderr.write('Set DATABASE_URL_UNPOOLED, TELEMETRY_INGEST_URL and TELEMETRY_READ_URL.\n')
  process.exit(1)
}

const RUN = '11111111-2222-4333-8444-555555555555'

const INSERT_REPORT =
  `insert into telemetry_report (run, project, slop_gate, node, platform, ci, duration_ms,` +
  ` files_scanned, files_analysed, preset, baseline, disabled_concepts)` +
  ` values ('${RUN}', null, '0.0.0', '24', 'linux', false, 1, 1, 1, 'recommended', false, '{}')` +
  ` on conflict do nothing`

const INGEST_PROBES: readonly Probe[] = [
  { label: 'insert report', sql: INSERT_REPORT, expect: 'allowed' },
  { label: 'select', sql: 'select count(*) from telemetry_report', expect: 'denied' },
  { label: 'update', sql: 'update telemetry_report set ci = true', expect: 'denied' },
  { label: 'delete', sql: 'delete from telemetry_report', expect: 'denied' },
  { label: 'read the summary view', sql: 'select * from telemetry_rule_summary', expect: 'denied' },
  { label: 'create a table', sql: 'create table probe_should_fail (x int)', expect: 'denied' },
]

const READ_PROBES: readonly Probe[] = [
  { label: 'select', sql: 'select count(*) from telemetry_report', expect: 'allowed' },
  { label: 'read the summary view', sql: 'select * from telemetry_rule_summary', expect: 'allowed' },
  { label: 'insert', sql: INSERT_REPORT, expect: 'denied' },
  { label: 'delete', sql: 'delete from telemetry_report', expect: 'denied' },
]

async function run(url: string, who: string, probes: readonly Probe[]): Promise<number> {
  const sql = neon(url)
  let wrong = 0
  process.stdout.write(`\n${who}\n`)

  for (const probe of probes) {
    // "Denied" has to mean denied. Treating every error as a denial once hid a working GRANT behind
    // a broken statement, and sent the investigation after the permissions instead of the SQL.
    const outcome = await sql
      .query(probe.sql)
      .then(() => 'allowed' as const)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        return /permission denied|must be owner/i.test(message) ? ('denied' as const) : `error: ${message.slice(0, 60)}`
      })

    const ok = outcome === probe.expect
    if (!ok) wrong += 1
    process.stdout.write(`  ${ok ? 'ok  ' : 'WRONG'}  ${probe.label.padEnd(22)} ${outcome}\n`)
  }
  return wrong
}

const wrong = (await run(INGEST, 'telemetry_ingest — may insert, nothing else', INGEST_PROBES))
  + (await run(READ, 'telemetry_read — may select, nothing else', READ_PROBES))

await neon(OWNER).query('delete from telemetry_report where run = $1', [RUN])

process.stdout.write(wrong === 0 ? '\nboth roles are exactly as narrow as intended\n' : `\n${wrong} probes went the wrong way\n`)
process.exit(wrong === 0 ? 0 : 1)
