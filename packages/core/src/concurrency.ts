/**
 * How many per-file cache probes may be in flight at once.
 *
 * The concurrency is worth a great deal and the *breadth* is worth nothing, which is what this number
 * separates. `fs.promises.readFile` runs on libuv's threadpool, four threads wide by default, so fanning
 * out over 2,003 files never performs 2,003 reads at once: it queues 2,003 requests behind four workers and
 * holds 2,003 half-finished promise chains, each retaining a fully parsed diagnostics array, live until the
 * last one settles.
 *
 * **32 is above the threadpool width by enough that the queue in front of it never drains, and it is a
 * constant, so *this* fan-out's share of peak memory stops being a function of repository size.** Swept
 * with hyperfine over a warm 2,003-file corpus: the cap costs nothing in time against unbounded and is
 * worth 195 ms against serial, while unbounded pays 49 MB more peak RSS for breadth that buys nothing; at
 * 8,003 files the cap wins on both axes, by 144 MB. 16 and 8 start paying in time; 64 buys nothing back.
 */
export const PROBE_CONCURRENCY = 32

/**
 * `Promise.all(items.map(fn))` with a ceiling on how many calls are outstanding.
 *
 * **Results stay in `items` order, never completion order.** Both callers depend on it: the per-assignment
 * probe loop in `streamCheck` yields diagnostics as it walks the results and that order is the user's
 * output, while `deriveProjectResultKey` hashes a file list whose order has to be the plan's rather than the
 * disk's or the key would differ between two identical runs. Rejection behaves as `Promise.all` does — the
 * first rejection settles the returned promise, the remaining workers are not cancelled, and nothing here
 * needs cancellation because the tasks are reads and the run is about to fail anyway.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  // Filled by index rather than pushed, which is what keeps the result in `items` order while the workers
  // settle in whatever order the filesystem hands them back.
  const results: R[] = []
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker))
  return results
}
