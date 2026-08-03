/**
 * The known name a mistyped one most likely meant, or `undefined` when nothing is close enough.
 *
 * Transpositions count as one edit rather than two (optimal string alignment, not plain Levenshtein),
 * because swapped adjacent characters are the most common typing slip and `ignoer` should reach `ignore`
 * as confidently as `ignor` does.
 *
 * The threshold scales with the shorter name so that short names cannot be turned into each other:
 * `owner` earns `owners` and `x` earns nothing. Suggesting a wrong key is worse than suggesting none,
 * because the reader tries it and gets a second error.
 */
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

/** Damerau-Levenshtein restricted to adjacent transpositions, over two rows rather than a full table. */
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
