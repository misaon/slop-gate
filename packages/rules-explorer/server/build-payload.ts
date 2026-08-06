import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRuleHistory, type RuleHistory } from '../scripts/history.ts'

/**
 * Builds the payload and writes it to stdout as JSON.
 *
 * A separate process on purpose. ESM has no cache eviction and busting the entry's specifier does not
 * re-evaluate its imports, so an in-process reload returns the registry as it was at boot — measured:
 * the generation counter moved and the value did not. A fresh process is the only way to be sure the
 * answer is the source on disk right now.
 *
 * It also contains the failure. Source being edited does not always parse, and a child that exits
 * non-zero leaves the server serving the last good payload instead of dying mid-keystroke.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const core = (await import(join(repoRoot, 'packages', 'core', 'src', 'index.ts'))) as typeof import('@misaon/slop-gate-core')

const rules = core.buildRuleCatalogue()
const history = await buildRuleHistory(repoRoot).catch((): RuleHistory => ({ origins: {}, removed: [] }))

process.stdout.write(
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    rules,
    summary: core.summariseCatalogue(rules),
    impacts: core.IMPACTS,
    history,
  }),
)
