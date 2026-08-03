/**
 * The trimmed line alignment both of the fix pipeline's line differs are built on: `unifiedDiff`
 * (`fix/diff.ts`), which renders what a fix *would* do, and `editsFromRewrite` (`fix/derive.ts`), which
 * recovers the byte ranges a fix actually did. The trim is what makes an O(n·m) table affordable: a fix
 * changes a handful of lines, so the window that differs is tiny even in a thousand-line file.
 *
 * **One implementation, as a correctness requirement rather than tidiness.** While each carried its own
 * copy they also carried their own `MAX_CELLS`, so a rewrite whose window product landed between the two
 * bounds got a minimal diff from `sgate fix --dry-run` and a coarse whole-window replacement from the fix
 * that ran — disagreeing in shape, with nothing able to notice. `align.test.ts` pins that band.
 */

export type AlignKind = 'same' | 'removed' | 'added'

type AlignStep<T> = {
  readonly kind: AlignKind
  /** The old-side line for `'same'` and `'removed'`; the new-side one for `'added'`. */
  readonly line: T
}

type Alignment<T> = {
  /** Identical lines trimmed off the front. Both windows begin here in their own input. */
  readonly head: number
  /** Identical lines trimmed off the end. */
  readonly tail: number
  readonly oldWindow: readonly T[]
  readonly newWindow: readonly T[]
  /**
   * The minimal alignment of the two windows, or `null` when the window was too large to align (see
   * `MAX_CELLS`) and the caller has to replace the whole of it. Deliberately not a degenerate
   * all-removed-then-all-added step list: the two callers' fallbacks genuinely differ — one prints a
   * verbose diff, the other emits a single edit — so the type makes each say which it wants.
   */
  readonly steps: readonly AlignStep<T>[] | null
}

/**
 * The largest table this will build, in cells. Past it the window is reported unaligned and the caller
 * replaces it wholesale — correct output, just not a minimal one.
 *
 * **4,000,000, the higher of the two bounds this replaces**, because the fallbacks are not equally lossy.
 * `unifiedDiff` falling back still prints a faithful diff; `editsFromRewrite` falling back collapses the
 * window into *one* edit, and a single edit spanning hundreds of lines makes every other rule's edit in
 * those lines an overlap loser — the file then converges one rule per pass, if at all inside the pass
 * limit. Taking the higher bound also leaves every input that got a minimal result before still getting
 * one, and the flat `Int32Array` below fills it faster than the lower bound filled as a `number[][]`.
 * Peak memory is `(n+1)·(m+1)·4` bytes, so 16 MB here — transient, and reached only by a whole-file
 * rewrite of a two-thousand-line file.
 */
const MAX_CELLS = 4_000_000

/**
 * Aligns two line sequences by longest common subsequence, after trimming the common head and tail.
 * `same` is a predicate because the two callers compare different things: one line text alone, the other
 * text *and* trailing-newline status — which is what makes a file gaining or losing its final newline a
 * visible change.
 */
export function alignLines<T>(before: readonly T[], after: readonly T[], same: (a: T, b: T) => boolean): Alignment<T> {
  let head = 0
  while (head < before.length && head < after.length && same(before[head]!, after[head]!)) head += 1

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    same(before[before.length - 1 - tail]!, after[after.length - 1 - tail]!)
  ) {
    tail += 1
  }

  const oldWindow = before.slice(head, before.length - tail)
  const newWindow = after.slice(head, after.length - tail)
  if (oldWindow.length * newWindow.length > MAX_CELLS) return { head, tail, oldWindow, newWindow, steps: null }

  // `table[i * width + j]` is the LCS length of `oldWindow[i..]` against `newWindow[j..]`. Flat `Int32Array`
  // rather than `number[][]`: one contiguous allocation, no pointer chase, five to eight times faster to fill.
  const width = newWindow.length + 1
  const table = new Int32Array((oldWindow.length + 1) * width)
  for (let i = oldWindow.length - 1; i >= 0; i -= 1) {
    const oldLine = oldWindow[i]!
    const row = i * width
    const below = row + width
    // Two of the three neighbours each cell needs came from the previous iteration, so carrying them costs
    // one table read per cell instead of three. `right` is j+1 in this row, `belowRight` j+1 in the row below.
    let right = 0
    let belowRight = 0
    for (let j = newWindow.length - 1; j >= 0; j -= 1) {
      const belowValue = table[below + j]!
      const value = same(oldLine, newWindow[j]!) ? belowRight + 1 : Math.max(belowValue, right)
      table[row + j] = value
      right = value
      belowRight = belowValue
    }
  }

  const steps: AlignStep<T>[] = []
  let i = 0
  let j = 0
  while (i < oldWindow.length || j < newWindow.length) {
    if (i < oldWindow.length && j < newWindow.length && same(oldWindow[i]!, newWindow[j]!)) {
      steps.push({ kind: 'same', line: oldWindow[i]! })
      i += 1
      j += 1
      continue
    }
    // `j` past its end leaves nothing to add, so the rest of the old window is removals; the mirror
    // case falls through to `added` because `i < oldWindow.length` fails there.
    if (j >= newWindow.length || (i < oldWindow.length && table[(i + 1) * width + j]! >= table[i * width + j + 1]!)) {
      steps.push({ kind: 'removed', line: oldWindow[i]! })
      i += 1
      continue
    }
    steps.push({ kind: 'added', line: newWindow[j]! })
    j += 1
  }

  return { head, tail, oldWindow, newWindow, steps }
}
