import type { ComponentChildren } from 'preact'
import type { CatalogueStatus } from '@misaon/slop-gate-core'

const STATUS_CLASS: Readonly<Record<CatalogueStatus, string>> = {
  recommended: 'bg-state-on/12 text-state-on ring-state-on/25',
  withheld: 'bg-state-withheld/12 text-state-withheld ring-state-withheld/25',
  unlisted: 'bg-ink-850 text-ink-300 ring-ink-800',
}

export function StatusPill({ status, label }: { status: CatalogueStatus; label: string }) {
  return (
    <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_CLASS[status]}`}>
      {label}
    </span>
  )
}

export function Tile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div class="rounded-xl bg-ink-900 px-4 py-3 ring-1 ring-ink-800">
      <div class="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div class={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-ink-100'}`}>{value}</div>
    </div>
  )
}

export function Toggle({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: ComponentChildren
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`rounded-lg px-2.5 py-1 text-sm ring-1 transition-colors ${
        active
          ? 'bg-brand/15 text-brand ring-brand/40'
          : 'bg-ink-900 text-ink-300 ring-ink-800 hover:bg-ink-850 hover:text-ink-100'
      }`}
    >
      {children}
      {count === undefined ? null : <span class="ml-1.5 text-xs tabular-nums text-ink-500">{count}</span>}
    </button>
  )
}
