import { defineCommand } from 'citty'

export const baseline = defineCommand({
  meta: { name: 'baseline', description: 'Accept the findings that already exist, so only new ones fail the build' },
  subCommands: {
    create: () => import('./create.ts').then((module) => module.create),
    update: () => import('./update.ts').then((module) => module.update),
    show: () => import('./show.ts').then((module) => module.show),
  },
})
