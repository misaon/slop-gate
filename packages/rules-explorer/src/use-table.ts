import {
  createTable,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type Table,
  type TableOptionsResolved,
  type TableState,
} from '@tanstack/table-core'
import { useMemo, useState } from 'preact/hooks'

/**
 * table-core is framework-agnostic on purpose: it owns the row model and nothing else. This is the
 * whole Preact binding — hold the state, hand it back on every render, let the core recompute.
 * Using `@tanstack/react-table` instead would mean aliasing react to preact/compat through Vite and
 * tsc both, for a hook this size.
 */
export function useTable<T>(data: readonly T[], columns: readonly ColumnDef<T, unknown>[]): Table<T> {
  const [state, setState] = useState<Partial<TableState>>({})

  const table = useMemo(
    () =>
      createTable<T>({
        data: [],
        columns: [],
        state: {},
        onStateChange: () => undefined,
        renderFallbackValue: null,
        getCoreRowModel: getCoreRowModel<T>(),
        getSortedRowModel: getSortedRowModel<T>(),
        getFilteredRowModel: getFilteredRowModel<T>(),
        getFacetedRowModel: getFacetedRowModel<T>(),
        getFacetedUniqueValues: getFacetedUniqueValues<T>(),
      } as TableOptionsResolved<T>),
    [],
  )

  table.setOptions((previous) => ({
    ...previous,
    data: data as T[],
    columns: columns as ColumnDef<T, unknown>[],
    state: { ...table.initialState, ...state },
    onStateChange: (updater) => {
      setState((current) => {
        const merged = { ...table.initialState, ...current }
        return typeof updater === 'function' ? updater(merged) : updater
      })
    },
  }))

  return table
}
