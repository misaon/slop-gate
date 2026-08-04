import { expect, test } from 'vitest'
import { compareStrings } from '../ordering.ts'
import { FRAMEWORK_PROFILES } from './profiles.ts'

test('no shipped profile has an addition refused, on evidence that would let one through', async () => {
  const context = {
    inventory: { root: '/repo', files: [], languages: new Set<never>(), workspaces: [] },
    manifests: [
      {
        file: 'package.json',
        workspace: '',
        dependencies: [
          { name: '@angular/core', field: 'dependencies' as const },
          { name: '@mikro-orm/core', field: 'dependencies' as const },
          { name: '@nestjs/core', field: 'dependencies' as const },
          { name: '@nestjs/platform-express', field: 'dependencies' as const },
          { name: 'vitepress', field: 'devDependencies' as const },
          { name: 'vitest', field: 'devDependencies' as const },
        ],
      },
    ],
    readText: async () => null,
  }

  for (const profile of FRAMEWORK_PROFILES) {
    const outcome = await profile.evaluate(context)
    if (outcome === null || !('rejected' in outcome)) continue
    expect(outcome.rejected, `${profile.id} had an addition refused`).toEqual([])
  }
})

test('profiles are listed in the id order detection relies on', () => {
  const ids = FRAMEWORK_PROFILES.map((profile) => profile.id)
  expect(ids).toEqual([...ids].sort(compareStrings))
})
