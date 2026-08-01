export function realFailure(): string {
  throw new Error('config file missing')
}

export function guarded(value: unknown): string {
  if (value === undefined) throw new Error('not implemented for undefined')
  return String(value)
}

export function doesWorkFirst(): string {
  logStart()
  throw new Error('Not implemented')
}

export abstract class Base {
  abstract fetch(): Promise<string>
}

function privateStub(): string {
  throw new Error('Not implemented')
}

export const usesPrivate = () => privateStub()

declare function logStart(): void

export function throwsAfterRealWork(): string {
  const value = compute()
  if (value) return value
  throw new Error('not implemented for an empty value')
}

declare function compute(): string
