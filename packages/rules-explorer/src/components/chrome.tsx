import type { ComponentChildren } from 'preact'
import type { CatalogueStatus } from '@misaon/slop-gate-core'
import type { ComponentType } from 'preact'
import { HoverGroup } from './animated/icons.tsx'
import { ICON_SMALL, STATUS_ICON } from './icons.tsx'

const STATUS_CLASS: Readonly<Record<CatalogueStatus, string>> = {
  recommended: 'bg-state-on/12 text-state-on ring-state-on/25',
  withheld: 'bg-state-withheld/12 text-state-withheld ring-state-withheld/25',
  unlisted: 'bg-ink-850 text-ink-300 ring-ink-800',
}

export function StatusPill({ status, label }: { status: CatalogueStatus; label: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <span
      class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_CLASS[status]}`}
    >
      <Icon {...ICON_SMALL} />
      {label}
    </span>
  )
}

export function Tile({
  label,
  value,
  tone,
  icon: Icon,
  delay = 0,
}: {
  label: string
  value: number | string
  tone?: string
  icon: ComponentType<{ size?: number; class?: string }>
  delay?: number
}) {
  return (
    <HoverGroup class="motion-safe:rise rounded-xl bg-ink-900 px-4 py-3 ring-1 ring-ink-800 transition-colors hover:ring-ink-700">
      <div class="flex items-center gap-4" style={{ animationDelay: `${delay}ms` }}>
        <span class={`shrink-0 rounded-lg bg-ink-850 p-2.5 ring-1 ring-ink-800 ${tone ?? 'text-ink-300'}`}>
          <Icon size={26} />
        </span>
        <div class="min-w-0">
          <div class="truncate text-xs uppercase tracking-wide text-ink-500">{label}</div>
          <div class={`mt-0.5 text-2xl font-semibold tabular-nums ${tone ?? 'text-ink-100'}`}>{value}</div>
        </div>
      </div>
    </HoverGroup>
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
      <span class="inline-flex items-center gap-1.5">
        {children}
        {count === undefined ? null : <span class="text-xs tabular-nums text-ink-500">{count}</span>}
      </span>
    </button>
  )
}
