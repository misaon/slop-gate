import { hashContent } from '../cache/keys.ts'
import { compareStrings } from '../ordering.ts'

export type Oscillation = {
  /** Every rule that applied an edit to this file between the repeated state and now, sorted. */
  readonly rules: readonly string[]
  /** How many passes the cycle spans. Two rules trading one edit each gives 2. */
  readonly passes: number
}

export type OscillationLedger = {
  /** Records a file's starting buffer. Must be called once per file before any `record`. */
  seed(file: string, buffer: Uint8Array): void
  /**
   * Records the buffer a pass produced and the rules that produced it. Returns `null` while the file
   * is still converging, or the rules to name once a hash repeats.
   */
  record(file: string, buffer: Uint8Array, rules: readonly string[]): Oscillation | null
  /** True once `record` has reported an oscillation for this file. */
  isStopped(file: string): boolean
}

type FileLedger = {
  /** Buffer hash → the 0-based pass index that produced it. Pass 0 is the seed. */
  readonly seen: Map<string, number>
  /** Rules applied in each pass, index 0 being the seed's (always empty). */
  readonly rulesByPass: string[][]
  stopped: boolean
}

/**
 * Spec §11 step 5: per-file, per-pass buffer hashes, and the `config.fix-oscillation` a repeat
 * produces.
 *
 * A repeated hash means the file has re-entered a state it was already in, so continuing would
 * reproduce the same sequence forever — the failure this exists to convert from a hang (or a file
 * left in whichever of two states the pass limit happened to stop on) into a named, actionable
 * diagnostic. The pass cap in the fix loop is a second, blunter guard for a cycle longer than the
 * cap; this is the precise one.
 *
 * **Naming both rules is the requirement, and the naive answer is wrong.** "The rule that produced
 * this pass, plus the rule that produced the matching hash" misses everything in between and is
 * simply empty when the match is the seed, which nobody produced. So the report is every rule that
 * applied an edit from the repeated state onwards — for the modal two-rule cycle that is exactly the
 * two rules, and for a longer cycle it is every participant rather than an arbitrary two of them.
 * Rules from passes *before* the cycle began are deliberately excluded: they changed the file and
 * settled, and blaming them for someone else's fight is how a user ends up disabling the wrong rule.
 */
export function createOscillationLedger(): OscillationLedger {
  const files = new Map<string, FileLedger>()

  return {
    seed(file, buffer) {
      files.set(file, { seen: new Map([[hashContent(buffer), 0]]), rulesByPass: [[]], stopped: false })
    },

    record(file, buffer, rules) {
      const ledger = files.get(file)
      if (ledger === undefined) throw new Error(`fix oscillation ledger: ${file} was never seeded`)

      const pass = ledger.rulesByPass.length
      ledger.rulesByPass.push([...rules])

      const hash = hashContent(buffer)
      const previous = ledger.seen.get(hash)
      if (previous === undefined) {
        ledger.seen.set(hash, pass)
        return null
      }

      ledger.stopped = true
      const inCycle = new Set(ledger.rulesByPass.slice(previous + 1).flat())
      return { rules: [...inCycle].sort(compareStrings), passes: pass - previous }
    },

    isStopped(file) {
      return files.get(file)?.stopped ?? false
    },
  }
}
