import { expect, test } from 'vitest'
import { createInFlight } from './in-flight.ts'

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => (resolve = settle))
  return { promise, resolve }
}

test('idle resolves immediately when nothing ever ran', async () => {
  await expect(createInFlight().idle()).resolves.toBeUndefined()
})

test('idle waits for work that is still running', async () => {
  const inFlight = createInFlight()
  const work = deferred()
  let settled = false

  const tracked = inFlight.track(() => work.promise)
  const waited = inFlight.idle().then(() => (settled = true))

  await Promise.resolve()
  expect(settled).toBe(false)

  work.resolve()
  await tracked
  await waited
  expect(settled).toBe(true)
})

test('idle waits for the last of several calls, not the first', async () => {
  const inFlight = createInFlight()
  const first = deferred()
  const second = deferred()
  let settled = false

  const calls = [inFlight.track(() => first.promise), inFlight.track(() => second.promise)]
  const waited = inFlight.idle().then(() => (settled = true))

  first.resolve()
  await calls[0]
  await Promise.resolve()
  expect(settled).toBe(false)

  second.resolve()
  await Promise.all(calls)
  await waited
  expect(settled).toBe(true)
})

test('a call that throws still releases the wait, and the rejection reaches the caller', async () => {
  // The direction that hangs a server rather than failing it: a handler that throws with the count
  // never decremented leaves `idle` unresolved forever, and the process never exits.
  const inFlight = createInFlight()
  await expect(inFlight.track(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  await expect(inFlight.idle()).resolves.toBeUndefined()
})

test('several waiters are all released', async () => {
  const inFlight = createInFlight()
  const work = deferred()
  const tracked = inFlight.track(() => work.promise)
  const waits = Promise.all([inFlight.idle(), inFlight.idle()])

  work.resolve()
  await tracked
  await expect(waits).resolves.toEqual([undefined, undefined])
})
