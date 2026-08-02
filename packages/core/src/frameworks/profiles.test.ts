import { expect, test } from 'vitest'
import { compareStrings } from '../ordering.ts'
import { FRAMEWORK_PROFILES } from './profiles.ts'

/**
 * `defineProfile` drops an addition that does not clear `refuseEnable`'s bar rather than throwing,
 * because crashing a user's run over our own arithmetic is the wrong response. That choice is only
 * defensible while the shipped set never actually trips it, so this is the test that makes it so:
 * a profile whose measurement is short fails our build here, not a stranger's quietly.
 *
 * It reaches through `evaluate` deliberately — the refusal depends on the detection *evidence* as
 * well as the adjustment, so checking `consequences` alone would miss the one rule that is about
 * where a profile's authority comes from rather than about its numbers.
 */
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
