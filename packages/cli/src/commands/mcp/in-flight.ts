export type InFlight = {
  track<T>(work: () => Promise<T>): Promise<T>
  idle(): Promise<void>
}

export function createInFlight(): InFlight {
  let count = 0
  const waiting: (() => void)[] = []

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
