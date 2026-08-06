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
  SlidersHorizontal,
  Target,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-preact'

/**
 * One import site for the icon set. Lucide tree-shakes per icon, so naming them here costs only what
 * is used, and a reader can see the whole vocabulary of the page without grepping for `<Icon`.
 */
export {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  Gauge,
  GitCommitHorizontal,
  Languages,
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
