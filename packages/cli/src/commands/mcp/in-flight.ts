export type InFlight = {
  /** Wraps one tool call. Rejections propagate untouched — this counts work, it does not handle it. */
  track<T>(work: () => Promise<T>): Promise<T>
  /** Resolves once nothing is running. Immediately, when nothing was. */
  idle(): Promise<void>
}

/**
 * How many tool calls are still running.
 *
 * The stdio binding makes closing stdin the shutdown signal and the SDK's transport does not act on it — it
 * listens for `data` and `error` and nothing else — so the entry point has to. **Closing the transport the moment
 * stdin ends is the obvious way to do that and it is wrong:** a `check` takes seconds, and a client that wrote its
 * request and closed the pipe (a batch invocation, a shell pipeline) would have the answer thrown away just as it
 * was about to be written, leaving a server that exits silently having answered nothing. So shutdown is "stdin
 * ended *and* nothing is in flight", which settles because nothing new can arrive after EOF.
 */
export function createInFlight(): InFlight {
  let count = 0
  const waiting: Array<() => void> = []

  return {
    async track<T>(work: () => Promise<T>): Promise<T> {
      count += 1
      try {
        return await work()
      } finally {
        count -= 1
        if (count === 0) for (const resolve of waiting.splice(0)) resolve()
      }
    },
    async idle(): Promise<void> {
      if (count === 0) return
      await new Promise<void>((resolve) => waiting.push(resolve))
    },
  }
}
