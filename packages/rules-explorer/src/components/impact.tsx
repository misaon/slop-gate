import type { Impact } from '@misaon/slop-gate-core'

const FILL: Readonly<Record<Impact, string>> = {
  1: 'bg-ink-500',
  2: 'bg-brand',
  3: 'bg-severity-error',
}

const TEXT: Readonly<Record<Impact, string>> = {
  1: 'text-ink-500',
  2: 'text-brand',
  3: 'text-severity-error',
}

const SEGMENTS: readonly Impact[] = [1, 2, 3]

export function ImpactBar({
  impact,
  label,
  test,
  withLabel = false,
}: {
  impact: Impact
  label: string
  test: string
  withLabel?: boolean
}) {
  return (
    <span class="inline-flex items-center gap-2" title={`${impact} — ${label}. ${test}`}>
      <span class="inline-flex gap-0.5" aria-hidden="true">
        {SEGMENTS.map((segment) => (
          <span key={segment} class={`h-3.5 w-1.5 rounded-[1px] ${segment <= impact ? FILL[impact] : 'bg-ink-800'}`} />
        ))}
      </span>
      <span class={`text-xs ${TEXT[impact]}`}>{withLabel ? label : impact}</span>
    </span>
  )
}

/** Under 50% is worse than useless; over 80% is a rule you can act on without checking. */
function tone(percent: number): string {
  return percent < 50 ? 'text-severity-error' : percent < 80 ? 'text-brand' : 'text-state-on'
}

export function ReliabilityCell({ percent, sampled }: { percent: number | null; sampled: number | null }) {
  if (percent === null || sampled === null) {
    return (
      <span class="text-ink-700" title="Nobody has measured this rule's precision. It is not an assumed 100%.">
        —
      </span>
    )
  }
  return (
    <span class="inline-flex items-baseline gap-1.5" title={`${percent}% of ${sampled} findings read individually were right`}>
      <span class={`tabular-nums ${tone(percent)}`}>{percent}%</span>
      <span class="text-xs tabular-nums text-ink-700">n={sampled}</span>
    </span>
  )
}
