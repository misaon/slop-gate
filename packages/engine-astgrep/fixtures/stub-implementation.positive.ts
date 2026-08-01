export function notDone(): string { // SLOP_HIT
  throw new Error('Not implemented')
}

export function lowercase(): string { // SLOP_HIT
  throw new Error('not implemented yet')
}

export const arrow = (): number => { // SLOP_HIT
  throw new Error('TODO: implement')
}

export class Service {
  fetch(): Promise<string> { // SLOP_HIT
    throw new Error('Unimplemented')
  }
}

export default function fallback(): string { // SLOP_HIT
  throw new Error('stub')
}

export async function later(): Promise<void> { // SLOP_HIT
  throw new RangeError('implement me')
}

export function afterAComment(): string { // SLOP_HIT
  // TODO: wire this up to the real client
  throw new Error('Not implemented')
}
