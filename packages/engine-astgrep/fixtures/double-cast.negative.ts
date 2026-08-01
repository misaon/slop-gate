declare const value: unknown
declare const wide: string | number

export const a = value as string
export const b = wide as number
export const c = JSON.parse('{}') as Record<string, unknown>
export const d = value as unknown
export const e = <string>(value as string)

export function narrowed(input: unknown): string {
  if (typeof input !== 'string') throw new TypeError('expected a string')
  return input
}

export const satisfied = { port: 8080 } satisfies { port: number }
