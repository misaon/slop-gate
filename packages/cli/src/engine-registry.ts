import type { Engine } from '@misaon/slop-gate-core'
import { createActionlintEngine } from '@misaon/slop-gate-engine-actionlint'
import { createAstGrepEngine } from '@misaon/slop-gate-engine-astgrep'
import { createBiomeCssEngine } from '@misaon/slop-gate-engine-biome-css'
import { createDepsSecurityEngine } from '@misaon/slop-gate-engine-deps-security'
import { createHadolintEngine } from '@misaon/slop-gate-engine-hadolint'
import { createKnipEngine } from '@misaon/slop-gate-engine-knip'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { createSchemaEngine } from '@misaon/slop-gate-engine-schema'
import { createOxfmtEngine } from '@misaon/slop-gate-engine-oxfmt'
import { createTscEngine } from '@misaon/slop-gate-engine-tsc'

export function defaultEngines(rootDir: string, configFile?: string, ignore?: readonly string[]): Engine[] {
  return [
    createOxlintEngine(),
    createOxfmtEngine(),
    createTscEngine({ rootDir }),
    createKnipEngine({
      rootDir,
      ...(configFile === undefined ? {} : { configFile }),
      ...(ignore === undefined ? {} : { ignore }),
    }),
    createAstGrepEngine(),
    createSchemaEngine(),
    createActionlintEngine(),
    createBiomeCssEngine(),
    createDepsSecurityEngine(),
    createHadolintEngine(),
  ]
}
