export type AstGrepScanSummary = {
  readonly scannedFileCount: number
  readonly skippedFileCount: number
  readonly effectiveRuleCount: number
  readonly skippedRuleCount: number
}

/**
 * Reads the three `--inspect summary` lines ast-grep writes to **stderr** (never stdout, so they do
 * not disturb `--json`). Verbatim from 0.45.0:
 *
 * ```
 * sg: summary|project: isProject=false
 * sg: summary|file: scannedFileCount=1,skippedFileCount=0
 * sg: summary|rule: effectiveRuleCount=20,skippedRuleCount=0
 * ```
 *
 * Parsed by scanning for the `key=value` pairs rather than by matching the line shapes, so a future
 * release adding a counter, reordering the pairs or renaming the `sg:` prefix does not break the two
 * numbers this adapter actually depends on. Returns `null` when either of those two is absent, which
 * `run` treats as a failure — see `assertSummary` in index.ts for why a disabled guard is worse than
 * a noisy one.
 */
export function readScanSummary(stderr: string): AstGrepScanSummary | null {
  const counters = new Map<string, number>()
  for (const match of stderr.matchAll(/([A-Za-z]+)=(\d+)/g)) {
    counters.set(match[1]!, Number(match[2]))
  }

  const skippedFileCount = counters.get('skippedFileCount')
  const effectiveRuleCount = counters.get('effectiveRuleCount')
  if (skippedFileCount === undefined || effectiveRuleCount === undefined) return null

  return {
    scannedFileCount: counters.get('scannedFileCount') ?? 0,
    skippedFileCount,
    effectiveRuleCount,
    skippedRuleCount: counters.get('skippedRuleCount') ?? 0,
  }
}
