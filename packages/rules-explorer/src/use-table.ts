import {
  constructTable,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ColumnDef,
  type RowData,
  type SortingState,
  type Table,
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import { useMemo, useState } from 'preact/hooks'

/**
 * Sorting is the only behaviour the table owns. `app.tsx` narrows the rows itself and hands the result
 * down, so the filtered and faceted row models this used to register were never asked for anything.
 */
const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
})

export type RulesFeatures = typeof features

/**
 * table-core is framework-agnostic on purpose: it owns the row model and nothing else. This is the
 * whole Preact binding — hold the state, hand it back on every render, let the core recompute.
 * Using `@tanstack/react-table` instead would mean aliasing react to preact/compat through Vite and
 * tsc both, for a hook this size.
 */
export function useTable<T extends RowData>(data: readonly T[], columns: readonly ColumnDef<RulesFeatures, T, unknown>[]): Table<RulesFeatures, T> {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useMemo(
    () => constructTable<RulesFeatures, T>({ features, data: [], columns: [] }),
    [],
  )

  table.setOptions((previous) => ({
    ...previous,
    data: data as T[],
    columns: columns as ColumnDef<RulesFeatures, T, unknown>[],
    state: { sorting },
    onSortingChange: setSorting,
  }))

  return table
}
