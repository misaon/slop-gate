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

/**
 * `runCommand`, not citty's own `runMain`: on every usage error (unknown subcommand, missing argument, no
 * command given) `runMain` calls `process.exit()` directly, bypassing `process.exitCode` — the one thing this
 * layer owns — and reporting exit 1 ("findings") for something that never ran a check at all. `runCommand`
 * throws instead (verified directly: an unknown subcommand raises a `CLIError` coded `E_UNKNOWN_COMMAND`, no
 * command given one coded `E_NO_COMMAND`), so the catch below maps those to `EXIT_CODES.config`. The cost is
 * that `runCommand` has no `--help`/`--version` handling of its own — `['check', '--help']` starts running
 * `check` for real — so this file replicates just that part below over citty's exported `renderUsage`.
 *
 * One `try` around the whole dispatch, not just the `runCommand` branch: `resolveHelpTarget` dynamically
 * imports a subcommand, which transitively loads the engine layer, so a broken oxlint install makes
 * `sgate check --help` reject — and left unhandled that exits 1 for a run that never checked anything.
 */
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

/**
 * Walks as many levels of `subCommands` as `args` names, matching citty's own runtime dispatch — its internal
 * `resolveSubCommand` does the same walk but is not exported. No aliases, and no attempt to skip a value-flag's
 * argument the way citty's own version does (`sgate rules --engine oxlint why --help` would misread `oxlint` as
 * a subcommand name); every command here takes its flags after the subcommand name, so revisit only if one ever
 * puts a value flag ahead of a nested subcommand name.
 */
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

/**
 * The same framed header `sgate check` prints, ahead of citty's own usage body — the three-line box only, not a
 * whole `ReporterContext`. Not colour-matched to that body: citty's `renderUsage` decides colour internally
 * from `NO_COLOR`/`TERM=dumb`/`CI`/`TEST` and *not* from `FORCE_COLOR` or TTY status, so where those two rules
 * disagree (`FORCE_COLOR` set while piped) header and body may differ in colour.
 */
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
