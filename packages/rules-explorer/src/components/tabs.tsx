import { useId, useState } from 'preact/hooks'

export type Tab = { readonly id: string; readonly label: string; readonly count?: number | undefined }

// `tablist` promises a keyboard that arrow keys move the selection and that only the selected tab is tabbable.
export function Tabs({
  tabs,
  children,
}: {
  tabs: readonly Tab[]
  children: (active: string) => preact.ComponentChildren
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const group = useId()

  const move = (delta: number): void => {
    const index = tabs.findIndex((tab) => tab.id === active)
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    if (next !== undefined) setActive(next.id)
  }

  return (
    <div>
      <div role="tablist" aria-label="Views" class="flex gap-1 border-b border-ink-850">
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              id={`${group}-${tab.id}-tab`}
              aria-selected={selected}
              aria-controls={`${group}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') move(1)
                if (event.key === 'ArrowLeft') move(-1)
              }}
              class={`relative -mb-px flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm transition-colors ${
                selected ? 'text-ink-100' : 'text-ink-500 hover:text-ink-300'
              }`}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span class={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${selected ? 'bg-brand/15 text-brand' : 'bg-ink-850 text-ink-500'}`}>
                  {tab.count}
                </span>
              )}
              {/* `-bottom-px` puts the underline over the tablist's own border, so the two meet without a seam. */}
              {selected ? <span class="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" /> : null}
            </button>
          )
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${group}-${tab.id}-panel`}
          aria-labelledby={`${group}-${tab.id}-tab`}
          hidden={tab.id !== active}
          class={tab.id === active ? 'motion-safe:rise pt-6' : ''}
        >
          {tab.id === active ? children(tab.id) : null}
        </div>
      ))}
    </div>
  )
}
