import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { writeFileAtomic } from '../cache/atomic-write.ts'
import { hashJson } from '../cache/keys.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import type { Diagnostic, Edit, FixKind } from '../diagnostics/types.ts'
import type { FileSource } from '../discovery/inventory.ts'
import type { Engine, EngineRuleOptions, FixTarget, RunContext } from '../engine/types.ts'
import { LEVEL_TO_SEVERITY } from '../engine/normalize.ts'
import { engineAdjustmentsFor } from '../frameworks/adjustments.ts'
import type { FrameworkDetection } from '../frameworks/types.ts'
import { parseSuppressions } from '../suppressions/parse.ts'
import { applyEdits } from '../fix/apply.ts'
import { arbitrateEdits } from '../fix/arbitrate.ts'
import { unifiedDiff } from '../fix/diff.ts'
import { createOscillationLedger } from '../fix/oscillation.ts'
import { FIX_TIER_RANK, type CandidateEdit, type DroppedEdit, type FixTier } from '../fix/types.ts'
import { inspectWorktree, type InspectWorktreeOptions, type WorktreeState } from '../fix/worktree.ts'
import { compareStrings } from '../ordering.ts'
import { buildPlan } from '../planner/plan.ts'
import { ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'
import { runCheck } from './check.ts'
import { resolveRun } from './resolve-run.ts'

export const DEFAULT_MAX_PASSES = 10

export type FixOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  /** Highest fix tier to apply. `'safe'` unless the user opted in with `--suggest` or `--unsafe`. */
  tier?: FixTier
  /** Print a diff, write nothing. Skips the worktree rail — there is nothing to protect. */
  dryRun?: boolean
  /** Proceed even though the git worktree has uncommitted changes. */
  allowDirty?: boolean
  maxPasses?: number
  signal?: AbortSignal
  /** Injectable for tests, forwarded to `inspectWorktree`. */
  worktree?: InspectWorktreeOptions
}

export type FixedFile = {
  readonly file: string
  /** Every rule that contributed an applied edit to this file, deduplicated and sorted. */
  readonly rules: readonly string[]
  readonly edits: number
  /** Unified diff between the file's original content and its final content. Always computed. */
  readonly diff: string
}

export type FixRefusal = {
  readonly reason: 'dirty-worktree' | 'no-git' | 'worktree-unknown' | 'engine-failed'
  readonly message: string
}

export type FixResult = {
  readonly tier: FixTier
  readonly dryRun: boolean
  /** Files whose content changed. Empty for a clean run and for a refusal. */
  readonly files: readonly FixedFile[]
  /** Applied edits per rule, ordered by count descending then rule id. */
  readonly rules: readonly { readonly ruleId: string; readonly count: number }[]
  /** `config.fix-oscillation` diagnostics, one per file that had to stop (spec §11 step 5). */
  readonly oscillations: readonly Diagnostic[]
  readonly passes: number
  /**
   * True when the loop stopped without reaching a fixed point — either `--dry-run` (which can only
   * ever see one pass, because a second needs the engines to read changed files back off disk) or
   * `maxPasses` exhausted. A caller must not report the run as complete when this is set.
   */
  readonly truncated: boolean
  /** What the first pass saw, before anything was applied — the honest "how much of this is fixable". */
  readonly initial: {
    readonly findings: number
    readonly withFix: Readonly<Record<FixKind, number>>
  }
  /** Candidate edits that were gathered and not applied, by why. */
  readonly skipped: {
    readonly aboveTier: number
    readonly outsideInventory: number
    readonly overlap: number
    readonly outOfRange: number
  }
  readonly refusal?: FixRefusal
  readonly engineFailures: readonly { readonly engine: string; readonly message: string }[]
}

type FileState = {
  /** Content at the start of the run, for the diff and for the oscillation seed. */
  readonly original: Uint8Array
  current: Uint8Array
  readonly rules: Set<string>
  edits: number
}

/**
 * `sgate fix` — spec §11.
 *
 * Everything here is arranged around one fact: this is the only command in the repository that
 * writes to a user's source. So the order is refuse-first, and every step that could put wrong bytes
 * on disk has something above it that would rather do nothing.
 *
 * **What is not implemented, and must not be assumed:** spec §11 step 6, "formatting runs last,
 * always". It rests on a formatter engine owning `formatting.*` (§5.3), and no formatter adapter
 * exists — `oxfmt` is a known engine id with nothing behind it. The consequence is concrete and worth
 * stating where the code is rather than only in the spec: **nothing here guarantees a fix cannot
 * leave formatting the repository's own formatter would undo.** An edit that produces a long line, a
 * different quote style or an import in the wrong position is written exactly as the engine produced
 * it. Run your formatter after `sgate fix` until that step exists.
 *
 * The loop is: check → gather → arbitrate → apply → write → repeat. Passes exist because dropping an
 * overlap loser (step 2) is only safe if it gets another chance, and because a fix can expose a
 * finding that was previously hidden. Convergence is by fixed point, bounded by `maxPasses`, with
 * `createOscillationLedger` catching the specific non-convergence — two rules rewriting each other —
 * that the bound alone would turn into "we stopped after ten passes, the file is in one of two
 * states, good luck".
 */
export async function runFix(options: FixOptions): Promise<FixResult> {
  const tier = options.tier ?? 'safe'
  const dryRun = options.dryRun ?? false
  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES
  const signal = options.signal ?? new AbortController().signal

  const empty = {
    tier,
    dryRun,
    files: [],
    rules: [],
    oscillations: [],
    passes: 0,
    truncated: false,
    initial: { findings: 0, withFix: { safe: 0, suggested: 0, unsafe: 0 } },
    skipped: { aboveTier: 0, outsideInventory: 0, overlap: 0, outOfRange: 0 },
    engineFailures: [],
  } satisfies FixResult

  // Rail 1, before anything is read or run. `--dry-run` is exempt: the rail exists so a user can
  // `git diff` the tool's edits apart from their own and revert them, and a run that writes nothing
  // has no edits to separate.
  if (!dryRun && options.allowDirty !== true) {
    const state = await inspectWorktree(options.rootDir, options.worktree ?? {})
    const refusal = refuseFor(state)
    if (refusal !== null) return { ...empty, refusal }
  }

  // Discovery is run once here, ahead of the loop, purely to build the write allowlist — `runCheck`
  // does its own each pass and does not hand the inventory back. It is the enforcement point for
  // spec §11's "files outside the inventory or matched by `ignore` are never touched": the inventory
  // has already had `.gitignore`, `.slopignore` and config `ignore` applied to it (§7), so
  // membership in this set *is* the ignore check, rather than a second reimplementation of it that
  // could disagree. It is genuinely load-bearing rather than belt-and-braces — a project-granularity
  // engine is explicitly allowed to report against files the inventory never contained (see
  // `runProjectAssignment`), and a fix attached to one of those must not be applied.
  const { inventory, resolver, entries, frameworks, election } = await resolveRun({
    rootDir: options.rootDir,
    config: options.config,
    ...(options.configFile === undefined ? {} : { configFile: options.configFile }),
    engines: options.engines,
    ...(options.entries === undefined ? {} : { entries: options.entries }),
    ...(options.fileSource === undefined ? {} : { fileSource: options.fileSource }),
    signal,
  })
  const writable = new Set(inventory.files.map((file) => file.path))
  // The same per-engine rule options `streamCheck` hands each adapter, rebuilt here because
  // `withDerivedFixes` runs *outside* `runCheck` and would otherwise re-materialise the engine's
  // config with the engine's own defaults. That is not a cosmetic difference for an engine that
  // derives fixes by re-running itself over a whole file: oxlint's `--fix` pass rewrites every
  // occurrence the rule finds, so a fix run configured with `eqeqeq`'s default `always` would
  // rewrite the `== null` comparisons the check run deliberately exempted with `smart` — edits for
  // findings the user was never shown.
  const ruleOptionsByEngine = new Map(
    buildPlan({ engines: options.engines, inventory, election, resolver }).map((assignment) => [
      assignment.engineId,
      assignment.ruleOptions,
    ]),
  )
  // Spec §11 step 2's first tiebreak. Read off the registry rather than carried on the diagnostic:
  // `RuleEntry.priority` is the reviewable, committed declaration of how a rule's fixes rank against
  // another's, and widening `Diagnostic` to ferry it would put a second copy of that number in the
  // per-file cache where it could go stale against the registry that produced it.
  const priorities = new Map(entries.map((entry) => [ruleRefKey(entry), entry.priority]))

  const ledger = createOscillationLedger()
  const states = new Map<string, FileState>()
  const oscillations: Diagnostic[] = []
  const appliedByRule = new Map<string, number>()
  const skipped = { aboveTier: 0, outsideInventory: 0, overlap: 0, outOfRange: 0 }
  let initial = empty.initial
  let passes = 0
  let truncated = false
  let engineFailures: readonly { engine: string; message: string }[] = []

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    passes = pass

    const check = await runCheck({
      rootDir: options.rootDir,
      config: options.config,
      ...(options.configFile === undefined ? {} : { configFile: options.configFile }),
      engines: options.engines,
      ...(options.entries === undefined ? {} : { entries: options.entries }),
      ...(options.fileSource === undefined ? {} : { fileSource: options.fileSource }),
      // Never cached. The loop rewrites files between passes, so a cache entry keyed on the previous
      // content is stale by construction; and a `fix` run has no business leaving entries behind for
      // intermediate buffer states no `check` will ever see again.
      useCache: false,
      fixTier: tier,
      signal,
    })

    // Rail 2. An engine that failed contributed nothing to this pass's candidate set, which means
    // arbitration made overlap decisions without seeing edits that might have won them. Fewer fixes
    // would be tolerable; *differently chosen* fixes are not, so nothing from this pass is written.
    if (check.engineFailures.length > 0) {
      engineFailures = check.engineFailures
      return {
        ...finish(),
        refusal: {
          reason: 'engine-failed',
          message:
            `${check.engineFailures.map((failure) => failure.engine).join(', ')} failed during pass ${pass}. ` +
            `No edits from this pass were written — a partial engine set makes overlap arbitration unsound.`,
        },
      }
    }

    const diagnostics = await withDerivedFixes(check.diagnostics, {
      engines: options.engines,
      rootDir: options.rootDir,
      tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
      tier,
      entries,
      writable,
      frameworks,
      ruleOptionsByEngine,
      signal,
    })

    // Measured *after* the derivation, not before it: an engine that has to re-run itself to produce
    // a fix (oxlint) attaches nothing during `runCheck`, so summarising `check.diagnostics` would
    // report every oxlint-fixable finding as unfixable — and that number is exactly what a user reads
    // to decide whether `--suggest` or `--unsafe` would help.
    if (pass === 1) initial = summariseFindings(diagnostics)

    const byFile = gather(diagnostics, { tier, writable, rootDir: options.rootDir, ledger, priorities, skipped })
    if (byFile.size === 0) break

    let changedThisPass = false

    for (const [file, candidates] of [...byFile].sort(([a], [b]) => compareStrings(a, b))) {
      const state = await ensureState(states, ledger, options.rootDir, file)

      const { applied, dropped } = arbitrateEdits(candidates, state.current.length)
      countDrops(dropped, skipped)
      if (applied.length === 0) continue

      const next = applyEdits(state.current, applied)
      const rules = [...new Set(applied.map((edit) => edit.ruleId))].sort(compareStrings)

      // Recorded *before* the write, and the write is skipped when it fires: the buffer being
      // recorded is one this file has already been in, so putting it on disk is the step that makes
      // the cycle permanent. The file stays at the previous pass's content — a state the pipeline
      // did choose — rather than at an arbitrary point in the loop.
      const oscillation = ledger.record(file, next, rules)
      if (oscillation !== null) {
        const diagnostic = oscillationDiagnostic(file, oscillation.rules, oscillation.passes, resolver)
        if (diagnostic !== null) oscillations.push(diagnostic)
        continue
      }

      state.current = next
      state.edits += applied.length
      for (const edit of applied) {
        state.rules.add(edit.ruleId)
        appliedByRule.set(edit.ruleId, (appliedByRule.get(edit.ruleId) ?? 0) + 1)
      }
      changedThisPass = true

      if (!dryRun) await writeFileAtomic(join(options.rootDir, file), next)
    }

    if (!changedThisPass) break

    // A dry run cannot have a second pass: the next `runCheck` would read the *unmodified* files off
    // disk and re-derive exactly the edits just simulated, forever. Reported via `truncated` rather
    // than quietly presented as a finished result, because a real run genuinely may go further.
    if (dryRun) {
      truncated = true
      break
    }

    if (pass === maxPasses) truncated = true
  }

  return finish()

  function finish(): FixResult {
    const files: FixedFile[] = []
    for (const [file, state] of [...states].sort(([a], [b]) => compareStrings(a, b))) {
      if (state.edits === 0) continue
      files.push({
        file,
        rules: [...state.rules].sort(compareStrings),
        edits: state.edits,
        diff: unifiedDiff(file, state.original, state.current),
      })
    }

    const rules = [...appliedByRule]
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count || compareStrings(a.ruleId, b.ruleId))

    return { tier, dryRun, files, rules, oscillations, passes, truncated, initial, skipped, engineFailures }
  }
}

type DeriveContext = {
  engines: readonly Engine[]
  rootDir: string
  tmpDir: string
  tier: FixTier
  entries: readonly RuleEntry[]
  writable: ReadonlySet<string>
  frameworks: FrameworkDetection
  ruleOptionsByEngine: ReadonlyMap<EngineId, EngineRuleOptions>
  signal: AbortSignal
}

/**
 * Asks every engine implementing `Engine.deriveFixes` for edits covering the diagnostics it owns
 * that arrived without one, and merges the answers back onto those diagnostics.
 *
 * Running here rather than inside the engine's own `run()` is what makes the targets *earned*: a
 * diagnostic only reaches this point if arbitration elected its rule, the resolved level kept it,
 * and it was not suppressed (`runCheck` drops suppressed findings from `diagnostics`). An engine
 * that has to spawn itself again to produce a fix therefore never does so for work the pipeline was
 * going to discard.
 *
 * **A file containing any inline suppression directive is excluded outright**, and that is the one
 * deliberately blunt rule here. A derived fix comes from re-running the engine over a whole file, so
 * it rewrites *every* occurrence the rule finds there — including one the user silenced, which the
 * engine has no way to know about. Judging that per occurrence would mean matching hunks back to
 * individual findings by proximity, a guess that is wrong exactly when it matters. Skipping the file
 * costs a few unfixed findings in the rare file that carries a directive, and never applies a fix
 * somebody explicitly said not to. Engine-*reported* fixes (ast-grep) are unaffected: they ride on
 * an individual diagnostic and disappear with it when it is suppressed.
 */
async function withDerivedFixes(diagnostics: readonly Diagnostic[], ctx: DeriveContext): Promise<Diagnostic[]> {
  const providers = ctx.engines.filter((engine) => engine.deriveFixes !== undefined)
  if (providers.length === 0) return [...diagnostics]

  const fixKinds = new Map(ctx.entries.map((entry) => [ruleRefKey(entry), entry.fixKind]))
  const suppressionFree = new Map<string, boolean>()
  const isSuppressionFree = async (file: string): Promise<boolean> => {
    const known = suppressionFree.get(file)
    if (known !== undefined) return known
    let clean = false
    try {
      clean = parseSuppressions(await readFile(join(ctx.rootDir, file), 'utf8')).length === 0
    } catch {
      clean = false
    }
    suppressionFree.set(file, clean)
    return clean
  }

  const targetsByEngine = new Map<string, FixTarget[]>()
  for (const diagnostic of diagnostics) {
    if (diagnostic.fix !== undefined || diagnostic.file === null) continue
    if (!ctx.writable.has(diagnostic.file)) continue
    const kind = fixKinds.get(diagnostic.ruleId)
    if (kind === undefined || kind === 'none' || FIX_TIER_RANK[kind] > FIX_TIER_RANK[ctx.tier]) continue
    if (!providers.some((engine) => engine.id === diagnostic.engine)) continue
    if (!(await isSuppressionFree(diagnostic.file))) continue

    const engineRuleId = diagnostic.ruleId.slice(diagnostic.ruleId.indexOf('/') + 1)
    const targets = targetsByEngine.get(diagnostic.engine) ?? []
    targets.push({ file: diagnostic.file, engineRuleId, range: diagnostic.range })
    targetsByEngine.set(diagnostic.engine, targets)
  }
  if (targetsByEngine.size === 0) return [...diagnostics]

  const editsByKey = new Map<string, readonly Edit[]>()
  for (const engine of providers) {
    const targets = targetsByEngine.get(engine.id)
    if (targets === undefined) continue
    const context: RunContext = {
      rootDir: ctx.rootDir,
      tmpDir: ctx.tmpDir,
      adjustments: engineAdjustmentsFor(engine.id, ctx.frameworks),
      ruleOptions: ctx.ruleOptionsByEngine.get(engine.id) ?? new Map(),
      fixTier: ctx.tier,
    }
    for (const derived of await engine.deriveFixes!(targets, context, ctx.signal)) {
      editsByKey.set(`${engine.id}\0${derived.file}\0${derived.engineRuleId}`, derived.edits)
    }
  }

  // The whole `(file, rule)` edit set is attached to the *first* diagnostic of that pair, not copied
  // onto each: `gather` flattens every diagnostic's edits into the same candidate pool, so attaching
  // them n times would hand arbitration n identical copies of each edit, all conflicting with each
  // other, and n-1 of them would be dropped as overlaps for no reason.
  const claimed = new Set<string>()
  return diagnostics.map((diagnostic) => {
    if (diagnostic.fix !== undefined || diagnostic.file === null) return diagnostic
    const kind = fixKinds.get(diagnostic.ruleId)
    if (kind === undefined || kind === 'none') return diagnostic
    const engineRuleId = diagnostic.ruleId.slice(diagnostic.ruleId.indexOf('/') + 1)
    const key = `${diagnostic.engine}\0${diagnostic.file}\0${engineRuleId}`
    const edits = editsByKey.get(key)
    if (edits === undefined || claimed.has(key)) return diagnostic
    claimed.add(key)
    return { ...diagnostic, fix: { kind, description: `Apply the ${engineRuleId} fix.`, edits: [...edits] } }
  })
}

function refuseFor(state: WorktreeState): FixRefusal | null {
  if (state.state === 'clean') return null
  if (state.state === 'dirty') {
    const shown = state.changed.slice(0, 5).join(', ')
    const more = state.changed.length > 5 ? `, and ${state.changed.length - 5} more` : ''
    return {
      reason: 'dirty-worktree',
      message:
        `The git worktree has uncommitted changes (${shown}${more}). ` +
        `Commit or stash them first so \`git diff\` shows only what \`sgate fix\` changed, or pass --allow-dirty.`,
    }
  }
  if (state.state === 'no-git') {
    return {
      reason: 'no-git',
      message:
        'Not a git worktree, so there is no way to review or undo what this command would rewrite. ' +
        'Pass --allow-dirty to proceed anyway, or --dry-run to see the changes without applying them.',
    }
  }
  return {
    reason: 'worktree-unknown',
    message: `Could not determine whether the git worktree is clean: ${state.reason}. Pass --allow-dirty to proceed anyway.`,
  }
}

function summariseFindings(diagnostics: readonly Diagnostic[]): FixResult['initial'] {
  const withFix: Record<FixKind, number> = { safe: 0, suggested: 0, unsafe: 0 }
  for (const diagnostic of diagnostics) if (diagnostic.fix !== undefined) withFix[diagnostic.fix.kind] += 1
  return { findings: diagnostics.length, withFix }
}

type GatherContext = {
  tier: FixTier
  writable: ReadonlySet<string>
  rootDir: string
  ledger: { isStopped(file: string): boolean }
  priorities: ReadonlyMap<string, number>
  skipped: { aboveTier: number; outsideInventory: number; overlap: number; outOfRange: number }
}

/**
 * Spec §11 step 1, plus the two rails that decide whether an edit is even a candidate.
 *
 * `isWithinRoot` is a second check on top of inventory membership rather than a redundant one: the
 * inventory holds repo-relative POSIX paths, and a `..` segment or an absolute path arriving from an
 * engine would fail membership anyway — but it would fail it *by accident*, and the day something
 * normalises paths differently the accident stops holding. Containment is the property that actually
 * matters, so it is asserted directly.
 */
function gather(diagnostics: readonly Diagnostic[], ctx: GatherContext): Map<string, CandidateEdit[]> {
  const byFile = new Map<string, CandidateEdit[]>()

  for (const diagnostic of diagnostics) {
    const fix = diagnostic.fix
    const file = diagnostic.file
    if (fix === undefined || file === null) continue

    if (FIX_TIER_RANK[fix.kind] > FIX_TIER_RANK[ctx.tier]) {
      ctx.skipped.aboveTier += fix.edits.length
      continue
    }
    if (!ctx.writable.has(file) || !isWithinRoot(ctx.rootDir, file)) {
      ctx.skipped.outsideInventory += fix.edits.length
      continue
    }
    if (ctx.ledger.isStopped(file)) continue

    const edits = byFile.get(file) ?? []
    for (const edit of fix.edits) {
      edits.push({
        file,
        range: edit.range,
        replacement: edit.replacement,
        kind: fix.kind,
        ruleId: diagnostic.ruleId,
        concept: diagnostic.concept,
        priority: ctx.priorities.get(diagnostic.ruleId) ?? 0,
        severity: diagnostic.severity,
      })
    }
    byFile.set(file, edits)
  }

  return byFile
}

function isWithinRoot(rootDir: string, file: string): boolean {
  if (isAbsolute(file)) return false
  const root = resolve(rootDir)
  const target = resolve(root, file)
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function countDrops(dropped: readonly DroppedEdit[], skipped: GatherContext['skipped']): void {
  for (const drop of dropped) {
    if (drop.reason === 'overlap') skipped.overlap += 1
    else skipped.outOfRange += 1
  }
}

async function ensureState(
  states: Map<string, FileState>,
  ledger: ReturnType<typeof createOscillationLedger>,
  rootDir: string,
  file: string,
): Promise<FileState> {
  const existing = states.get(file)
  if (existing !== undefined) return existing

  const original: Uint8Array = await readFile(join(rootDir, file))
  const state: FileState = { original, current: original, rules: new Set(), edits: 0 }
  states.set(file, state)
  // Seeded on first edit rather than up front: a file only reaches here because a pass produced an
  // edit for it, and nothing but this loop rewrites files during a run — so its content now is still
  // its content at pass 1, which is the state a cycle has to return to in order to be a cycle.
  ledger.seed(file, original)
  return state
}

/**
 * Builds the `config.fix-oscillation` diagnostic (spec §11 step 5), following the same conventions
 * as `check.ts`'s `configDiagnostics`: `slop-gate/<concept>` rule id, and no diagnostic at all when
 * the concept resolves to no level.
 *
 * Returning `null` suppresses the *report*, never the *mechanism* — the caller has already stopped
 * fixing the file by the time it asks. Silencing `config.fix-oscillation` is a statement about
 * output, and letting it also re-enable a loop that provably does not converge would turn a
 * severity preference into a way to corrupt a file.
 */
function oscillationDiagnostic(
  file: string,
  rules: readonly string[],
  passes: number,
  resolver: RuleSetResolver,
): Diagnostic | null {
  const concept = 'config.fix-oscillation'
  const level = resolver.base.rules.get(concept as never)?.level
  if (level === undefined || level === 'off') return null

  const message =
    `${rules.map((rule) => `\`${rule}\``).join(' and ')} rewrite the same code in ${file}, ` +
    `returning it to a state it was already in after ${passes} pass(es). Fixing this file stopped there.`

  return {
    concept,
    ruleId: `slop-gate/${concept}`,
    engine: 'slop-gate',
    severity: LEVEL_TO_SEVERITY[level],
    message,
    file,
    range: { start: 0, end: 0 },
    position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    help: `Turn one of ${rules.join(', ')} off, or pin an owner for the concept they share, then run \`sgate fix\` again.`,
    docsUrl: `https://slop-gate.dev/concepts/${concept}`,
    fingerprint: hashJson({ concept, file, rules }).slice(0, 32),
  }
}
