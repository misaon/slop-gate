export type AstGrepScanSummary = {
  readonly scannedFileCount: number
  readonly skippedFileCount: number
  readonly effectiveRuleCount: number
  readonly skippedRuleCount: number
}

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
