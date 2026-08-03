/**
 * How many per-file cache probes may be in flight at once.
 *
 * The concurrency is worth a great deal and the *breadth* is worth nothing, which is what this number
 * separates. `fs.promises.readFile` runs on libuv's threadpool, four threads wide by default, so
 * fanning out over 2,003 files never performs 2,003 reads at once: it queues 2,003 requests behind
 * four workers and holds 2,003 half-finished promise chains, each retaining a fully parsed diagnostics
 * array, live until the last one settles.
 *
 * Swept with hyperfine over a warm 2,003-file corpus (12 runs each) and peak RSS from
 * `/usr/bin/time -l` (3 runs each, mean):
 *
 * | limit     | time             | peak RSS |
 * |-----------|------------------|----------|
 * | unbounded | 415.7 ms ± 8.2   | 208.3 MB |
 * | 64        | 423.1 ms ± 8.9   | 158.9 MB |
 * | 32        | 417.6 ms ± 2.5   | 158.9 MB |
 * | 16        | 424.1 ms ± 4.1   | 158.7 MB |
 * | 8         | 442.4 ms ± 14.0  | 159.3 MB |
 * | 1         | 612.8 ms ± 6.4   | 157.9 MB |
 *
 * So the parallelism is worth 195 ms — serial against 32 — and every megabyte of the extra 49 MB the
 * unbounded version costs buys nothing: peak RSS is flat within a megabyte from 1 to 64 and only the
 * unbounded case pays for the breadth. At 8,003 files the cap is a strict win on both axes,
 * 1.374 s ± 0.032 / 449.2 MB unbounded against 1.333 s ± 0.010 / 305.3 MB at 32.
 *
 * 32 is above the threadpool width by enough that the queue in front of it never drains, and it is a
 * constant, so *this* fan-out's share of peak memory stops being a function of repository size. Total
 * memory still grows with the file count — the collected diagnostics and the run's source text do — but
 * that is work the run has to hold, not a queue it chose to widen. 16 and 8 start paying in time; 64
 * buys nothing back.
 *
 * The sweep predates sharing the run's source map with the reporters, so the RSS column is a controlled
 * comparison of this one variable and not a current reading: a warm 2,003-file run measures ~199 MB
 * today.
 */
export const PROBE_CONCURRENCY = 32

/**
 * `Promise.all(items.map(fn))` with a ceiling on how many calls are outstanding.
 *
 * **Results stay in `items` order, never completion order.** Both callers depend on it: the
 * per-assignment probe loop in `streamCheck` yields diagnostics as it walks the results, and that
 * order is the user's output, while `deriveProjectResultKey` hashes a file list whose order has to be
 * the plan's rather than the disk's or the key would differ between two identical runs.
 *
 * Rejection behaves as `Promise.all` does — the first one to reject settles the returned promise, and
 * the remaining workers are not cancelled. Nothing here needs cancellation: the tasks are reads, and
 * the run is about to fail anyway.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  // Filled by index rather than pushed, which is what keeps the result in `items` order while the
  // workers settle in whatever order the filesystem hands them back. Every index from 0 to
  // `items.length - 1` is assigned exactly once before the returned promise settles.
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
