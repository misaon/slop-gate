import { defineCommand, renderUsage, runCommand, type CommandDef } from 'citty'
import { brandHeader, createFrameKit } from '@misaon/slop-gate-reporters'
import { EXIT_CODES } from './exit-codes.ts'
import { supportsColor, supportsUnicode } from './terminal.ts'
import { readCliVersion } from './version.ts'

const version = readCliVersion()

const subCommands = {
  baseline: () => import('./commands/baseline/index.ts').then((module) => module.baseline),
  check: () => import('./commands/check.ts').then((module) => module.check),
  engines: () => import('./commands/engines.ts').then((module) => module.engines),
  fix: () => import('./commands/fix.ts').then((module) => module.fix),
  init: () => import('./commands/init.ts').then((module) => module.init),
  mcp: () => import('./commands/mcp/index.ts').then((module) => module.mcp),
  rules: () => import('./commands/rules/index.ts').then((module) => module.rules),
  telemetry: () => import('./commands/telemetry.ts').then((module) => module.telemetry),
}

const main = defineCommand({
  meta: {
    name: 'sgate',
    version,
    description: 'slop-gate — one quality gate over many analysis engines',
  },
  subCommands,
})

const rawArgs = process.argv.slice(2)

try {
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    const target = await resolveHelpTarget(rawArgs)
    printHeader()
    console.log(`${await renderUsage(target.cmd, target.parent)}\n`)
  } else if (rawArgs.length === 1 && (rawArgs[0] === '--version' || rawArgs[0] === '-v')) {
    console.log(version)
  } else {
    await runCommand(main, { rawArgs })
  }
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = EXIT_CODES.config
}

async function resolveHelpTarget(args: readonly string[]): Promise<{ cmd: CommandDef; parent?: CommandDef }> {
  let cmd: CommandDef = main
  let parent: CommandDef | undefined
  for (const name of args.filter((arg) => !arg.startsWith('-'))) {
    const subs = cmd.subCommands as Record<string, (() => Promise<CommandDef>) | undefined> | undefined
    const loader = subs?.[name]
    if (loader === undefined) break
    parent = cmd
    cmd = await loader()
  }
  return parent === undefined ? { cmd: main } : { cmd, parent }
}

function printHeader(): void {
  const kit = createFrameKit({
    unicode: supportsUnicode(),
    color: supportsColor(),
    width: process.stdout.columns ?? 80,
    write: (chunk) => process.stdout.write(chunk),
  })
  kit.writeUnit(brandHeader(kit, version))
}
