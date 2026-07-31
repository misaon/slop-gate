import { defineCommand, runMain } from 'citty'
import { EXIT_CODES } from './exit-codes.ts'

const main = defineCommand({
  meta: {
    name: 'sgate',
    description: 'slop-gate — one quality gate over many analysis engines',
  },
  subCommands: {
    check: () => import('./commands/check.ts').then((module) => module.check),
    // `init` is registered in Task 15, which creates ./commands/init.ts. Listing it here first
    // would fail typecheck and build against a module that does not exist yet.
  },
})

await runMain(main).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = EXIT_CODES.config
})
