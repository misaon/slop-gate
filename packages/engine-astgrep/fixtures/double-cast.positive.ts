declare const value: unknown
declare const record: Record<string, string>

export const a = value as unknown as string // SLOP_HIT
export const b = value as any as number // SLOP_HIT

export function tuple(match: RegExpExecArray) {
  const [, first, second] = match as unknown as [string, string, string] // SLOP_HIT
  return first + second
}

export const nested = { inner: record as unknown as Map<string, string> } // SLOP_HIT
