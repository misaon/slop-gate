import { neon } from '@neondatabase/serverless'

export type TelemetryPanel = {
  readonly available: boolean
  /** Why the panel is empty, when it is. Shown rather than rendered as zeroes. */
  readonly reason?: string
  readonly reports: number
  readonly projects: number
  readonly fromOurCi: number
  readonly firstSeen: string | null
  readonly lastSeen: string | null
  readonly platforms: readonly { readonly platform: string; readonly reports: number }[]
  readonly versions: readonly { readonly version: string; readonly reports: number }[]
  readonly nodeMajors: readonly { readonly node: string; readonly reports: number }[]
  readonly runs: { readonly medianFilesScanned: number; readonly medianDurationMs: number } | null
  readonly rules: readonly {
    readonly rule: string
    readonly checkouts: number
    readonly checkoutsFinding: number
    readonly findings: number
    readonly suppressed: number
    readonly baselined: number
    readonly lastSeen: string | null
  }[]
  readonly disabledConcepts: readonly { readonly concept: string; readonly checkouts: number }[]
  /** One bucket per hour the window covers, zero-filled, so a quiet hour reads as a trough and not as absent. */
  readonly overTime: readonly { readonly hour: string; readonly reports: number; readonly ours: number }[]
}

const EMPTY = (reason: string): TelemetryPanel => ({
  available: false,
  reason,
  reports: 0,
  projects: 0,
  fromOurCi: 0,
  firstSeen: null,
  lastSeen: null,
  platforms: [],
  versions: [],
  nodeMajors: [],
  runs: null,
  rules: [],
  disabledConcepts: [],
  overTime: [],
})

/**
 * Read under the `telemetry_read` role, which holds `SELECT` on two tables and two views and nothing else —
 * verified by attempting an `INSERT` and a `DROP` and being refused both. The owner connection string is
 * deliberately not accepted here: an internal page has no business holding credentials that can drop a table.
 */
export function openTelemetry(): { read(): Promise<TelemetryPanel> } {
  const url = process.env['TELEMETRY_READ_URL']

  return {
    async read() {
      if (url === undefined || url === '') {
        return EMPTY('TELEMETRY_READ_URL is not set, so this page has no read credential and is showing nothing rather than guessing.')
      }
      const sql = neon(url)
      try {
        const [totals] = await sql`
          select count(*)::int as reports,
                 count(distinct project)::int as projects,
                 count(*) filter (where ci)::int as from_ci,
                 min(ingested_at) as first_seen,
                 max(ingested_at) as last_seen
          from telemetry_report`

        const [medians] = await sql`
          select percentile_cont(0.5) within group (order by files_scanned)::int as files,
                 percentile_cont(0.5) within group (order by duration_ms)::int as duration
          from telemetry_report`

        const platforms = await sql`select platform, count(*)::int as reports from telemetry_report group by platform order by reports desc, platform`
        const versions = await sql`select slop_gate as version, count(*)::int as reports from telemetry_report group by slop_gate order by reports desc, version`
        const nodes = await sql`select node, count(*)::int as reports from telemetry_report group by node order by reports desc, node`
        const rules = await sql`
          select rule, checkouts::int, checkouts_finding::int, findings::int, suppressed::int, baselined::int, last_seen
          from telemetry_rule_summary order by findings desc, checkouts desc, rule`
        const disabled = await sql`select concept, checkouts::int from telemetry_disabled_summary order by checkouts desc, concept`

        // `generate_series` zero-fills the gaps: an hour nobody reported has to be a visible trough, because a
        // series drawn only from the hours that exist invents activity in the ones that do not.
        const overTime = await sql`
          with bounds as (
            select date_trunc('hour', min(ingested_at)) as lo, date_trunc('hour', max(ingested_at)) as hi
            from telemetry_report
          )
          select to_char(h, 'YYYY-MM-DD HH24:MI') as hour,
                 count(r.run)::int as reports,
                 count(r.run) filter (where r.ci)::int as ours
          from bounds, generate_series(bounds.lo, bounds.hi, interval '1 hour') as h
          left join telemetry_report r on date_trunc('hour', r.ingested_at) = h
          group by h
          order by h`

        return {
          available: true,
          reports: totals?.['reports'] ?? 0,
          projects: totals?.['projects'] ?? 0,
          fromOurCi: totals?.['from_ci'] ?? 0,
          firstSeen: totals?.['first_seen'] ?? null,
          lastSeen: totals?.['last_seen'] ?? null,
          platforms: platforms.map((row) => ({ platform: String(row['platform']), reports: Number(row['reports']) })),
          versions: versions.map((row) => ({ version: String(row['version']), reports: Number(row['reports']) })),
          nodeMajors: nodes.map((row) => ({ node: String(row['node']), reports: Number(row['reports']) })),
          runs:
            medians?.['files'] === null || medians?.['files'] === undefined
              ? null
              : { medianFilesScanned: Number(medians['files']), medianDurationMs: Number(medians['duration']) },
          rules: rules.map((row) => ({
            rule: String(row['rule']),
            checkouts: Number(row['checkouts']),
            checkoutsFinding: Number(row['checkouts_finding']),
            findings: Number(row['findings']),
            suppressed: Number(row['suppressed']),
            baselined: Number(row['baselined']),
            lastSeen: (row['last_seen'] as string | null) ?? null,
          })),
          disabledConcepts: disabled.map((row) => ({ concept: String(row['concept']), checkouts: Number(row['checkouts']) })),
          overTime: overTime.map((row) => ({
            hour: String(row['hour']),
            reports: Number(row['reports']),
            ours: Number(row['ours']),
          })),
        }
      } catch (error) {
        return EMPTY(`the database refused the read: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}
