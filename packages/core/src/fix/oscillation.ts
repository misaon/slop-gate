import { hashContent } from '../cache/keys.ts'
import { compareStrings } from '../ordering.ts'

type Oscillation = {
  /** Every rule that applied an edit to this file between the repeated state and now, sorted. */
  readonly rules: readonly string[]
  /** How many passes the cycle spans. Two rules trading one edit each gives 2. */
  readonly passes: number
}

export type OscillationLedger = {
  /** Records a file's starting buffer. Must be called once per file before any `record`. */
  seed(file: string, buffer: Uint8Array): void
  /** `null` while the file is still converging, or the rules to name once a hash repeats. */
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
 * Spec §11 step 5: per-file, per-pass buffer hashes, and the `config.fix-oscillation` a repeat produces. A
 * repeated hash means the file re-entered a state it was already in, so continuing would reproduce the same
 * sequence forever. The fix loop's pass cap is a second, blunter guard for a cycle longer than the cap;
 * **this is the precise one.**
 *
 * **Naming both rules is the requirement, and the naive answer is wrong.** "The rule that produced this
 * pass, plus the rule that produced the matching hash" misses everything in between, and is empty when the
 * match is the seed, which nobody produced. So the report is every rule that applied an edit from the
 * repeated state onwards. Rules from passes *before* the cycle began are deliberately excluded: they
 * changed the file and settled, and blaming them is how a user disables the wrong rule.
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
