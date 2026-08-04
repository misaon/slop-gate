import type { EnabledLevel, FrameworkEvidence, FrameworkMeasurement } from './types.ts'

export function refuseEnable(
  adjustment: { readonly level: EnabledLevel; readonly measured: FrameworkMeasurement },
  evidence: readonly FrameworkEvidence[],
): string | null {
  const { findings, falsePositives, repository } = adjustment.measured

  if (evidence.length === 0) {
    return 'a profile that applied on no evidence may only subtract, never add'
  }
  if (findings < 1) {
    return `the rule never fired on ${repository}, so nothing about it was measured`
  }
  if (falsePositives > findings) {
    return `the measurement on ${repository} claims more false positives (${falsePositives}) than findings (${findings})`
  }

  if (adjustment.level === 'error' && falsePositives > 0) {
    return `an addition at \`error\` fails a build on its own, so it needs a clean measurement; ${falsePositives} of ${findings} findings on ${repository} were false`
  }

  if (falsePositives * 2 >= findings) {
    return `${falsePositives} of ${findings} findings on ${repository} were false, which is not a majority right`
  }

  return null
}
