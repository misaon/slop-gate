import type { CatalogueStatus } from '@misaon/slop-gate-core'
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleOff,
  ChevronsUpDown,
  Gauge,
  GitCommitHorizontal,
  Languages,
  LoaderCircle,
  Pencil,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-preact'

// One import site for the set; lucide tree-shakes per icon, so naming them here costs only what is used.
export {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  Gauge,
  GitCommitHorizontal,
  Languages,
  Pencil,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  Wrench,
  X,
}

export const STATUS_ICON: Readonly<Record<CatalogueStatus, LucideIcon>> = {
  recommended: CircleCheck,
  withheld: CircleOff,
  unlisted: Circle,
}

/** Lucide's default 24px stroke is heavy beside 13px table text. */
export const ICON = { size: 14, strokeWidth: 2 } as const
export const ICON_SMALL = { size: 12, strokeWidth: 2 } as const

export function Spinner({ label }: { label: string }) {
  return (
    <span class="inline-flex items-center gap-2 text-ink-500">
      <LoaderCircle size={16} strokeWidth={2} class="motion-safe:animate-spin" />
      {label}
    </span>
  )
}
