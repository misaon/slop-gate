export function nearestName(typed: string, known: Iterable<string>): string | undefined {
  const needle = typed.toLowerCase()
  let best: { name: string; distance: number } | undefined

  for (const name of known) {
    const distance = editDistance(needle, name.toLowerCase())
    if (distance > Math.max(1, Math.floor(Math.min(needle.length, name.length) / 3))) continue
    if (best === undefined || distance < best.distance) best = { name, distance }
  }

  return best?.name
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0

  let twoBack: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  let current: number[] = []

  for (let i = 1; i <= a.length; i += 1) {
    current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      let best = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, twoBack[j - 2]! + 1)
      }
      current.push(best)
    }
    twoBack = previous
    previous = current
  }

  return previous[b.length]!
}
