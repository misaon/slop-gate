export function dirty(): number {
  debugger
  const duplicated = { a: 1, a: 2 }
  return duplicated.a
}
