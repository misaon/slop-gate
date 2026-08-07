import type { TelemetryPanel } from '../data.ts'
import { ICON_SMALL, Gauge, Languages, Target, TriangleAlert } from './icons.tsx'

const HEAD = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-500'
const NUM = 'px-3 py-2 text-right tabular-nums'

function Section({ icon: Icon, label, children }: { icon: typeof Target; label: string; children: preact.ComponentChildren }) {
  return (
    <div>
      <div class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-500">
        <Icon {...ICON_SMALL} />
        {label}
      </div>
      {children}
    </div>
  )
}

/**
 * One hue for every bar, and the category named in text beside it. Not a stylistic choice: the palette's two
 * warm steps fail an adjacent-pair check at ΔE 11.9 for normal vision, so a reader could not tell two series
 * apart, and this comparison is one measure across categories — a magnitude, which takes a single hue anyway.
 * The count is labelled on every bar because there are three of them; that is direct labelling, not clutter.
 */
function Distribution({ rows, total }: { rows: readonly { readonly key: string; readonly reports: number }[]; total: number }) {
  const largest = Math.max(1, ...rows.map((row) => row.reports))
  return (
    <div class="mt-2 space-y-2">
      {rows.map((row) => (
        <div key={row.key} class="flex items-center gap-3 text-sm" title={`${row.key}: ${row.reports} of ${total} reports`}>
          <span class="mono w-20 shrink-0 truncate text-ink-300">{row.key}</span>
          <span class="flex h-2.5 min-w-0 flex-1 items-center">
            <span class="h-full rounded-r bg-brand" style={{ width: `${(row.reports / largest) * 100}%`, minWidth: '3px' }} />
          </span>
          <span class="w-8 shrink-0 text-right tabular-nums text-ink-100">{row.reports}</span>
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string | undefined }) {
  return (
    <div class="rounded-xl bg-ink-900 px-4 py-3 ring-1 ring-ink-800" title={hint}>
      <div class="text-2xl font-medium tabular-nums text-ink-100">{value}</div>
      <div class="mt-0.5 text-xs uppercase tracking-wide text-ink-500">{label}</div>
    </div>
  )
}

const stamp = (iso: string | null): string => (iso === null ? '—' : new Date(iso).toLocaleString())

/**
 * Counts, never rates. Twenty-eight reports is not a population, so the sample size and how much of it is
 * this project's own CI lead the panel instead of sitting in a footnote — a percentage taken from it would be
 * inventing confidence the data does not carry.
 */
export function Telemetry({ data }: { data: TelemetryPanel }) {
  if (!data.available) {
    return (
      <section class="mb-8 rounded-xl bg-ink-900 p-4 ring-1 ring-ink-800">
        <div class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-state-withheld">
          <TriangleAlert {...ICON_SMALL} />
          Telemetry unavailable
        </div>
        <p class="mt-2 text-sm text-ink-300">{data.reason}</p>
      </section>
    )
  }

  const ours = data.fromOurCi
  const outside = data.reports - ours
  const single = data.versions.length === 1 ? data.versions[0] : undefined
  const onlyNode = data.nodeMajors.length === 1 ? data.nodeMajors[0] : undefined

  return (
    <section class="mb-8">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-medium text-ink-100">Telemetry</h2>
        <span class="text-xs text-ink-700">{stamp(data.firstSeen)} → {stamp(data.lastSeen)}</span>
      </div>

      {/* The caveat is the headline, not an aside: most of this sample is us. */}
      <div class="mt-2 rounded-xl bg-brand/8 px-4 py-3 ring-1 ring-brand/25">
        <p class="text-sm text-ink-300">
          <span class="font-medium text-ink-100">{data.reports} reports</span> from{' '}
          <span class="font-medium text-ink-100">{data.projects} checkouts</span>, of which{' '}
          <span class="font-medium text-brand">{ours} are this project&rsquo;s own CI</span> and {outside} are not. Read
          everything below as counts out of {data.reports} — there is not enough here for a rate, so none is shown.
        </p>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Reports" value={data.reports} hint="Rows in telemetry_report" />
        <Stat label="Checkouts" value={data.projects} hint="Distinct project ids. CI runners are ephemeral, so each CI run is its own." />
        <Stat
          label="Median files"
          value={data.runs === null ? '—' : data.runs.medianFilesScanned}
          hint="Median files_scanned across all reports"
        />
        <Stat
          label="Median run"
          value={data.runs === null ? '—' : `${(data.runs.medianDurationMs / 1000).toFixed(1)} s`}
          hint={data.runs === null ? undefined : `${data.runs.medianDurationMs} ms`}
        />
      </div>

      <div class="mt-5 grid gap-5 md:grid-cols-2">
        <Section icon={Languages} label="Platform">
          <Distribution rows={data.platforms.map((row) => ({ key: row.platform, reports: row.reports }))} total={data.reports} />
        </Section>

        {/* A single value is a fact, not a distribution — a one-bar chart says less than a sentence. */}
        <Section icon={Target} label="Build">
          <div class="mt-2 space-y-1.5 text-sm text-ink-300">
            <div>
              slop-gate{' '}
              {single === undefined ? (
                <Distribution rows={data.versions.map((row) => ({ key: row.version, reports: row.reports }))} total={data.reports} />
              ) : (
                <span class="mono text-ink-100">{single.version}</span>
              )}
              {single === undefined ? null : <span class="text-ink-500"> on every report</span>}
            </div>
            <div>
              Node{' '}
              {onlyNode === undefined ? (
                <Distribution rows={data.nodeMajors.map((row) => ({ key: row.node, reports: row.reports }))} total={data.reports} />
              ) : (
                <span class="mono text-ink-100">{onlyNode.node}</span>
              )}
              {onlyNode === undefined ? null : <span class="text-ink-500"> on every report</span>}
            </div>
            <div class="pt-1 text-ink-500">
              {data.disabledConcepts.length === 0
                ? 'No report has turned a concept off in its config.'
                : `${data.disabledConcepts.length} concept(s) turned off in a config — see the table below.`}
            </div>
          </div>
        </Section>
      </div>

      <Section icon={Gauge} label="What the rules did out there">
        <div class="mt-2 overflow-x-auto rounded-xl ring-1 ring-ink-800">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="bg-ink-900">
                <th class={HEAD}>Rule</th>
                <th class={`${HEAD} text-right`} title="Checkouts that ran this rule at all">
                  Ran in
                </th>
                <th class={`${HEAD} text-right`} title="Of those, how many saw at least one finding">
                  Found
                </th>
                <th class={`${HEAD} text-right`}>Findings</th>
                <th class={`${HEAD} text-right`} title="A human wrote an inline directive to refuse the finding">
                  Refused
                </th>
                <th class={`${HEAD} text-right`}>Baselined</th>
                <th class={HEAD}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr key={rule.rule} class="border-t border-ink-850 hover:bg-ink-900">
                  <td class="mono px-3 py-2 text-ink-100">{rule.rule}</td>
                  <td class={`${NUM} text-ink-300`}>{rule.checkouts}</td>
                  <td class={`${NUM} text-ink-300`}>{rule.checkoutsFinding}</td>
                  <td class={`${NUM} text-ink-300`}>{rule.findings}</td>
                  {/* Refusals with no findings is the signal this table exists for: the rule fires, a human says no. */}
                  <td class={`${NUM} ${rule.suppressed > 0 ? 'font-medium text-state-withheld' : 'text-ink-700'}`}>
                    {rule.suppressed}
                  </td>
                  <td class={`${NUM} text-ink-300`}>{rule.baselined}</td>
                  <td class="px-3 py-2 text-ink-500">{stamp(rule.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rules.length === 0 ? (
            <div class="px-4 py-8 text-center text-ink-500">No rule has reported a finding or a refusal yet.</div>
          ) : null}
        </div>
      </Section>
    </section>
  )
}
