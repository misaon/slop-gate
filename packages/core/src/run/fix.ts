import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { writeFileAtomic } from '../cache/atomic-write.ts'
import { hashJson } from '../cache/keys.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { RuleKey, SlopGateConfig } from '../config/types.ts'
import type { Diagnostic, Edit, FixKind } from '../diagnostics/types.ts'
import type { FileSource } from '../discovery/inventory.ts'
import type { Engine, EngineRuleSelection, FixTarget, RunContext } from '../engine/types.ts'
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
import { parseRuleRefKey, ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'
import { runCheck } from './check.ts'
import { resolveRun } from './resolve-run.ts'

const DEFAULT_MAX_PASSES = 10

export type FixOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  tier?: FixTier
  dryRun?: boolean
  allowDirty?: boolean
  maxPasses?: number
  signal?: AbortSignal
  worktree?: InspectWorktreeOptions
}

type FixedFile = {
  readonly file: string
  readonly rules: readonly string[]
  readonly edits: number
  readonly diff: string
}

type FixRefusal = {
  readonly reason: 'dirty-worktree' | 'no-git' | 'worktree-unknown' | 'engine-failed'
  readonly message: string
}

export type FixResult = {
  readonly tier: FixTier
  readonly dryRun: boolean
  readonly files: readonly FixedFile[]
  readonly rules: readonly { readonly ruleRefKey: string; readonly count: number }[]
  readonly oscillations: readonly Diagnostic[]
  readonly passes: number
  readonly truncated: boolean
  readonly initial: {
    readonly findings: number
    readonly withFix: Readonly<Record<FixKind, number>>
  }
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
  readonly original: Uint8Array
  current: Uint8Array
  readonly rules: Set<string>
  edits: number
}

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

  if (!dryRun && options.allowDirty !== true) {
    const state = await inspectWorktree(options.rootDir, options.worktree ?? {})
    const refusal = refuseFor(state)
    if (refusal !== null) return { ...empty, refusal }
  }

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
  const selectionByEngine = new Map(
    buildPlan({ engines: options.engines, inventory, election, resolver }).map((assignment) => [
      assignment.engineId,
      assignment.selection,
    ]),
  )
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
      useCache: false,
      fixTier: tier,
      signal,
    })

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
      selectionByEngine,
      signal,
    })

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
      const rules = [...new Set(applied.map((edit) => edit.ruleRefKey))].sort(compareStrings)

      const oscillation = ledger.record(file, next, rules)
      if (oscillation !== null) {
        const diagnostic = oscillationDiagnostic(file, oscillation.rules, oscillation.passes, resolver)
        if (diagnostic !== null) oscillations.push(diagnostic)
        continue
      }

      state.current = next
      state.edits += applied.length
      for (const edit of applied) {
        state.rules.add(edit.ruleRefKey)
        appliedByRule.set(edit.ruleRefKey, (appliedByRule.get(edit.ruleRefKey) ?? 0) + 1)
      }
      changedThisPass = true

      if (!dryRun) await writeFileAtomic(join(options.rootDir, file), next)
    }

    if (!changedThisPass) break

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
      .map(([key, count]) => ({ ruleRefKey: key, count }))
      .sort((a, b) => b.count - a.count || compareStrings(a.ruleRefKey, b.ruleRefKey))

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
  selectionByEngine: ReadonlyMap<EngineId, EngineRuleSelection>
  signal: AbortSignal
}

type FixDeriver = Engine & { readonly deriveFixes: NonNullable<Engine['deriveFixes']> }

async function withDerivedFixes(diagnostics: readonly Diagnostic[], ctx: DeriveContext): Promise<Diagnostic[]> {
  const providers = ctx.engines.filter((engine): engine is FixDeriver => engine.deriveFixes !== undefined)
  if (providers.length === 0) return [...diagnostics]

  const fixKinds = new Map(ctx.entries.map((entry) => [ruleRefKey(entry), entry.fixKind]))
  const suppressionFree = new Map<string, boolean>()
  const isSuppressionFree = async (file: string): Promise<boolean> => {
    const known = suppressionFree.get(file)
    if (known !== undefined) return known
    let clean: boolean
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
    const kind = fixKinds.get(diagnostic.ruleRefKey)
    if (kind === undefined || kind === 'none' || FIX_TIER_RANK[kind] > FIX_TIER_RANK[ctx.tier]) continue
    if (!providers.some((engine) => engine.id === diagnostic.engine)) continue
    if (!(await isSuppressionFree(diagnostic.file))) continue

    const { engineRuleId } = parseRuleRefKey(diagnostic.ruleRefKey)
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
      fixTier: ctx.tier,
    }
    const selection = ctx.selectionByEngine.get(engine.id) ?? new Map()
    for (const derived of await engine.deriveFixes(targets, selection, context, ctx.signal)) {
      editsByKey.set(`${engine.id}\0${derived.file}\0${derived.engineRuleId}`, derived.edits)
    }
  }

  const claimed = new Set<string>()
  return diagnostics.map((diagnostic) => {
    if (diagnostic.fix !== undefined || diagnostic.file === null) return diagnostic
    const kind = fixKinds.get(diagnostic.ruleRefKey)
    if (kind === undefined || kind === 'none') return diagnostic
    const { engineRuleId } = parseRuleRefKey(diagnostic.ruleRefKey)
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
        ruleRefKey: diagnostic.ruleRefKey,
        concept: diagnostic.concept,
        priority: ctx.priorities.get(diagnostic.ruleRefKey) ?? 0,
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
  ledger.seed(file, original)
  return state
}

function oscillationDiagnostic(
  file: string,
  rules: readonly string[],
  passes: number,
  resolver: RuleSetResolver,
): Diagnostic | null {
  const concept = 'config.fix-oscillation'
  const level = resolver.base.rules.get(concept as RuleKey)?.level
  if (level === undefined || level === 'off') return null

  const message =
    `${rules.map((rule) => `\`${rule}\``).join(' and ')} rewrite the same code in ${file}, ` +
    `returning it to a state it was already in after ${passes} pass(es). Fixing this file stopped there.`

  return {
    concept,
    ruleRefKey: `slop-gate/${concept}`,
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
