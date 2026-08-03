/**
 * The trimmed line alignment both of the fix pipeline's line differs are built on: `unifiedDiff`
 * (`fix/diff.ts`), which renders what a fix *would* do, and `editsFromRewrite` (`fix/derive.ts`),
 * which recovers the byte ranges a fix actually did.
 *
 * One implementation rather than two, and that is a correctness requirement rather than tidiness.
 * The two are the preview and the applied edit of the *same* rewrite, on the one code path that
 * writes a user's source — and while each carried its own copy of this algorithm they also carried
 * their own `MAX_CELLS`, 4,000,000 in one and 1,000,000 in the other. A rewrite whose window product
 * landed between the two got a minimal diff from `sgate fix --dry-run` and a coarse whole-window
 * replacement from the fix that ran: the two disagreeing in shape, with nothing on either side able
 * to notice. `align.test.ts` pins that band.
 *
 * The trim is what makes an O(n·m) table affordable on a real source file: a fix changes a handful of
 * lines, so the window that actually differs is tiny even in a thousand-line file.
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
   * `MAX_CELLS`) and the caller has to fall back to replacing the whole of it. Deliberately not a
   * degenerate all-removed-then-all-added step list: the two callers' fallbacks are genuinely
   * different — one prints a verbose diff, the other emits a single edit — so the type makes each of
   * them say which it wants rather than letting one silently mishandle it.
   */
  readonly steps: readonly AlignStep<T>[] | null
}

/**
 * The largest table this will build, in cells. Past it the window is reported unaligned and the
 * caller replaces it wholesale — correct output, just not a minimal one.
 *
 * **4,000,000, the higher of the two bounds this replaces**, for two reasons.
 *
 * The fallbacks are not equally lossy. `unifiedDiff` falling back prints a verbose but faithful diff.
 * `editsFromRewrite` falling back collapses the whole window into *one* edit, and a single edit
 * spanning hundreds of lines makes every other rule's edit inside those lines an overlap loser — a
 * file then converges one rule per pass, if at all inside the pass limit (see that function's own
 * doc comment, where tight ranges are called the point rather than a nicety). So the higher bound is
 * the one whose exceeded case costs something real, and taking it is also what leaves every input
 * that got a minimal result before still getting one.
 *
 * And the higher bound is now cheaper than the lower one was. Measured on this machine over a
 * fully-rewritten window of equal-length lines, filling the table: 1,002,001 cells as the
 * `number[][]` both files used to build took 29-32 ms, where 4,004,001 cells as the flat
 * `Int32Array` below takes 22 ms. The worst case that 1,000,000 was chosen to bound therefore got
 * faster while the band it covers grew fourfold. The cost that did rise is peak memory —
 * `(n+1)·(m+1)·4` bytes, so 16 MB at the bound against roughly 8 MB at the old one — transient, and
 * on a path only a whole-file rewrite of a two-thousand-line file reaches.
 */
const MAX_CELLS = 4_000_000

/**
 * Aligns two line sequences by longest common subsequence, after trimming the common head and tail.
 *
 * `same` is passed rather than a key function because the two callers compare different things — one
 * on line text alone, the other on text *and* trailing-newline status, which is what makes a file
 * gaining or losing its final newline a visible change — and a predicate states that without either
 * of them having to reason about whether their key encoding is unambiguous.
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

  // `table[i * width + j]` is the LCS length of `oldWindow[i..]` against `newWindow[j..]`. Flat and
  // `Int32Array` rather than a `number[][]`: one contiguous allocation instead of n+1 separate
  // arrays, no pointer chase per row, and five to eight times faster to fill (see `MAX_CELLS`).
  const width = newWindow.length + 1
  const table = new Int32Array((oldWindow.length + 1) * width)
  for (let i = oldWindow.length - 1; i >= 0; i -= 1) {
    const oldLine = oldWindow[i]!
    const row = i * width
    const below = row + width
    // Two of the three neighbours each cell needs were computed by the previous iteration of this
    // same loop, so carrying them costs one table read per cell instead of three. `right` is the cell
    // at j+1 in this row, `belowRight` the one at j+1 in the row below; both are 0 past the end.
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
