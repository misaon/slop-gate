import { defineCommand, renderUsage, runCommand, type CommandDef } from 'citty'
import { displayWidth, padEndDisplay } from '@misaon/slop-gate-reporters'
import { EXIT_CODES } from './exit-codes.ts'
import { readCliVersion } from './version.ts'

const version = readCliVersion()

const subCommands = {
  check: () => import('./commands/check.ts').then((module) => module.check),
  fix: () => import('./commands/fix.ts').then((module) => module.fix),
  init: () => import('./commands/init.ts').then((module) => module.init),
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
 * citty's own `runMain` provides `--help`/`--version` handling, but on every usage error
 * (unknown subcommand, missing argument, no command given) it calls `process.exit()` directly
 * instead of throwing — bypassing `process.exitCode`, the one thing this layer owns, and
 * reporting exit 1 ("findings") for something that never ran a check at all. `runCommand` throws
 * on those same conditions instead (verified directly: an unknown subcommand raises a `CLIError`
 * coded `E_UNKNOWN_COMMAND`; no command given raises one coded `E_NO_COMMAND`), so the catch
 * below can map them to `EXIT_CODES.config` correctly. The cost: `runCommand` has no
 * `--help`/`--version` handling of its own — verified directly: calling it with
 * `['check', '--help']` does not show usage, it starts running `check` for real — so this file
 * replicates just that part below, using citty's own exported `renderUsage`.
 *
 * One `try` around the whole dispatch, not just the `runCommand` branch: `resolveHelpTarget`
 * dynamically imports a subcommand, which transitively loads the engine layer, so a broken
 * oxlint install makes `sgate check --help` reject. Left unhandled that exits 1 — "the check
 * found problems" — for a run that never checked anything, which is the exact confusion this
 * layer exists to prevent. A plain `includes` scan for the help flags is enough here: no
 * subcommand takes positional arguments, so `--help` cannot arrive as another flag's value.
 */
try {
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    const target = await resolveHelpTarget(rawArgs)
    // `renderUsage` (also citty's own, what `showUsage` calls internally) returns the usage body as
    // a plain string rather than printing it — cheap to prepend the same framed header `check`'s
    // output uses, without reimplementing citty's own argument/subcommand rendering.
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
 * Walks as many levels of `subCommands` as `args` names, matching citty's own runtime dispatch
 * (`runCommand` recurses into a matched subcommand's own `subCommands`, one positional token at a
 * time — see `command.ts`'s internal `resolveSubCommand`, which does the same walk but is not
 * exported). No aliases, and no attempt to skip a value-flag's argument the way citty's own
 * version does (e.g. `sgate rules --engine oxlint why --help` would misread `oxlint` as a
 * subcommand name) — every command in this CLI takes its flags after the subcommand name, so that
 * case does not arise in practice; revisit if one ever puts a value flag ahead of a nested
 * subcommand name.
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
 * The same framed header `sgate check` prints, ahead of citty's own usage body. Deliberately not
 * the full `pretty` reporter: this only needs the three-line box, not per-file grouping or code
 * frames, so it draws it directly rather than constructing a whole `ReporterContext`.
 *
 * Not colour-matched to citty's own usage text: citty's `renderUsage` decides colour internally
 * (checking `NO_COLOR`/`TERM=dumb`/`CI`/`TEST`, but not `FORCE_COLOR` or TTY status — a narrower
 * rule than `check`'s own `supportsColor`), and reimplementing citty's colour decision here just to
 * match it belongs to "reimplementing usage rendering," which this is deliberately avoiding. In the
 * rare case those two rules disagree (e.g. `FORCE_COLOR` set while piped), the header and the usage
 * body below it may differ in colour even though both render correctly on their own.
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
