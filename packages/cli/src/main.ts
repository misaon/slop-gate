import { defineCommand, renderUsage, runCommand, type CommandDef } from 'citty'
import { displayWidth, padEndDisplay } from '@misaon/slop-gate-reporters'
import { EXIT_CODES } from './exit-codes.ts'
import { readCliVersion } from './version.ts'

const version = readCliVersion()

const subCommands = {
  check: () => import('./commands/check.ts').then((module) => module.check),
  init: () => import('./commands/init.ts').then((module) => module.init),
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
 * A deliberately simple, one-level lookup matching this CLI's actual shape: a flat list of
 * subcommands, no aliases, no nesting. citty's own equivalent (`resolveSubCommand`) handles both
 * and is not exported; if `init` or a later command grows either, this needs revisiting.
 */
async function resolveHelpTarget(args: readonly string[]): Promise<{ cmd: CommandDef; parent?: CommandDef }> {
  const name = args.find((arg) => !arg.startsWith('-'))
  const loader =
    name === undefined ? undefined : (subCommands as unknown as Record<string, (() => Promise<CommandDef>) | undefined>)[name]
  if (loader === undefined) return { cmd: main }
  return { cmd: await loader(), parent: main }
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
