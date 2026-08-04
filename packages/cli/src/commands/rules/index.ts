import { defineCommand } from 'citty'

export const rules = defineCommand({
  meta: { name: 'rules', description: 'Inspect the rule registry: effective rules, arbitration and conflicts' },
  subCommands: {
    list: () => import('./list.ts').then((module) => module.list),
    why: () => import('./why.ts').then((module) => module.why),
    conflicts: () => import('./conflicts.ts').then((module) => module.conflicts),
  },
})
