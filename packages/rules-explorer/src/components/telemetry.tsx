import type { TelemetryPanel } from '../data.ts'
import { Gauge, GitCommitHorizontal, ICON_SMALL, Languages, Target, TriangleAlert, Wrench } from './icons.tsx'
import { Card, Figure, Ranked, Timeline } from './widgets.tsx'

const HEAD = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-widest text-ink-500'
const NUM = 'px-3 py-2 text-right tabular-nums'

const stamp = (iso: string | null): string => (iso === null ? '—' : new Date(iso).toLocaleString())

/**
 * Counts, never rates. The sample is small enough that a percentage would be inventing confidence, so the
 * headline says how small it is and how much of it is this project's own CI before any number is shown.
 */
export function Telemetry({ data }: { data: TelemetryPanel }) {
  if (!data.available) {
    return (
      <Card icon={TriangleAlert} label="Telemetry unavailable">
        <p class="text-sm text-ink-300">{data.reason}</p>
      </Card>
    )
  }

  const outside = data.reports - data.fromOurCi
  const refused = data.rules.reduce((total, rule) => total + rule.suppressed, 0)
  const single = data.versions.length === 1 ? data.versions[0]?.version : null
  const onlyNode = data.nodeMajors.length === 1 ? data.nodeMajors[0]?.node : null

  return (
    <div class="space-y-5">
      <div class="motion-safe:rise rounded-2xl bg-brand/8 px-5 py-4 ring-1 ring-brand/25">
        <p class="text-sm leading-relaxed text-ink-300">
          Everything here is a live count from the ingest database — no rates, no estimates. The sample is{' '}
          <span class="font-semibold text-ink-100">{data.reports} reports</span> from{' '}
          <span class="font-semibold text-ink-100">{data.projects} checkouts</span>, and{' '}
          <span class="font-semibold text-brand">{data.fromOurCi} of them are this project&rsquo;s own CI</span> — only{' '}
          {outside} came from anywhere else. Read the numbers as counts, not as usage.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card icon={Target} label="Reports" hint="all time">
          <Figure value={data.reports} caption={`${data.projects} distinct checkouts`} />
        </Card>
        <Card icon={GitCommitHorizontal} label="From elsewhere" hint="not our CI" delay={80}>
          <Figure value={outside} caption={`of ${data.reports} reports`} />
        </Card>
        <Card icon={Languages} label="Median files" hint="per run" delay={160}>
          <Figure value={data.runs === null ? '—' : data.runs.medianFilesScanned} caption="files scanned" />
        </Card>
        <Card icon={Gauge} label="Median run" hint="wall clock" delay={240}>
          <Figure
            value={data.runs === null ? '—' : (data.runs.medianDurationMs / 1000).toFixed(1)}
            unit={data.runs === null ? undefined : 's'}
            caption={data.runs === null ? undefined : `${data.runs.medianDurationMs} ms`}
          />
        </Card>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <Card icon={Target} label="Reports per hour" hint={`${data.overTime.length} h window`} wide delay={80}>
          <Timeline buckets={data.overTime} />
        </Card>
        <Card icon={Languages} label="Platform" delay={160}>
          <Ranked rows={data.platforms.map((row) => ({ key: row.platform, value: row.reports }))} total={data.reports} />
        </Card>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <Card icon={Wrench} label="Build" delay={80}>
          {/* A single value is a fact. A one-bar chart would say less than this sentence does. */}
          <dl class="space-y-2 text-sm">
            <div class="flex items-baseline justify-between gap-3">
              <dt class="text-ink-500">slop-gate</dt>
              <dd class="mono text-ink-100">{single ?? `${data.versions.length} versions`}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="text-ink-500">Node</dt>
              <dd class="mono text-ink-100">{onlyNode ?? `${data.nodeMajors.length} majors`}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="text-ink-500">Window</dt>
              <dd class="text-right text-xs text-ink-300">
                {stamp(data.firstSeen)}
                <br />
                {stamp(data.lastSeen)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card icon={TriangleAlert} label="Refused by a human" hint="inline directives" delay={160}>
          <Figure value={refused} caption="findings a reader told the tool to drop" />
        </Card>

        <Card icon={Wrench} label="Concepts turned off" delay={240}>
          {data.disabledConcepts.length === 0 ? (
            <p class="text-sm text-ink-500">No report has turned a concept off in its config.</p>
          ) : (
            <Ranked rows={data.disabledConcepts.map((row) => ({ key: row.concept, value: row.checkouts }))} total={data.reports} />
          )}
        </Card>
      </div>

      <Card icon={Gauge} label="What the rules did out there" hint={`${data.rules.length} reported`} delay={80}>
        <div class="-mx-2 overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th class={HEAD}>Rule</th>
                <th class={`${HEAD} text-right`} title="Checkouts that ran this rule at all">Ran in</th>
                <th class={`${HEAD} text-right`} title="Of those, how many saw at least one finding">Found</th>
                <th class={`${HEAD} text-right`}>Findings</th>
                <th class={`${HEAD} text-right`} title="A human wrote an inline directive to refuse it">Refused</th>
                <th class={`${HEAD} text-right`}>Baselined</th>
                <th class={HEAD}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr key={rule.rule} class="border-t border-ink-850 transition-colors hover:bg-ink-850/50">
                  <td class="mono px-3 py-2 text-ink-100">{rule.rule}</td>
                  <td class={`${NUM} text-ink-300`}>{rule.checkouts}</td>
                  <td class={`${NUM} text-ink-300`}>{rule.checkoutsFinding}</td>
                  <td class={`${NUM} text-ink-300`}>{rule.findings}</td>
                  {/* Refusals with no findings is the signal: the rule fires and a human says no every time. */}
                  <td class={`${NUM} ${rule.suppressed > 0 ? 'font-semibold text-state-withheld' : 'text-ink-700'}`}>
                    {rule.suppressed}
                  </td>
                  <td class={`${NUM} text-ink-300`}>{rule.baselined}</td>
                  <td class="px-3 py-2 text-ink-500">{stamp(rule.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rules.length === 0 ? (
            <div class="py-8 text-center text-sm text-ink-500">
              <TriangleAlert {...ICON_SMALL} class="mx-auto mb-2 text-ink-700" />
              No rule has reported a finding or a refusal yet.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
