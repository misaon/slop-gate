import type { CatalogueStatus, Impact } from '@misaon/slop-gate-core'
import { useEffect, useMemo, useState } from 'preact/hooks'
import logo from '../../../docs/assets/logo-wide-darkmode-360.webp'
import { Tile, Toggle } from './components/chrome.tsx'
import {
  BanAnimated,
  BookTextAnimated,
  GaugeAnimated,
  HoverGroup,
  SearchAnimated,
  ShieldCheckAnimated,
} from './components/animated/icons.tsx'
import { ICON, Spinner, X } from './components/icons.tsx'
import { columns, RulesTable } from './components/rules-table.tsx'
import { Tabs } from './components/tabs.tsx'
import { Telemetry } from './components/telemetry.tsx'
import {
  fetchRules,
  fetchTelemetry,
  onCatalogueChange,
  STATUS_HELP,
  STATUS_LABEL,
  type Row,
  type RulesPayload,
  type TelemetryPanel,
} from './data.ts'
import { useTable } from './use-table.ts'

const STATUSES: readonly CatalogueStatus[] = ['recommended', 'withheld', 'unlisted']
const IMPACT_LEVELS: readonly Impact[] = [3, 2, 1]

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

export function App() {
  const [state, setState] = useState<{ rows: Row[]; payload: RulesPayload } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryPanel | null>(null)
  const [query, setQuery] = useState('')
  const [engines, setEngines] = useState<ReadonlySet<string>>(new Set())
  const [statuses, setStatuses] = useState<ReadonlySet<CatalogueStatus>>(new Set())
  const [impacts, setImpacts] = useState<ReadonlySet<Impact>>(new Set())

  useEffect(() => {
    const load = (): void => {
      void fetchRules().then(setState, (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      void fetchTelemetry().then(setTelemetry, () => setTelemetry(null))
    }
    load()
    return onCatalogueChange(load)
  }, [])

  const rows = state?.rows
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (rows ?? []).filter((row) => {
      if (engines.size > 0 && !engines.has(row.engine)) return false
      if (statuses.size > 0 && !statuses.has(row.status)) return false
      if (impacts.size > 0 && !impacts.has(row.impact)) return false
      if (needle === '') return true
      return (
        row.engineRuleId.toLowerCase().includes(needle) ||
        row.concept.toLowerCase().includes(needle) ||
        row.title.toLowerCase().includes(needle)
      )
    })
  }, [rows, query, engines, statuses, impacts])

  const table = useTable(filtered, columns)

  if (error !== null) {
    return <main class="mx-auto max-w-2xl p-10 text-severity-error">Could not load the catalogue: {error}</main>
  }
  if (state === null) {
    return (
      <main class="mx-auto max-w-2xl p-10">
        <Spinner label="Loading the catalogue…" />
      </main>
    )
  }

  const { summary, history, impacts: definitions } = state.payload

  return (
    <main class="mx-auto max-w-[1400px] px-6 py-8">
      <header class="mb-6">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="flex items-center gap-5">
            <img src={logo} alt="slop-gate" width={200} height={57} class="shrink-0" />
            <div class="border-l border-ink-800 pl-5">
              <h1 class="text-xl font-semibold tracking-tight text-ink-100">rules</h1>
              <p class="mt-1 text-sm text-ink-500">
                Every rule the registry knows about, whether a preset turns it on, and why not when it does not.
              </p>
            </div>
          </div>
          <div class="text-xs text-ink-500">
            {history.removed.length > 0 ? (
              <span class="mr-3 text-state-withheld">{history.removed.length} removed since first commit</span>
            ) : null}
            generated {new Date(state.payload.generatedAt).toLocaleString()}
          </div>
        </div>
        <div class="brand-rule mt-4 h-px w-full" />
      </header>

      <Tabs
        tabs={[
          { id: 'rules', label: 'Rules', count: summary.total },
          { id: 'telemetry', label: 'Telemetry', count: telemetry?.reports },
        ]}
      >
        {(active) =>
          active === 'rules' ? (
            <>
            <section class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile icon={BookTextAnimated} label="Rules known" value={summary.total} />
              <Tile
                icon={ShieldCheckAnimated}
                label="On in recommended"
                value={summary.byStatus.recommended}
                tone="text-state-on"
                delay={60}
              />
              <Tile
                icon={BanAnimated}
                label="Withheld, with a reason"
                value={summary.byStatus.withheld}
                tone="text-state-withheld"
                delay={120}
              />
              <Tile
                icon={GaugeAnimated}
                label="Reliability measured"
                value={`${summary.measured} of ${summary.total}`}
                tone="text-ink-300"
                delay={180}
              />
            </section>

            <section class="mb-4 space-y-3">
              <div class="group relative">
                <HoverGroup class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                  <SearchAnimated class="text-ink-500 transition-colors group-focus-within:text-brand" />
                </HoverGroup>
                <input
                  type="search"
                  value={query}
                  onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
                  placeholder="Filter by rule, concept or title…"
                  class="w-full rounded-lg bg-ink-900 py-2 pr-9 pl-9 text-sm text-ink-100 ring-1 ring-ink-800 outline-none placeholder:text-ink-500 focus:ring-brand/60"
                />
                {query === '' ? null : (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear the filter"
                    class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-500 transition-colors hover:bg-ink-850 hover:text-ink-100"
                  >
                    <X {...ICON} />
                  </button>
                )}
              </div>
              <div class="flex flex-wrap gap-2">
                {summary.byEngine.map((entry) => (
                  <Toggle
                    key={entry.engine}
                    active={engines.has(entry.engine)}
                    count={entry.total}
                    onClick={() => setEngines(toggled(engines, entry.engine))}
                  >
                    {entry.engine}
                  </Toggle>
                ))}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                {IMPACT_LEVELS.map((impact) => (
                  <span key={impact} title={definitions[impact].test}>
                    <Toggle
                      active={impacts.has(impact)}
                      count={summary.byImpact[impact]}
                      onClick={() => setImpacts(toggled(impacts, impact))}
                    >
                      {impact} · {definitions[impact].label}
                    </Toggle>
                  </span>
                ))}
                <span class="mx-1 h-5 w-px bg-ink-800" />
                {STATUSES.map((status) => (
                  <span key={status} title={STATUS_HELP[status]}>
                    <Toggle
                      active={statuses.has(status)}
                      count={summary.byStatus[status]}
                      onClick={() => setStatuses(toggled(statuses, status))}
                    >
                      {STATUS_LABEL[status]}
                    </Toggle>
                  </span>
                ))}
                <span class="ml-auto text-sm tabular-nums text-ink-500">
                  {filtered.length === state.rows.length ? `${state.rows.length} rules` : `${filtered.length} of ${state.rows.length} rules`}
                </span>
              </div>
            </section>

            <RulesTable table={table} />

            </>
          ) : telemetry === null ? (
            <p class="text-sm text-ink-500">Reading the ingest database…</p>
          ) : (
            <Telemetry data={telemetry} />
          )
        }
      </Tabs>
      <footer class="mt-6 text-xs text-ink-500">
        Click a row for the concept, its languages, the commit that introduced it and — where one exists — the recorded
        reason it is not in <code>recommended</code>.
      </footer>
    </main>
  )
}
