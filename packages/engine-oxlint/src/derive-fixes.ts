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
  type ScriptBinInvocation,
} from '@misaon/slop-gate-core'
import { materializeOxlintConfig } from './config.ts'

const exec = promisify(execFile)

function flagFor(catalogueFix: string): string | null {
  if (catalogueFix === 'none' || catalogueFix === 'pending') return null
  if (catalogueFix.includes('dangerous')) return '--fix-dangerously'
  if (catalogueFix.includes('fix')) return '--fix'
  if (catalogueFix.includes('suggestion')) return '--fix-suggestions'
  return null
}

type CatalogueRule = { scope?: string; value?: string; fix?: string }

export async function loadFixCatalogue(invocation: ScriptBinInvocation): Promise<Map<string, string>> {
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
  invocation: ScriptBinInvocation
  targets: readonly FixTarget[]
  selection: EngineRuleSelection
  context: RunContext
  signal: AbortSignal
  catalogue?: Map<string, string>
}

function singleRuleSelection(engineRuleId: string, selection: EngineRuleSelection): EngineRuleSelection {
  const [, ...options] = selection.get(engineRuleId) ?? ['error']
  return new Map([[engineRuleId, ['error', ...options] as const]])
}

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
          // Deliberately not `--type-aware`: the sandbox holds copies of the files and no `tsconfig.json`, so a
          // type-aware fix would be derived against default compiler options rather than the project's.
          [...options.invocation.prefixArgs, '--config', handle.path, '--disable-nested-config', flag, '--silent', ...files],
          { cwd: sandbox, signal: options.signal, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
        )
      } catch (error) {
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
