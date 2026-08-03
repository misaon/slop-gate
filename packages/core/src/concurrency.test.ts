import { expect, test } from 'vitest'
import { mapWithLimit, PROBE_CONCURRENCY } from './concurrency.ts'

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

test('returns results in input order, not completion order', async () => {
  const gates = [deferred<number>(), deferred<number>(), deferred<number>()]
  const mapped = mapWithLimit([0, 1, 2], 3, async (index) => gates[index]!.promise)

  gates[2]!.resolve(2)
  gates[0]!.resolve(0)
  gates[1]!.resolve(1)

  expect(await mapped).toEqual([0, 1, 2])
})

test('never exceeds the limit in flight', async () => {
  let inFlight = 0
  let peak = 0
  const items = Array.from({ length: 200 }, (_, index) => index)

  const results = await mapWithLimit(items, 8, async (item) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await Promise.resolve()
    inFlight -= 1
    return item * 2
  })

  expect(peak).toBe(8)
  expect(results).toEqual(items.map((item) => item * 2))
})

test('starts no worker for an empty input', async () => {
  let calls = 0
  expect(
    await mapWithLimit([], 8, async () => {
      calls += 1
      return 1
    }),
  ).toEqual([])
  expect(calls).toBe(0)
})

test('starts no more workers than there are items', async () => {
  let peak = 0
  let inFlight = 0
  await mapWithLimit([1, 2], 64, async (item) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await Promise.resolve()
    inFlight -= 1
    return item
  })
  expect(peak).toBe(2)
})

test('treats a limit below one as one', async () => {
  const order: number[] = []
  await mapWithLimit([1, 2, 3], 0, async (item) => {
    order.push(item)
    await Promise.resolve()
    return item
  })
  expect(order).toEqual([1, 2, 3])
})

test('rejects with the first failure and still settles', async () => {
  await expect(
    mapWithLimit([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error('boom')
      return item
    }),
  ).rejects.toThrow('boom')
})

test('the shipped limit stays above libuv default threadpool width', () => {
  expect(PROBE_CONCURRENCY).toBeGreaterThan(4)
})
