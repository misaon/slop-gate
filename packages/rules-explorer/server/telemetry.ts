import { neon } from '@neondatabase/serverless'
import { Kysely, sql } from 'kysely'
import { NeonDialect } from 'kysely-neon'

export type TelemetryPanel = {
  readonly available: boolean
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
  readonly overTime: readonly { readonly hour: string; readonly reports: number; readonly ours: number }[]
}

/**
 * The two tables and two views of `apps/telemetry-ingest/migrations`. `count` and `sum` are `bigint`,
 * which the driver hands back as a string rather than a number, so every read of the summary views
 * below casts to `int` — that cast is what makes the declared `number` true.
 */
type Telemetry = {
  telemetry_report: {
    run: string
    ingested_at: Date
    project: string | null
    slop_gate: string
    node: string
    platform: string
    ci: boolean
    duration_ms: number
    files_scanned: number
    files_analysed: number
    preset: string | null
    baseline: boolean
    disabled_concepts: string[]
  }
  telemetry_rule_summary: {
    rule: string
    checkouts: string
    checkouts_suppressing: string
    checkouts_finding: string
    findings: string
    suppressed: string
    baselined: string
    first_seen: Date | null
    last_seen: Date | null
  }
  telemetry_disabled_summary: {
    concept: string
    checkouts: string
  }
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

const count = sql<number>`count(*)::int`

const stamp = (at: Date | null | undefined): string | null => at?.toISOString() ?? null

/**
 * Read under the `telemetry_read` role, which holds `SELECT` on two tables and two views and nothing
 * else. The owner connection string is deliberately not accepted: an internal page has no business
 * holding a credential that can drop a table.
 */
export function openTelemetry(): { read(): Promise<TelemetryPanel> } {
  const url = process.env['TELEMETRY_READ_URL']
  let db: Kysely<Telemetry> | null = null

  return {
    async read() {
      if (url === undefined || url === '') {
        return EMPTY('TELEMETRY_READ_URL is not set, so this page has no read credential and is showing nothing rather than guessing.')
      }
      db ??= new Kysely<Telemetry>({ dialect: new NeonDialect({ neon: neon(url) }) })

      try {
        const totals = await db
          .selectFrom('telemetry_report')
          .select((eb) => [
            count.as('reports'),
            sql<number>`count(distinct ${eb.ref('project')})::int`.as('projects'),
            sql<number>`count(*) filter (where ${eb.ref('ci')})::int`.as('fromCi'),
            eb.fn.min('ingested_at').as('firstSeen'),
            eb.fn.max('ingested_at').as('lastSeen'),
          ])
          .executeTakeFirst()

        const medians = await db
          .selectFrom('telemetry_report')
          .select([
            sql<number | null>`percentile_cont(0.5) within group (order by files_scanned)::int`.as('files'),
            sql<number | null>`percentile_cont(0.5) within group (order by duration_ms)::int`.as('duration'),
          ])
          .executeTakeFirst()

        const platforms = await db
          .selectFrom('telemetry_report')
          .select(['platform', count.as('reports')])
          .groupBy('platform')
          .orderBy('reports', 'desc')
          .orderBy('platform')
          .execute()

        const versions = await db
          .selectFrom('telemetry_report')
          .select(['slop_gate as version', count.as('reports')])
          .groupBy('slop_gate')
          .orderBy('reports', 'desc')
          .orderBy('version')
          .execute()

        const nodes = await db
          .selectFrom('telemetry_report')
          .select(['node', count.as('reports')])
          .groupBy('node')
          .orderBy('reports', 'desc')
          .orderBy('node')
          .execute()

        const rules = await db
          .selectFrom('telemetry_rule_summary')
          .select((eb) => [
            'rule',
            'last_seen',
            sql<number>`${eb.ref('checkouts')}::int`.as('checkouts'),
            sql<number>`${eb.ref('checkouts_finding')}::int`.as('checkoutsFinding'),
            sql<number>`${eb.ref('findings')}::int`.as('findings'),
            sql<number>`${eb.ref('suppressed')}::int`.as('suppressed'),
            sql<number>`${eb.ref('baselined')}::int`.as('baselined'),
          ])
          .orderBy('findings', 'desc')
          .orderBy('checkouts', 'desc')
          .orderBy('rule')
          .execute()

        const disabled = await db
          .selectFrom('telemetry_disabled_summary')
          .select((eb) => ['concept', sql<number>`${eb.ref('checkouts')}::int`.as('checkouts')])
          .orderBy('checkouts', 'desc')
          .orderBy('concept')
          .execute()

        // `generate_series` zero-fills the gaps: a series drawn only from the hours that exist invents
        // activity in the ones that do not.
        const overTime = await sql<{ hour: string; reports: number; ours: number }>`
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
          order by h`.execute(db)

        return {
          available: true,
          reports: totals?.reports ?? 0,
          projects: totals?.projects ?? 0,
          fromOurCi: totals?.fromCi ?? 0,
          firstSeen: stamp(totals?.firstSeen),
          lastSeen: stamp(totals?.lastSeen),
          platforms,
          versions,
          nodeMajors: nodes,
          runs:
            medians?.files === null || medians?.files === undefined || medians.duration === null
              ? null
              : { medianFilesScanned: medians.files, medianDurationMs: medians.duration },
          rules: rules.map(({ last_seen, ...rest }) => ({ ...rest, lastSeen: stamp(last_seen) })),
          disabledConcepts: disabled,
          overTime: overTime.rows,
        }
      } catch (error) {
        return EMPTY(`the database refused the read: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}
