import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  EngineError,
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'
import { CSS_PARSE_ERROR_RULE_ID } from './parse.ts'
import { FOREIGN_SUPPRESSION_RULE_ID, ruleByEngineRuleId } from './rules.ts'

const LEVEL_TO_BIOME: Readonly<Record<string, string>> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  off: 'off',
}

/**
 * Biome only reads a configuration file called exactly this, and `--config-path` may name either the
 * file or the directory holding it. Written under a per-ruleset subdirectory of `tmpDir` rather than
 * beside the other engines' ephemeral configs — see `assertCleanConfigDir`.
 */
const CONFIG_BASENAME = 'biome.json'

/**
 * Well above any hand-authored stylesheet; the largest in a 1729-file corpus was 176 KB.
 *
 * Biome's own default is 1 MiB, and a file above it is **not linted and barely says so**: the run
 * emits a warning whose `message` is the empty string, leaves `summary.skipped` at 0, and otherwise
 * looks like a clean result. Raising the ceiling here is the first half of that guard; comparing
 * `summary.unchanged` against the batch size in `parseBiomeOutput` is the half that actually catches
 * it, because a ceiling can only be set too low, never proved high enough.
 */
const MAX_FILE_BYTES = 64 * 1024 * 1024

/**
 * The handle this engine hands back, and gets back in `run`.
 *
 * `enabledRuleIds` carries the elected selection forward so `run` can check every finding against
 * it. Biome's JSON report has no `number_of_rules`, so unlike `engine-oxlint` there is no count to
 * compare — the selection itself is the only thing an unelected finding can be caught against, and
 * `EngineConfigHandle` has nowhere to put it. A superset of the core type rather than a change to
 * it: this adapter both creates and consumes the object, so nothing else needs to know.
 */
export type BiomeCssConfigHandle = EngineConfigHandle & { readonly enabledRuleIds: ReadonlySet<string> }

export async function materializeBiomeCssConfig(
  selection: EngineRuleSelection,
  context: RunContext,
): Promise<BiomeCssConfigHandle> {
  const elected = [...selection].filter(([, level]) => level !== 'off').map(([engineRuleId]) => engineRuleId)
  const enabled = [...selection]
    .filter(([engineRuleId, level]) => {
      if (level === 'off') return false
      // Both synthetic: one is the adapter's report that Biome could not parse a file, the other its
      // report that a file carries a `biome-ignore`. Neither is a rule Biome's config format knows,
      // and writing either into `linter.rules` makes Biome reject the whole configuration.
      return engineRuleId !== CSS_PARSE_ERROR_RULE_ID && engineRuleId !== FOREIGN_SUPPRESSION_RULE_ID
    })
    .sort(([a], [b]) => compareStrings(a, b))

  const rules: Record<string, Record<string, string>> = {}
  for (const [engineRuleId, level] of enabled) {
    const rule = ruleByEngineRuleId(engineRuleId)
    if (rule === undefined) {
      throw new EngineError('biome-css', `elected rule '${engineRuleId}' is not a known biome CSS rule`)
    }
    ;(rules[rule.group] ??= {})[rule.engineRuleId] = LEVEL_TO_BIOME[level] ?? 'warn'
  }

  const config = {
    // `root: true` and a dedicated directory together stop Biome merging anything of the user's:
    // `--config-path` disables its normal upward search, but its project scanner still walks *down*
    // from the config's own directory and hard-fails on a nested configuration it finds there.
    root: true,
    // `recommended: false` is load-bearing in the way oxlint's `categories` block is. Without it
    // Biome enables its whole recommended set — 20-odd CSS rules — regardless of what `rules` lists,
    // so unelected rules report and bypass arbitration entirely. `parseBiomeOutput` fails the run if
    // one ever does, which is the second guard on the same defect.
    linter: { enabled: true, rules: { recommended: false, ...rules } },
    // Nothing but linting. `oxfmt` owns formatting (spec §13.1) and Biome's assist actions would be
    // a second, unregistered source of findings.
    formatter: { enabled: false },
    assist: { enabled: false },
    css: {
      linter: { enabled: true },
      // **Both keys, always, and they are set together for a measured reason.** With
      // `tailwindDirectives` on and `cssModules` left unset, Biome silently stops recognising
      // `.module.css` as a CSS Modules file — isolated to that single key against 2.5.6 — and
      // `:global(...)` becomes an unknown pseudo-class. That produced **265 false findings across 36
      // files** on the measurement corpus, all of them artefacts of the pairing rather than of either
      // key alone. Setting `cssModules` restores it. Neither key is safe to reason about on its own.
      parser: { cssModules: true, tailwindDirectives: true },
    },
    files: { maxSize: MAX_FILE_BYTES },
  }
  const rulesetHash = hashJson(config)

  const dir = join(context.tmpDir, `biome-css.${rulesetHash.slice(0, 12)}`)
  await mkdir(dir, { recursive: true })
  await assertCleanConfigDir(dir)
  const path = join(dir, CONFIG_BASENAME)
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')

  return {
    path,
    rulesetHash,
    ruleCount: enabled.length,
    // The full election, synthetics included — `run` needs to know whether the adapter's own
    // `foreign-suppression` and `css-parse-error` reports were elected, and neither appears in the
    // config file above because Biome would reject them.
    enabledRuleIds: new Set(elected),
    async dispose() {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Fails loudly if anything Biome would treat as a second configuration shares the directory.
 *
 * The directory holding `--config-path` becomes Biome's project root and **is scanned**. A
 * `biome.json` anywhere beneath it aborts the entire run with "Found a nested root configuration,
 * but there's already a root configuration" — no findings, no partial result, exit 1, and an error
 * text about a file the user never wrote. Observed directly. Giving the config its own
 * hash-named directory makes that impossible in practice; this check is what turns a future change
 * that reuses a shared `tmpDir` into an explicit failure here instead of a baffling one from Biome.
 */
async function assertCleanConfigDir(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  const intruder = entries.find(
    (entry) => entry.name !== CONFIG_BASENAME && (entry.isDirectory() || /^biome\.jsonc?$/.test(entry.name)),
  )
  if (intruder !== undefined) {
    throw new EngineError(
      'biome-css',
      `the biome config directory must hold nothing but ${CONFIG_BASENAME}, but it also holds '${intruder.name}'. ` +
        'Biome scans the directory its config lives in and aborts on any nested configuration it finds there.',
    )
  }
}
