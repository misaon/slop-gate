import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  compareStrings,
  editsFromRewrite,
  type DerivedFix,
  type EngineRuleSelection,
  type FixTarget,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeOxlintConfig } from './config.ts'
import type { OxlintInvocation } from './resolve-binary.ts'

const exec = promisify(execFile)

/**
 * Which `--fix*` flag actually applies a given rule's rewrite. Verified against oxlint 1.76.0.
 *
 * **The three flags are mutually exclusive**: passing any two is rejected with `Error: '--fix
 * --fix-suggestions' is not expected in this context`, and because that arrives on stderr with the file
 * untouched, a caller that only checks whether the file changed reads it as "this rule had no fix". So
 * exactly one flag is chosen per rule, from the rule's own catalogue entry. They are also **not cumulative
 * tiers**, the more surprising half: `--fix` applies `fixable_dangerous_fix` rules (confirmed on
 * `unicorn/no-useless-spread`, which it rewrites) and `--fix-suggestions` does *not* apply a
 * `conditional_fix` (confirmed on `prefer-const`, which it leaves alone). They select a *kind* of change,
 * not a trust level, so `--fix` must never be relied on as the tier gate — that is the single-rule config,
 * built from a registry entry the caller already filtered by `RuleEntry.fixKind`.
 */
function flagFor(catalogueFix: string): string | null {
  if (catalogueFix === 'none' || catalogueFix === 'pending') return null
  if (catalogueFix.includes('dangerous')) return '--fix-dangerously'
  if (catalogueFix.includes('fix')) return '--fix'
  if (catalogueFix.includes('suggestion')) return '--fix-suggestions'
  return null
}

type CatalogueRule = { scope?: string; value?: string; fix?: string }

/**
 * `engineRuleId` -> the catalogue's `fix` string, keyed the way `rules` in a config file is keyed (bare for
 * `eslint`, `scope/rule` otherwise) so it can be looked up straight from a target.
 */
export async function loadFixCatalogue(invocation: OxlintInvocation): Promise<Map<string, string>> {
  const { stdout } = await exec(invocation.command, [...invocation.prefixArgs, '--rules', '--format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  })

  const catalogue = new Map<string, string>()
  for (const rule of JSON.parse(stdout) as CatalogueRule[]) {
    if (rule.value === undefined || rule.fix === undefined) continue
    catalogue.set(rule.scope === 'eslint' || rule.scope === undefined ? rule.value : `${rule.scope}/${rule.value}`, rule.fix)
  }
  return catalogue
}

export type DeriveOxlintFixesOptions = {
  invocation: OxlintInvocation
  targets: readonly FixTarget[]
  /**
   * The check run's own selection, read for one thing only: the target rule's options. Losing them is not
   * cosmetic, because `--fix` rewrites every occurrence the rule finds — a derivation configured with
   * `eqeqeq`'s default `always` would rewrite the `== null` comparisons a check configured with `smart`
   * deliberately exempted, producing edits for findings the user was never shown.
   */
  selection: EngineRuleSelection
  context: RunContext
  signal: AbortSignal
  /** Injectable so a test can drive the derivation without the real catalogue subprocess. */
  catalogue?: Map<string, string>
}

/**
 * The one-rule selection each derivation subprocess is configured from. The level is forced to `'error'`
 * rather than carried over, because oxlint applies a `--fix*` flag to any rule that is on and the level a
 * finding is *reported* at was already decided upstream; the options are carried over verbatim, because
 * those change what the rule matches. A rule absent from the selection gets no options rather than being
 * skipped: every target came off a diagnostic that survived arbitration, so its rule was elected by
 * construction, and dropping it would silently lose fixes.
 */
function singleRuleSelection(engineRuleId: string, selection: EngineRuleSelection): EngineRuleSelection {
  const [, ...options] = selection.get(engineRuleId) ?? ['error']
  return new Map([[engineRuleId, ['error', ...options] as const]])
}

/**
 * Produces `(range, replacement)` edits for oxlint findings by running oxlint's own `--fix` over **copies**
 * of the affected files and diffing the result.
 *
 * **oxlint 1.76.0 exposes no fix data in any output format.** Checked directly, not assumed: `--format
 * json` carries `message`/`code`/`severity`/`url`/`help`/`labels` and nothing else; `--format sarif` emits
 * results with no `fixes` array (SARIF has a standard place for them); `--format agent` is one line of text
 * per finding; there is no `--fix-dry-run`. The only way oxlint will tell you what a fix contains is to let
 * it perform one. And handing the whole rewritten file to the fix pipeline is not an option either — it
 * would arrive as one opaque buffer with no rule attached, while spec §11 step 2's arbitration is defined
 * over `(range, replacement, kind, ruleRefKey)` tuples. So the run is done **one rule at a time**, which is
 * what makes each resulting edit attributable and therefore arbitrable against another rule's: one
 * subprocess per rule with at least one target, plus one for the catalogue — not one per finding or file.
 *
 * **Copies, because `oxlint --fix` writes in place.** Pointing it at the user's tree would put the engine's
 * unarbitrated output on disk before overlap resolution, oscillation detection, the tier gate or the dry-run
 * rail ever saw it — every guarantee in §11 at once. The copies live under `context.tmpDir` and are removed
 * afterwards; the user's files are only ever *read* here. A copy keeps the file's repo-relative path inside
 * the sandbox, because oxlint chooses its parser from the extension and reports the path back, and
 * `--disable-nested-config` keeps it from discovering a config on the way up out of the sandbox.
 *
 * **Known limit.** Edits are attributed to a `(file, rule)` pair, not to an individual finding. Within one
 * pair every finding shares a rule id, tier and priority, so arbitration cannot tell the difference — but an
 * inline suppression can, and that distinction is handled by the caller refusing to build targets for a file
 * containing any suppression directive (see `run/fix.ts`), not here.
 */
export async function deriveOxlintFixes(options: DeriveOxlintFixesOptions): Promise<DerivedFix[]> {
  if (options.targets.length === 0) return []

  const catalogue = options.catalogue ?? (await loadFixCatalogue(options.invocation))

  const byRule = new Map<string, Set<string>>()
  for (const target of options.targets) {
    if (flagFor(catalogue.get(target.engineRuleId) ?? 'none') === null) continue
    const files = byRule.get(target.engineRuleId) ?? new Set()
    files.add(target.file)
    byRule.set(target.engineRuleId, files)
  }
  if (byRule.size === 0) return []

  const sandboxRoot = join(options.context.tmpDir, `fix-derive-${process.pid}-${Date.now().toString(36)}`)
  const derived: DerivedFix[] = []

  try {
    for (const [engineRuleId, fileSet] of [...byRule].sort(([a], [b]) => compareStrings(a, b))) {
      const flag = flagFor(catalogue.get(engineRuleId)!)!
      const files = [...fileSet].sort(compareStrings)
      const sandbox = join(sandboxRoot, engineRuleId.replaceAll('/', '__'))

      const originals = new Map<string, Uint8Array>()
      for (const file of files) {
        const bytes: Uint8Array = await readFile(join(options.context.rootDir, file))
        originals.set(file, bytes)
        await mkdir(dirname(join(sandbox, file)), { recursive: true })
        await writeFile(join(sandbox, file), bytes)
      }

      const handle = await materializeOxlintConfig(singleRuleSelection(engineRuleId, options.selection), {
        ...options.context,
        tmpDir: sandbox,
      })

      try {
        await exec(
          options.invocation.command,
          [...options.invocation.prefixArgs, '--config', handle.path, '--disable-nested-config', flag, '--silent', ...files],
          { cwd: sandbox, signal: options.signal, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
        )
      } catch (error) {
        // oxlint exits non-zero whenever anything is still reported after fixing, which is the normal
        // outcome — a rule with a conditional fix leaves the cases it cannot rewrite behind. The file on
        // disk is what matters, so the exit code is deliberately not consulted; a genuine failure shows up
        // as an unchanged file, i.e. no derived edits, which is the safe direction. Cancellation propagates.
        if (options.signal.aborted) throw error
      } finally {
        await handle.dispose()
      }

      for (const file of files) {
        const before = originals.get(file)!
        const after: Uint8Array = await readFile(join(sandbox, file))
        const edits = editsFromRewrite(before, after)
        if (edits.length > 0) derived.push({ file, engineRuleId, edits })
      }
    }
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true })
  }

  return derived
}
