import type { LucideIcon } from 'lucide-preact'
import { ICON_SMALL } from './icons.tsx'

export function Card({
  icon: Icon,
  label,
  hint,
  delay = 0,
  wide = false,
  children,
}: {
  icon: LucideIcon
  label: string
  hint?: string | undefined
  delay?: number
  wide?: boolean
  children: preact.ComponentChildren
}) {
  return (
    <section
      class={`motion-safe:rise group rounded-2xl bg-ink-900 p-5 ring-1 ring-ink-800 transition-all duration-300 hover:-translate-y-px hover:ring-ink-700 ${wide ? 'md:col-span-2' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div class="flex items-baseline justify-between gap-3">
        <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-ink-500 transition-colors group-hover:text-ink-300">
          <Icon {...ICON_SMALL} />
          {label}
        </div>
        {hint === undefined ? null : <span class="text-xs text-ink-700">{hint}</span>}
      </div>
      <div class="mt-4">{children}</div>
    </section>
  )
}

export function Figure({ value, unit, caption }: { value: number | string; unit?: string | undefined; caption?: string | undefined }) {
  return (
    <div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-4xl font-semibold tabular-nums tracking-tight text-ink-100">{value}</span>
        {unit === undefined ? null : <span class="text-sm text-ink-500">{unit}</span>}
      </div>
      {caption === undefined ? null : <div class="mt-1 text-xs text-ink-500">{caption}</div>}
    </div>
  )
}

// One hue: the palette's warm steps separate at ΔE 11.9, under the floor of 15, so two would not read apart.
export function Ranked({ rows, total }: { rows: readonly { readonly key: string; readonly value: number }[]; total: number }) {
  const largest = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div class="space-y-3">
      {rows.length === 0 ? <div class="text-sm text-ink-700">Nothing reported yet.</div> : null}
      {rows.map((row, index) => (
        <div key={row.key} class="group/row" title={`${row.key}: ${row.value} of ${total}`}>
          <div class="flex items-baseline justify-between text-sm">
            <span class="mono truncate text-ink-300 transition-colors group-hover/row:text-ink-100">{row.key}</span>
            <span class="tabular-nums text-ink-100">{row.value}</span>
          </div>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-850">
            <div
              class="motion-safe:grow-bar h-full rounded-full bg-brand"
              style={{ width: `${(row.value / largest) * 100}%`, animationDelay: `${index * 80}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const hourLabel = (hour: string): string => hour.slice(11, 16)

// The buckets arrive zero-filled, so a bar of height 0 is an hour nobody reported and not a gap in the data.
export function Timeline({ buckets }: { buckets: readonly { readonly hour: string; readonly reports: number; readonly ours: number }[] }) {
  const largest = Math.max(1, ...buckets.map((bucket) => bucket.reports))

  return (
    <div>
      <div class="flex h-28 items-end gap-1">
        {buckets.map((bucket, index) => (
          <div
            key={bucket.hour}
            class="group/bar flex h-full flex-1 flex-col justify-end"
            title={`${bucket.hour} — ${bucket.reports} report(s), ${bucket.ours} from our CI`}
          >
            <div
              class="motion-safe:grow-bar w-full rounded-t bg-brand/80 transition-colors group-hover/bar:bg-brand"
              style={{
                height: `${Math.max(bucket.reports === 0 ? 0 : 4, (bucket.reports / largest) * 100)}%`,
                animationDelay: `${index * 40}ms`,
              }}
            />
          </div>
        ))}
      </div>
      <div class="mt-2 flex justify-between text-xs tabular-nums text-ink-700">
        <span>{buckets.length === 0 ? '' : hourLabel(buckets[0]!.hour)}</span>
        <span>peak {largest}/h</span>
        <span>{buckets.length === 0 ? '' : hourLabel(buckets.at(-1)!.hour)}</span>
      </div>
    </div>
  )
}
