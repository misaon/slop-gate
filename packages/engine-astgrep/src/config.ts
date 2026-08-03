import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EngineError,
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'
import { astGrepRuleById, type AstGrepLanguage } from './rules.ts'

/**
 * ast-grep's severity vocabulary is `error | warning | info | hint | off`; ours is
 * `error | warn | info | off`. Only the spelling of `warn` actually differs.
 *
 * Writing the elected level into the document at all is belt-and-braces: `normalizeDiagnostics`
 * (`packages/core/src/engine/normalize.ts`) derives a diagnostic's severity from the resolved level
 * or the registry's `severityDefault`, never from what the engine reported. It is written anyway
 * because a materialised config is something a user can be asked to paste into a bug report, and one
 * that disagrees with the ruleset it was materialised from is a red herring waiting to happen.
 */
const LEVEL_TO_ASTGREP: Readonly<Record<string, string>> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  off: 'off',
}

/** A YAML single-quoted scalar: inside one, a backslash is literal and only `'` needs escaping — which is exactly what a regex-carrying rule body needs. */
function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export type AstGrepRuleFile = {
  /** Every (rule, language) document written, in emission order. The count is what `run` asserts ast-grep actually loaded. */
  readonly documents: readonly { readonly engineRuleId: string; readonly language: AstGrepLanguage }[]
  readonly text: string
}

/**
 * Builds the multi-document rule file. Split out from the write so the assembly is testable without
 * a filesystem, and so `materializeAstGrepConfig` stays the thin `Engine` seam.
 *
 * **One document per (rule, language) pair.** ast-grep's `language:` field takes a single language,
 * and its extension mapping is not the one our `LanguageId` uses — see the comment on
 * `AstGrepLanguage`. Duplicate `id`s across documents are accepted by ast-grep and every finding
 * still reports the shared id, which is what keeps one `engineRuleId` per concept: two rule entries
 * claiming one concept would make arbitration elect one and silently discard the other's findings.
 */
export function buildAstGrepConfig(selection: EngineRuleSelection): AstGrepRuleFile {
  // These rules are this package's own, written here rather than configured, so the option half of a
  // setting has nothing to apply to and is deliberately dropped — which is also why `rulesetHash`
  // below need not fold it in (`EngineRuleSetting`: an adapter that ignores options owes nothing,
  // because identical inputs really do produce identical findings).
  const enabled = [...selection]
    .filter(([, [level]]) => level !== 'off')
    .sort(([a], [b]) => compareStrings(a, b))

  const documents: { engineRuleId: string; language: AstGrepLanguage }[] = []
  const blocks: string[] = []

  for (const [engineRuleId, [level]] of enabled) {
    const rule = astGrepRuleById(engineRuleId)
    // Arbitration only ever selects an id that came off a `RuleEntry`, so reaching this means the
    // registry and this package have drifted apart — the exact failure oxlint's `number_of_rules`
    // check exists to make loud, caught one step earlier here because we own both sides of it.
    if (rule === undefined) {
      throw new EngineError('astgrep', `no ast-grep rule is defined for elected rule id \`${engineRuleId}\``)
    }
    for (const language of rule.languages) {
      documents.push({ engineRuleId, language })
      blocks.push(
        [
          `id: ${engineRuleId}`,
          `language: ${language}`,
          `severity: ${LEVEL_TO_ASTGREP[level] ?? 'warning'}`,
          `message: ${quote(rule.message)}`,
          `note: ${quote(rule.note)}`,
          rule.body.trimEnd(),
        ].join('\n'),
      )
    }
  }

  return { documents, text: blocks.length === 0 ? '' : `${blocks.join('\n---\n')}\n` }
}

export async function materializeAstGrepConfig(
  selection: EngineRuleSelection,
  context: RunContext,
): Promise<EngineConfigHandle> {
  const config = buildAstGrepConfig(selection)
  const rulesetHash = hashJson(config.documents)

  await mkdir(context.tmpDir, { recursive: true })
  const path = join(context.tmpDir, `astgrep-rules.${rulesetHash.slice(0, 12)}.yml`)
  await writeFile(path, config.text, 'utf8')

  return {
    path,
    rulesetHash,
    // Documents, not logical rules: `--inspect summary` reports `effectiveRuleCount` over loaded
    // documents, and a rule covering three languages is three of them.
    ruleCount: config.documents.length,
    async dispose() {
      await rm(path, { force: true })
    },
  }
}
