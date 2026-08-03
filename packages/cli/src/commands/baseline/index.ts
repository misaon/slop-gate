import { defineCommand } from 'citty'

/**
 * `sgate baseline [create | update | show]` — spec §12.2.
 *
 * **`check` reads, these two write, and only `create` can grow the file.** A gate that pruned or extended its own
 * pass criteria while running in CI would either dirty the worktree or quietly accept whatever the branch
 * introduced, so `sgate check` reports what the baseline accepted and what no longer matches and changes nothing.
 *
 * No `run` or `default`, matching `sgate rules`: a bare `sgate baseline` is a usage error rather than an implicit
 * alias for whichever subcommand seemed most likely — and here the plausible guesses write files.
 */
export const baseline = defineCommand({
  meta: { name: 'baseline', description: 'Accept the findings that already exist, so only new ones fail the build' },
  subCommands: {
    create: () => import('./create.ts').then((module) => module.create),
    update: () => import('./update.ts').then((module) => module.update),
    show: () => import('./show.ts').then((module) => module.show),
  },
})
