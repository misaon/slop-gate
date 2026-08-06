import { ENGINE_PREFERENCE, type Engine, type EngineId } from '@misaon/slop-gate-core'
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

// `EngineId` and `ENGINE_PREFERENCE` also carry engines the design has an arbitration position for but
// no package implements yet (`tsgolint`, `zizmor`, `eslint`). Offering those as a `--engine` value sends
// a reader after a run that cannot happen, so the choice is narrowed to what `defaultEngines` returns.
export function runnableEngineIds(rootDir: string): readonly EngineId[] {
  const implemented = new Set(defaultEngines(rootDir).map((engine) => engine.id))
  return ENGINE_PREFERENCE.filter((id) => implemented.has(id))
}
