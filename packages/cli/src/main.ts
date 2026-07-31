import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCommand, runCommand, showUsage, type CommandDef } from 'citty'
import { EXIT_CODES } from './exit-codes.ts'

const packageDir = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(packageDir, '../package.json'), 'utf8')) as { version: string }

const subCommands = {
  check: () => import('./commands/check.ts').then((module) => module.check),
  // `init` is registered in Task 15, which creates ./commands/init.ts. Listing it here first
  // would fail typecheck and build against a module that does not exist yet.
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
 * replicates just that part below, using citty's own exported `showUsage`.
 */
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  const target = await resolveHelpTarget(rawArgs)
  await showUsage(target.cmd, target.parent)
} else if (rawArgs.length === 1 && (rawArgs[0] === '--version' || rawArgs[0] === '-v')) {
  console.log(version)
} else {
  try {
    await runCommand(main, { rawArgs })
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = EXIT_CODES.config
  }
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
