import { defineCommand } from 'citty'
import { runFix, type FixResult, type FixTier } from '@misaon/slop-gate-core'
import { DEFAULT_CONFIG, loadCliConfig } from '../config.ts'
import { defaultEngines } from '../engine-registry.ts'
import { EXIT_CODES } from '../exit-codes.ts'
import { resolveRootDir } from '../root-dir.ts'

export const fix = defineCommand({
  meta: { name: 'fix', description: 'Apply the fixes slop-gate can apply safely' },
  args: {
    'dry-run': { type: 'boolean', default: false, description: 'Print a unified diff and write nothing' },
    suggest: { type: 'boolean', default: false, description: 'Also apply suggested fixes' },
    unsafe: { type: 'boolean', default: false, description: 'Also apply suggested and unsafe fixes' },
    'allow-dirty': { type: 'boolean', default: false, description: 'Proceed even with uncommitted changes' },
    cwd: { type: 'string', description: 'Directory to fix (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.cwd)
    const tier: FixTier = args.unsafe ? 'unsafe' : (args.suggest ? 'suggested' : 'safe')

    const loaded = await loadCliConfig(rootDir, DEFAULT_CONFIG)
    if (loaded.kind === 'error') {
      process.exitCode = EXIT_CODES.config
      return
    }

    const controller = new AbortController()
    const onInterrupt = (): void => controller.abort()
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onInterrupt)

    let result: FixResult
    try {
      result = await runFix({
        rootDir,
        config: loaded.config,
        ...(loaded.kind === 'loaded' ? { configFile: loaded.configFile } : {}),
        engines: defaultEngines(rootDir, loaded.kind === 'loaded' ? loaded.configFile : undefined, loaded.config.ignore),
        tier,
        dryRun: args['dry-run'],
        allowDirty: args['allow-dirty'],
        signal: controller.signal,
      })
    } finally {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onInterrupt)
    }

    process.stdout.write(renderFixSummary(result))
    process.exitCode = fixExitCode(result)
  },
})

export function fixExitCode(result: FixResult): number {
  if (result.refusal !== undefined) {
    return result.refusal.reason === 'engine-failed' ? EXIT_CODES.engine : EXIT_CODES.config
  }
  return result.oscillations.length > 0 ? EXIT_CODES.findings : EXIT_CODES.clean
}

const plural = (count: number, noun: string, suffix = 's'): string => `${count} ${noun}${count === 1 ? '' : suffix}`

export function renderFixSummary(result: FixResult): string {
  const lines: string[] = []

  if (result.refusal !== undefined) {
    return `sgate fix refused to run.\n${result.refusal.message}\n`
  }

  if (result.dryRun) {
    for (const file of result.files) lines.push(file.diff)
  }

  const totalEdits = result.rules.reduce((sum, rule) => sum + rule.count, 0)
  const verb = result.dryRun ? 'would change' : 'changed'

  if (result.files.length === 0) {
    lines.push(`sgate fix: nothing to fix at the \`${result.tier}\` tier.`)
  } else {
    lines.push(`sgate fix ${verb} ${plural(result.files.length, 'file')} (${plural(totalEdits, 'edit')}, tier \`${result.tier}\`):`)
    for (const file of result.files) lines.push(`  ${file.file} — ${plural(file.edits, 'edit')}`)
    lines.push('')
    lines.push('Rules applied:')
    for (const rule of result.rules) lines.push(`  ${rule.ruleRefKey} — ${rule.count}`)
  }

  const { safe, suggested, unsafe } = result.initial.withFix
  lines.push('')
  lines.push(
    `${plural(result.initial.findings, 'finding')} on the first pass; ` +
      `fixable: ${safe} safe, ${suggested} suggested, ${unsafe} unsafe.`,
  )

  const dropped = result.skipped.overlap + result.skipped.outOfRange + result.skipped.outsideInventory
  if (dropped > 0) {
    const parts: string[] = []
    if (result.skipped.overlap > 0) parts.push(`${result.skipped.overlap} lost an overlap`)
    if (result.skipped.outOfRange > 0) parts.push(`${result.skipped.outOfRange} were out of range`)
    if (result.skipped.outsideInventory > 0) parts.push(`${result.skipped.outsideInventory} named a file outside the inventory`)
    lines.push(`Edits not applied: ${parts.join(', ')}.`)
  }

  for (const oscillation of result.oscillations) {
    lines.push('')
    lines.push(`config.fix-oscillation: ${oscillation.message}`)
    if (oscillation.help !== undefined) lines.push(`  ${oscillation.help}`)
  }

  if (result.truncated) {
    lines.push('')
    lines.push(
      result.dryRun
        ? '--dry-run shows the first pass only. A real run iterates to a fixed point and may apply more.'
        : `Stopped after ${plural(result.passes, 'pass', 'es')} without reaching a fixed point. Run \`sgate fix\` again.`,
    )
  }

  if (result.files.length > 0) {
    lines.push('')
    lines.push('Formatting is not run afterwards (no formatter engine exists yet) — run yours before committing.')
  }

  return `${lines.join('\n')}\n`
}
