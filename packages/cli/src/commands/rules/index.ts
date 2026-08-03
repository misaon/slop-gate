import { defineCommand } from 'citty'

/**
 * `sgate rules [list | why <concept> | conflicts]` — spec §5.4's governance commands. The other two that section
 * lists are deferred rather than forgotten: `diff` compares two effective rulesets and needs the rule lockfile,
 * and `search` queries across concepts and engine rule ids; both belong to the same later slice as the lockfile.
 *
 * No `run` or `default`: like top-level `sgate` itself, `sgate rules` with no subcommand is a usage error, not an
 * implicit alias for one particular subcommand.
 */
export const rules = defineCommand({
  meta: { name: 'rules', description: 'Inspect the rule registry: effective rules, arbitration and conflicts' },
  subCommands: {
    list: () => import('./list.ts').then((module) => module.list),
    why: () => import('./why.ts').then((module) => module.why),
    conflicts: () => import('./conflicts.ts').then((module) => module.conflicts),
  },
})
