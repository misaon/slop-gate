import { hashContent } from '../cache/keys.ts'
import { compareStrings } from '../ordering.ts'

type Oscillation = {
  readonly rules: readonly string[]
  readonly passes: number
}

export type OscillationLedger = {
  seed(file: string, buffer: Uint8Array): void
  record(file: string, buffer: Uint8Array, rules: readonly string[]): Oscillation | null
  isStopped(file: string): boolean
}

type FileLedger = {
  readonly seen: Map<string, number>
  readonly rulesByPass: string[][]
  stopped: boolean
}

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
