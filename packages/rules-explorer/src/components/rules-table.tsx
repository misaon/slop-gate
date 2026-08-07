import type { CatalogueStatus, Impact } from '@misaon/slop-gate-core'
import type { ColumnDef, Row as CoreRow, Table } from '@tanstack/table-core'
import type { RulesFeatures } from '../use-table.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'preact/hooks'
import { editRule, STATUS_LABEL, type Row } from '../data.ts'
import { StatusPill } from './chrome.tsx'
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  Gauge,
  GitCommitHorizontal,
  ICON,
  ICON_SMALL,
  Languages,
  Pencil,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  Wrench,
} from './icons.tsx'
import { ExternalLinkAnimated, HoverGroup } from './animated/icons.tsx'
import { ImpactBar, ReliabilityCell } from './impact.tsx'
import { Prose } from './prose.tsx'

export const columns: ColumnDef<RulesFeatures, Row, unknown>[] = [
  { id: 'rule', accessorFn: (row) => row.engineRuleId, header: 'Rule' },
  { id: 'engine', accessorFn: (row) => row.engine, header: 'Engine' },
  { id: 'concept', accessorFn: (row) => row.concept, header: 'Concept' },
  { id: 'status', accessorFn: (row) => row.status, header: 'State' },
  { id: 'impact', accessorFn: (row) => row.impact, header: 'Impact' },
  // Unmeasured sorts below 0%, so ordering by this column surfaces what is known first.
  { id: 'reliability', accessorFn: (row) => row.reliability?.percent ?? -1, header: 'Reliability' },
  { id: 'options', accessorFn: (row) => row.options, header: 'Options' },
  // Never-fired sorts below 0%, so ordering by this column puts the rules that do fire first.
  { id: 'seen', accessorFn: (row) => row.prevalence?.percent ?? -1, header: 'Seen on' },
  { id: 'added', accessorFn: (row) => row.origin?.date ?? '', header: 'Added' },
]

/**
 * Auto layout sizes a column to the widest value across all 923 rows, not the visible ones, so the
 * longest rule id and the longest concept together push the table past the viewport and the right
 * columns fall off. Fixed widths keep the whole row readable; the full value is one click away in
 * the detail row, and in `title` for a hover.
 */
const COLUMN_WIDTH: Readonly<Record<string, string>> = {
  rule: '21%',
  engine: '7.5rem',
  concept: '25%',
  status: '8rem',
  impact: '5.5rem',
  reliability: '8rem',
  options: '6rem',
  seen: '8rem',
  added: '7rem',
}

/**
 * A wash rather than a colour: the row still has to read as a row of a long table, and the state is
 * already spelled out in its own column. This is for scanning down the page, not for identifying.
 */
const ROW_TINT: Readonly<Record<CatalogueStatus, string>> = {
  recommended: 'bg-state-on/[0.035] hover:bg-state-on/[0.07]',
  withheld: 'bg-state-withheld/[0.05] hover:bg-state-withheld/[0.09]',
  unlisted: 'hover:bg-ink-900',
}

const HEAD_CLASS = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-500 select-none'

function SortArrow({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === false) {
    return <ChevronsUpDown {...ICON_SMALL} class="ml-1 inline text-ink-700 group-hover:text-ink-500" />
  }
  const Arrow = direction === 'asc' ? ArrowUp : ArrowDown
  return <Arrow {...ICON_SMALL} class="motion-safe:unfurl ml-1 inline text-brand" />
}

const MEASUREMENTS = 'https://github.com/misaon/slop-gate/blob/main/docs/measurements.md'

/** The conclusion lives in the registry; the corpus and the per-repository split live in the docs. */
function Evidence({ anchor }: { anchor: string }) {
  return (
    <a
      class="mt-2 inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
      href={`${MEASUREMENTS}#${anchor}`}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(event) => event.stopPropagation()}
    >
      The figures behind this
      <ExternalLinkAnimated size={12} />
    </a>
  )
}

function Section({ icon: Icon, label }: { icon: typeof Wrench; label: string }) {
  return (
    <span class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-500">
      <Icon {...ICON_SMALL} />
      {label}
    </span>
  )
}

function Detail({ row }: { row: Row }) {
  return (
    <tr class="motion-safe:unfurl bg-ink-900/60">
      <td colSpan={columns.length + 1} class="px-6 py-4 text-sm">
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <Section icon={Target} label="Concept" />
            <div class="mono mt-1 text-ink-100">{row.concept}</div>
            {row.title === '' ? null : <div class="mt-1 text-ink-300">{row.title}</div>}
            {row.description === '' ? null : (
              <div class="mt-2 text-ink-300">
                <Prose text={row.description} />
              </div>
            )}
          </div>
          <div class="space-y-2">
            <div>
              <Section icon={Gauge} label="Impact" />
              <div class="mt-1">
                <ImpactBar impact={row.impact} label={row.impactLabel} test={row.impactTest} withLabel />
              </div>
              <p class="mt-1 text-ink-500">{row.impactTest}</p>
            </div>
            <div>
              <Section icon={Wrench} label="Fix" />
              <div class="mt-1 text-ink-300">{row.fixKind === 'none' ? 'none declared' : row.fixKind}</div>
            </div>
            <div>
              <Section icon={Languages} label="Languages" />
              <div class="mono mt-1 text-ink-300">{row.languages.length === 0 ? '—' : row.languages.join(' · ')}</div>
            </div>
            {row.origin === null ? null : (
              <div>
                <Section icon={GitCommitHorizontal} label="Added" />
                <div class="mt-1 text-ink-300">
                  <span class="mono">{row.origin.date}</span> · <span class="mono">{row.origin.commit}</span>
                  <div class="text-ink-500">{row.origin.subject}</div>
                </div>
              </div>
            )}
            <HoverGroup class="inline-block">
              <a
                class="inline-flex items-center gap-1.5 text-brand hover:underline"
                href={row.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Rule documentation
                <ExternalLinkAnimated />
              </a>
            </HoverGroup>
          </div>
        </div>
        {row.optionSetting === null ? null : (
          <div class="mt-4 rounded-lg bg-ink-950/60 p-3 ring-1 ring-ink-800">
            <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
              <SlidersHorizontal {...ICON_SMALL} />
              The setting slop-gate applies
            </div>
            <pre class="mono mt-2 overflow-x-auto text-xs leading-relaxed text-ink-300">
              {JSON.stringify({ [row.concept]: row.optionSetting }, null, 2)}
            </pre>
          </div>
        )}
        {row.prevalence === null ? null : (
          <div class="mt-4 text-ink-500">
            Fired on <span class="text-ink-300">{row.prevalence.seenIn} of 20</span> corpus projects,{' '}
            <span class="text-ink-300">{row.prevalence.findings}</span> findings in total.
          </div>
        )}
        {row.reliability === null ? null : (
          <div class="mt-4 rounded-lg bg-ink-950/50 p-3 ring-1 ring-ink-800">
            <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
              <Target {...ICON_SMALL} />
              Reliability · {row.reliability.percent}% of {row.reliability.sampled} findings read, against{' '}
              {row.reliability.measuredAgainst}
            </div>
            <div class="mt-1 text-ink-300">
              <Prose text={row.reliability.source} />
            </div>
          </div>
        )}
        {row.optionReason === null ? null : (
          <div class="mt-4 rounded-lg bg-brand/8 p-3 ring-1 ring-brand/25">
            <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand">
              <SlidersHorizontal {...ICON_SMALL} />
              Why the options are tuned
            </div>
            <div class="mt-1 text-ink-300">
              <Prose text={row.optionReason} />
            </div>
            {row.optionEvidence === null ? null : <Evidence anchor={row.optionEvidence} />}
          </div>
        )}
        {row.withheldReason === null ? null : (
          <div class="mt-4 rounded-lg bg-state-withheld/8 p-3 ring-1 ring-state-withheld/25">
            <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-state-withheld">
              <TriangleAlert {...ICON_SMALL} />
              Why it is withheld
            </div>
            <div class="mt-1 text-ink-300">
              <Prose text={row.withheldReason} />
            </div>
            {row.withheldEvidence === null ? null : <Evidence anchor={row.withheldEvidence} />}
          </div>
        )}
      </td>
    </tr>
  )
}

export type Draft = { readonly ruleRefKey: string; readonly status: CatalogueStatus; readonly impact: Impact }

const STATUS_OPTIONS: readonly CatalogueStatus[] = ['recommended', 'withheld', 'unlisted']
const IMPACT_OPTIONS: readonly Impact[] = [3, 2, 1]

const CONTROL =
  'w-full rounded-md bg-ink-900 px-1.5 py-1 text-xs text-ink-100 ring-1 ring-ink-800 outline-none hover:ring-ink-700 focus:ring-brand/60'

const FIELD =
  'mt-1 w-full rounded-lg bg-ink-950 px-3 py-2 text-sm text-ink-100 ring-1 ring-ink-800 outline-none placeholder:text-ink-700 focus:ring-brand/60'

function Field({ label, hint, children }: { label: string; hint?: string; children: preact.ComponentChildren }) {
  return (
    <label class="block">
      <span class="text-xs uppercase tracking-wide text-ink-500">{label}</span>
      {hint === undefined ? null : <span class="ml-2 text-xs normal-case text-ink-700">{hint}</span>}
      {children}
    </label>
  )
}

/**
 * `stopPropagation` because the row itself is a toggle for the detail panel, and a select that opens
 * one on every click is unusable.
 */
function DraftSelect<T extends string | number>({
  label,
  value,
  options,
  render,
  onPick,
}: {
  label: string
  value: T
  options: readonly T[]
  render: (option: T) => string
  onPick: (value: T) => void
}) {
  return (
    <select
      class={CONTROL}
      value={String(value)}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const picked = options.find((option) => String(option) === event.currentTarget.value)
        if (picked !== undefined) onPick(picked)
      }}
    >
      {options.map((option) => (
        <option key={option} value={String(option)}>
          {render(option)}
        </option>
      ))}
    </select>
  )
}

function EditRow({ row, draft, onClose }: { row: Row; draft: Draft; onClose: () => void }) {
  const client = useQueryClient()
  const [reason, setReason] = useState(row.withheldReason ?? '')
  const [evidence, setEvidence] = useState(row.withheldEvidence ?? '')
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: editRule,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['rules'] })
      onClose()
    },
  })

  const becomesWithheld = draft.status === 'withheld' && row.status !== 'withheld'
  const newException = draft.impact !== row.impactFromGroup && row.impact === row.impactFromGroup
  const incomplete = (draft.status === 'withheld' && reason.trim() === '') || (newException && note.trim() === '')

  const changes = [
    draft.status === row.status ? null : `state ${STATUS_LABEL[row.status]} → ${STATUS_LABEL[draft.status]}`,
    draft.impact === row.impact ? null : `impact ${row.impact} → ${draft.impact}`,
  ].filter((change) => change !== null)

  return (
    <tr class="motion-safe:unfurl bg-ink-900/60">
      <td colSpan={columns.length + 1} class="px-6 py-4 text-sm">
        <div class="max-w-3xl space-y-3">
          <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-brand">
            <Pencil {...ICON_SMALL} />
            {changes.length === 0 ? 'Nothing to write' : changes.join(' · ')}
          </div>

          {draft.status === 'withheld' ? (
            <>
              <Field label="Why it is withheld" hint="the conclusion, under 900 characters — the working goes in measurements.md">
                <textarea
                  class={`${FIELD} min-h-28 leading-relaxed`}
                  value={reason}
                  placeholder="**132 findings, zero true positives** — …"
                  onInput={(event) => setReason(event.currentTarget.value)}
                />
              </Field>
              <Field label="Evidence anchor" hint="optional; must be an <a id> in docs/measurements.md">
                <input class={FIELD} value={evidence} placeholder="hadolint-dl3066" onInput={(event) => setEvidence(event.currentTarget.value)} />
              </Field>
            </>
          ) : null}

          {draft.impact === row.impact ? null : (
            <Field
              label="Why this impact"
              hint={
                newException
                  ? `one line; its group gives it ${row.impactFromGroup ?? '—'}`
                  : 'optional; blank keeps the reason already recorded'
              }
            >
              <input class={FIELD} value={note} placeholder="It throws the moment that line runs." onInput={(event) => setNote(event.currentTarget.value)} />
            </Field>
          )}

          {save.error === null ? null : (
            <p class="whitespace-pre-wrap rounded-lg bg-severity-error/10 px-3 py-2 text-severity-error ring-1 ring-severity-error/25">
              {save.error.message}
            </p>
          )}

          <div class="flex items-center gap-2">
            <button
              type="button"
              disabled={save.isPending || incomplete || changes.length === 0}
              onClick={() =>
                save.mutate({
                  ruleRefKey: row.ruleRefKey,
                  ...(draft.status === row.status ? {} : { status: draft.status }),
                  ...(draft.impact === row.impact ? {} : { impact: draft.impact }),
                  ...(draft.status === 'withheld' ? { reason, evidence } : {}),
                  ...(note.trim() === '' ? {} : { impactNote: note }),
                })
              }
              class="rounded-lg bg-brand/15 px-3 py-1.5 text-sm text-brand ring-1 ring-brand/40 transition-colors hover:bg-brand/25 disabled:opacity-40"
            >
              {save.isPending ? 'Writing and testing…' : 'Write it to the registry'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending}
              class="rounded-lg px-3 py-1.5 text-sm text-ink-500 transition-colors hover:text-ink-100 disabled:opacity-40"
            >
              Cancel
            </button>
            {save.isPending ? (
              <span class="text-xs text-ink-500">The registry's own tests decide; a red one puts the file back.</span>
            ) : becomesWithheld && row.engine === 'oxlint' ? (
              <span class="text-xs text-ink-500">Also regenerates entries.generated.ts, which the preset is derived from.</span>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  )
}

function Cell({ id, row, draft, onDraft }: { id: string; row: Row; draft: Draft | null; onDraft: (draft: Draft) => void }) {
  const current: Draft = draft ?? { ruleRefKey: row.ruleRefKey, status: row.status, impact: row.impact }

  switch (id) {
    case 'rule':
      return (
        <span class="mono text-ink-100" title={row.engineRuleId}>
          {row.engineRuleId}
          {row.overridden ? <span class="ml-2 text-xs text-brand" title="slop-gate overrides this rule">override</span> : null}
        </span>
      )
    case 'engine':
      return <span class="mono text-ink-300">{row.engine}</span>
    case 'concept':
      return (
        <span class="mono text-ink-500" title={row.concept}>
          {row.concept}
        </span>
      )
    case 'status':
      return draft === null ? (
        <StatusPill status={row.status} label={STATUS_LABEL[row.status]} />
      ) : (
        <DraftSelect
          label={`State of ${row.engineRuleId}`}
          value={current.status}
          options={STATUS_OPTIONS}
          render={(status) => STATUS_LABEL[status]}
          onPick={(status) => onDraft({ ...current, status })}
        />
      )
    case 'impact':
      return draft === null ? (
        <ImpactBar impact={row.impact} label={row.impactLabel} test={row.impactTest} />
      ) : (
        <DraftSelect
          label={`Impact of ${row.engineRuleId}`}
          value={current.impact}
          options={IMPACT_OPTIONS}
          render={(impact) => String(impact)}
          onPick={(impact) => onDraft({ ...current, impact })}
        />
      )
    case 'reliability':
      return <ReliabilityCell percent={row.reliability?.percent ?? null} sampled={row.reliability?.sampled ?? null} />
    case 'options':
      return row.options === 'tuned' ? (
        <span class="text-brand" title="slop-gate sets options for this rule rather than taking the default">
          tuned
        </span>
      ) : row.options === 'default' ? (
        <span class="text-ink-500" title="The rule accepts options; slop-gate takes the engine's default">
          default
        </span>
      ) : (
        <span class="text-ink-700" title="The rule takes no options">
          —
        </span>
      )
    case 'seen':
      return row.prevalence === null ? (
        <span class="text-ink-700" title="Fired on none of the 20 corpus projects">
          —
        </span>
      ) : (
        <span
          class="inline-flex items-baseline gap-1.5"
          title={`Fired on ${row.prevalence.seenIn} of 20 corpus projects, ${row.prevalence.findings} findings in total`}
        >
          <span class="tabular-nums text-ink-300">{row.prevalence.percent}%</span>
          <span class="text-xs tabular-nums text-ink-700">{row.prevalence.findings}×</span>
        </span>
      )
    case 'added':
      return <span class="mono text-ink-500">{row.origin?.date ?? '—'}</span>
    default:
      return null
  }
}

export function RulesTable({ table }: { table: Table<RulesFeatures, Row> }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  // One draft at a time: two half-written exclusions racing for the same test run is not worth the code.
  const [draft, setDraft] = useState<Draft | null>(null)
  const rows: CoreRow<RulesFeatures, Row>[] = table.getRowModel().rows

  return (
    <div class="overflow-x-auto rounded-xl ring-1 ring-ink-800">
      <table class="sticky-head w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '4rem' }} />
          {columns.map((column) => (
            <col key={column.id} style={{ width: COLUMN_WIDTH[column.id ?? ''] ?? 'auto' }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th class={HEAD_CLASS}>
              <span class="sr-only">Detail and edit</span>
            </th>
            {table.getHeaderGroups()[0]?.headers.map((header) => (
              <th
                key={header.id}
                class={`${HEAD_CLASS} group cursor-pointer truncate hover:text-ink-300`}
                onClick={header.column.getToggleSortingHandler()}
              >
                {String(header.column.columnDef.header)}
                <SortArrow direction={header.column.getIsSorted()} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((coreRow) => {
            const row = coreRow.original
            const open = expanded === row.ruleRefKey
            const editing = draft?.ruleRefKey === row.ruleRefKey ? draft : null
            return (
              <>
                <tr
                  key={row.ruleRefKey}
                  class={`cursor-pointer border-t border-ink-850 transition-colors ${
                    open || editing !== null ? 'bg-ink-900' : ROW_TINT[row.status]
                  }`}
                  onClick={() => setExpanded(open ? null : row.ruleRefKey)}
                >
                  <td class="flex items-center gap-1 px-2 py-2">
                    <ChevronRight
                      {...ICON}
                      data-open={open}
                      class={`chevron ${open ? 'text-brand' : 'text-ink-700'}`}
                    />
                    <button
                      type="button"
                      aria-label={`Edit ${row.engineRuleId}`}
                      title="Change this rule's state or impact in the registry"
                      class={`rounded p-0.5 transition-colors ${editing === null ? 'text-ink-700 hover:text-brand' : 'text-brand'}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setDraft(editing === null ? { ruleRefKey: row.ruleRefKey, status: row.status, impact: row.impact } : null)
                      }}
                    >
                      <Pencil {...ICON_SMALL} />
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td key={column.id} class="truncate px-3 py-2">
                      <Cell id={column.id ?? ''} row={row} draft={editing} onDraft={setDraft} />
                    </td>
                  ))}
                </tr>
                {editing === null ? null : (
                  <EditRow key={`${row.ruleRefKey}-edit`} row={row} draft={editing} onClose={() => setDraft(null)} />
                )}
                {open ? <Detail key={`${row.ruleRefKey}-detail`} row={row} /> : null}
              </>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <div class="px-4 py-10 text-center text-ink-500">No rule matches those filters.</div> : null}
    </div>
  )
}
