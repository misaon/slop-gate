import type { TelemetryPanel } from '../data.ts'
import { Tile } from './chrome.tsx'
import { ICON_SMALL, Languages, Target, TriangleAlert } from './icons.tsx'
import { BookTextAnimated, GaugeAnimated, ShieldCheckAnimated } from './animated/icons.tsx'

const HEAD = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-500'

function Bars({ rows, label }: { rows: readonly { readonly key: string; readonly reports: number }[]; label: string }) {
  const largest = Math.max(1, ...rows.map((row) => row.reports))
  return (
    <div>
      <div class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-500">
        <Languages {...ICON_SMALL} />
        {label}
      </div>
      <div class="mt-2 space-y-1.5">
        {rows.length === 0 ? <div class="text-sm text-ink-700">—</div> : null}
        {rows.map((row) => (
          <div key={row.key} class="flex items-center gap-2 text-sm">
            <span class="mono w-24 shrink-0 truncate text-ink-300">{row.key}</span>
            <span class="h-2 rounded-full bg-brand/70" style={{ width: `${(row.reports / largest) * 100}%`, minWidth: '2px' }} />
            <span class="tabular-nums text-ink-500">{row.reports}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Every number here is a count from `telemetry_report` and the two summary views, read live. None is a rate
 * or a projection, and the sample size sits at the top rather than in a footnote — 28 reports is not a
 * population, and a panel that renders percentages off it would be inventing confidence it does not have.
 */
export function Telemetry({ data }: { data: TelemetryPanel }) {
  if (!data.available) {
    return (
      <section class="mb-6 rounded-xl bg-ink-900 p-4 ring-1 ring-ink-800">
        <div class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-state-withheld">
          <TriangleAlert {...ICON_SMALL} />
          Telemetry unavailable
        </div>
        <p class="mt-2 text-sm text-ink-300">{data.reason}</p>
      </section>
    )
  }

  const window =
    data.firstSeen === null || data.lastSeen === null
      ? '—'
      : `${new Date(data.firstSeen).toLocaleString()} → ${new Date(data.lastSeen).toLocaleString()}`

  return (
    <section class="mb-6">
      <h2 class="text-lg font-medium text-ink-100">Telemetry</h2>
      <p class="mt-1 max-w-3xl text-sm text-ink-500">
        Live from the ingest database, read under a SELECT-only role. Counts only — no rates, no projections.{' '}
        <span class="text-ink-300">
          {data.fromOurCi} of {data.reports} reports are this project&rsquo;s own CI runs
        </span>
        , so read every figure below as a sample of {data.reports}, not as usage.
      </p>

      <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={BookTextAnimated} label="Reports" value={data.reports} />
        <Tile icon={ShieldCheckAnimated} label="Distinct checkouts" value={data.projects} delay={60} />
        <Tile
          icon={BookTextAnimated}
          label="Median files scanned"
          value={data.runs === null ? '—' : data.runs.medianFilesScanned}
          delay={120}
        />
        <Tile
          icon={GaugeAnimated}
          label="Median run"
          value={data.runs === null ? '—' : `${data.runs.medianDurationMs} ms`}
          delay={180}
        />
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <Bars label="Platform" rows={data.platforms.map((row) => ({ key: row.platform, reports: row.reports }))} />
        <Bars label="slop-gate version" rows={data.versions.map((row) => ({ key: row.version, reports: row.reports }))} />
        <Bars label="Node major" rows={data.nodeMajors.map((row) => ({ key: row.node, reports: row.reports }))} />
      </div>

      <div class="mt-5 overflow-x-auto rounded-xl ring-1 ring-ink-800">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th class={HEAD}>Rule</th>
              <th class={HEAD}>Checkouts</th>
              <th class={HEAD}>Of those, finding</th>
              <th class={HEAD}>Findings</th>
              <th class={HEAD}>Suppressed</th>
              <th class={HEAD}>Baselined</th>
              <th class={HEAD}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {data.rules.map((rule) => (
              <tr key={rule.rule} class="border-t border-ink-850">
                <td class="mono px-3 py-2 text-ink-100">{rule.rule}</td>
                <td class="px-3 py-2 tabular-nums text-ink-300">{rule.checkouts}</td>
                <td class="px-3 py-2 tabular-nums text-ink-300">{rule.checkoutsFinding}</td>
                <td class="px-3 py-2 tabular-nums text-ink-300">{rule.findings}</td>
                {/* A rule with suppressions and no findings is the interesting case: it fires, and people say no. */}
                <td class="px-3 py-2 tabular-nums text-state-withheld">{rule.suppressed}</td>
                <td class="px-3 py-2 tabular-nums text-ink-300">{rule.baselined}</td>
                <td class="px-3 py-2 text-ink-500">{rule.lastSeen === null ? '—' : new Date(rule.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rules.length === 0 ? (
          <div class="px-4 py-8 text-center text-ink-500">No rule has reported a finding or a suppression yet.</div>
        ) : null}
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <Bars
          label="Concepts turned off in a config"
          rows={data.disabledConcepts.map((row) => ({ key: row.concept, reports: row.checkouts }))}
        />
        <div>
          <div class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-500">
            <Target {...ICON_SMALL} />
            Window
          </div>
          <div class="mt-2 text-sm text-ink-300">{window}</div>
        </div>
      </div>
    </section>
  )
}
