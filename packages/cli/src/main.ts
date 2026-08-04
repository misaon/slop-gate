import { defineCommand, renderUsage, runCommand, type CommandDef } from 'citty'
import { displayWidth, padEndDisplay } from '@misaon/slop-gate-reporters'
import { EXIT_CODES } from './exit-codes.ts'
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
  const unicode = process.env['TERM'] !== 'dumb'
  const box = unicode
    ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }
  const logoMark = unicode ? '◆' : '*'

  const width = Math.max(60, Math.min(process.stdout.columns ?? 80, 100))
  const inner = width - 2
  const left = `  ${logoMark}  slop-gate`
  const right = `v${version} `
  const gap = Math.max(1, inner - displayWidth(left) - displayWidth(right))
  const content = padEndDisplay(left + ' '.repeat(gap) + right, inner)

  console.log(`\n  ${box.tl}${box.h.repeat(inner)}${box.tr}`)
  console.log(`  ${box.v}${content}${box.v}`)
  console.log(`  ${box.bl}${box.h.repeat(inner)}${box.br}`)
}
