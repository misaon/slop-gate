import { join, resolve } from 'node:path'
import { buildRuleHistory, type RuleHistory } from '../scripts/history.ts'

// A separate process because ESM has no cache eviction: busting the entry specifier does not
// re-evaluate its imports, so an in-process reload returns the registry as it was at boot. It also
// contains a parse failure mid-keystroke, leaving the server on the last good payload.
const repoRoot = resolve(import.meta.dirname, '../../..')

const core = (await import(join(repoRoot, 'packages', 'core', 'src', 'index.ts'))) as typeof import('@misaon/slop-gate-core')

const rules = core.buildRuleCatalogue()
const history = await buildRuleHistory(repoRoot).catch((): RuleHistory => ({ origins: {}, removed: [] }))

process.stdout.write(
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    rules,
    summary: core.summariseCatalogue(rules),
    impacts: core.IMPACTS,
    groupImpact: core.GROUP_IMPACT,
    history,
  }),
)
