import type { ColumnDef, Row as CoreRow, Table } from '@tanstack/table-core'
import { useState } from 'preact/hooks'
import { STATUS_LABEL, type Row } from '../data.ts'
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
  SlidersHorizontal,
  Target,
  TriangleAlert,
  Wrench,
} from './icons.tsx'
import { ExternalLinkAnimated, HoverGroup } from './animated/icons.tsx'
import { ImpactBar, ReliabilityCell } from './impact.tsx'
import { Prose } from './prose.tsx'

export const columns: ColumnDef<Row, unknown>[] = [
  { id: 'rule', accessorFn: (row) => row.engineRuleId, header: 'Rule' },
  { id: 'engine', accessorFn: (row) => row.engine, header: 'Engine' },
  { id: 'concept', accessorFn: (row) => row.concept, header: 'Concept' },
  { id: 'status', accessorFn: (row) => row.status, header: 'State' },
  { id: 'impact', accessorFn: (row) => row.impact, header: 'Impact' },
  // Unmeasured sorts below 0%, so ordering by this column surfaces what is known first.
  { id: 'reliability', accessorFn: (row) => row.reliability?.percent ?? -1, header: 'Reliability' },
  { id: 'options', accessorFn: (row) => row.options, header: 'Options' },
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
  added: '7rem',
}

const HEAD_CLASS = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-500 select-none'

function SortArrow({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === false) {
    return <ChevronsUpDown {...ICON_SMALL} class="ml-1 inline text-ink-700 group-hover:text-ink-500" />
  }
  const Arrow = direction === 'asc' ? ArrowUp : ArrowDown
  return <Arrow {...ICON_SMALL} class="motion-safe:unfurl ml-1 inline text-brand" />
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
          </div>
        )}
      </td>
    </tr>
  )
}

function Cell({ id, row }: { id: string; row: Row }) {
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
      return <StatusPill status={row.status} label={STATUS_LABEL[row.status]} />
    case 'impact':
      return <ImpactBar impact={row.impact} label={row.impactLabel} test={row.impactTest} />
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
    case 'added':
      return <span class="mono text-ink-500">{row.origin?.date ?? '—'}</span>
    default:
      return null
  }
}

export function RulesTable({ table }: { table: Table<Row> }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const rows: CoreRow<Row>[] = table.getRowModel().rows

  return (
    <div class="overflow-x-auto rounded-xl ring-1 ring-ink-800">
      <table class="sticky-head w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '2.25rem' }} />
          {columns.map((column) => (
            <col key={column.id} style={{ width: COLUMN_WIDTH[column.id ?? ''] ?? 'auto' }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th class={`${HEAD_CLASS} w-8`}>
              <span class="sr-only">Detail</span>
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
            return (
              <>
                <tr
                  key={row.ruleRefKey}
                  class={`cursor-pointer border-t border-ink-850 transition-colors hover:bg-ink-900 ${open ? 'bg-ink-900' : ''}`}
                  onClick={() => setExpanded(open ? null : row.ruleRefKey)}
                >
                  <td class="px-3 py-2">
                    <ChevronRight
                      {...ICON}
                      data-open={open}
                      class={`chevron ${open ? 'text-brand' : 'text-ink-700'}`}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.id} class="truncate px-3 py-2">
                      <Cell id={column.id ?? ''} row={row} />
                    </td>
                  ))}
                </tr>
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
