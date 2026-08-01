import { defineCommand } from 'citty'

/**
 * `sgate rules [list | why <concept> | conflicts]` — spec §5.4's governance commands. `diff`
 * (needs the lockfile, a separate slice) and `search` are not implemented here; see
 * `.superpowers/rules-commands-report.md`.
 *
 * No `run` or `default`: exactly like top-level `sgate` itself, `sgate rules` with no subcommand
 * is a usage error ("No command specified"), not an implicit alias for one particular subcommand.
 */
export const rules = defineCommand({
  meta: { name: 'rules', description: 'Inspect the rule registry: effective rules, arbitration and conflicts' },
  subCommands: {
    list: () => import('./list.ts').then((module) => module.list),
    why: () => import('./why.ts').then((module) => module.why),
    conflicts: () => import('./conflicts.ts').then((module) => module.conflicts),
  },
})
