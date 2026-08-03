import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createLineIndex,
  hashJson,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { SCHEMA_BINDINGS, bindSchema } from './catalogue.ts'
import { inspectYaml } from './yaml.ts'
import type { SchemaValidator } from './validate.ts'

export { SCHEMA_BINDINGS, SCHEMA_EXCLUSIONS, bindSchema, type SchemaBinding, type SchemaId } from './catalogue.ts'
// `createSchemaValidator` is deliberately **not** re-exported: a static re-export would put
// `./validate.ts` — and with it `ajv`, ~11 ms of module load — back in this entry point's graph, which
// is what `run()`'s dynamic import below exists to keep out. The types are erased and cost nothing.
export type { SchemaFinding, SchemaValidator } from './validate.ts'
export { inspectYaml, type YamlFinding, type YamlInspection, type YamlRuleId } from './yaml.ts'

/**
 * Every rule this engine can report. Exported so `entries.uncatalogued.ts`'s registry entries and this
 * list can be asserted to agree — a rule the registry has never heard of would emit diagnostics
 * `normalizeDiagnostics` cannot attribute to a concept.
 */
export const SCHEMA_RULE_IDS = ['compose-spec', 'duplicate-mapping-key', 'parse-error'] as const

export type SchemaRuleId = (typeof SCHEMA_RULE_IDS)[number]

/**
 * JSON Schema and YAML structural validation for configuration files — the `schema` engine of the
 * design's §13.1 domain table, and the only engine here that is not a wrapper around somebody else's
 * binary. Every other config-file linter worth having for this domain is written in Go, Haskell, Rust or
 * Python and reaches the network to install; a validator built from a vendored schema, `ajv` and `yaml`
 * installs with `npm install`, runs offline and behaves identically on macOS, Linux and Windows. Over
 * 826 YAML files from four unrelated repositories it found six real defects and zero false positives.
 *
 * **In-process, so there is no config file to materialise.** `materializeConfig` still returns a handle
 * — `rulesetHash` is part of every cache key and must be real — but the `path` it names is never
 * created, because nothing reads it: core does not touch `handle.path`, only an engine's own `run` does,
 * and this one has the selection in hand already.
 */
export function createSchemaEngine(): Engine {
  /**
   * `ajv` plus `ajv-formats` is ~11 ms of module evaluation, and this engine is constructed on every
   * `sgate` invocation that builds the engine list — `sgate rules why` and a fully-cached `sgate check`
   * included, neither of which validates anything, and nor does a repository with no `compose.yaml`. So
   * the validator is built on the first file that actually needs it, not here. Construction,
   * `capabilities` and `availability()` stay synchronous because arbitration reads all three before any
   * run. Memoised, so a validator's compiled-schema cache lives as long as the engine does.
   */
  let validator: Promise<SchemaValidator> | undefined
  const loadValidator = (): Promise<SchemaValidator> => {
    validator ??= import('./validate.ts').then((module) => module.createSchemaValidator())
    return validator
  }

  // Keyed by the handle's `path`, unique per handle, so two concurrent assignments cannot read each
  // other's selection.
  const selections = new Map<string, ReadonlySet<string>>()

  return {
    id: 'schema',

    capabilities: {
      // `github-workflow` is here because a workflow is a YAML document before it is a workflow, and a
      // duplicate `jobs:` key breaks it the way a duplicate key breaks any other file. The *semantic*
      // half belongs to actionlint — see `SCHEMA_EXCLUSIONS['github-workflow']`.
      languages: ['yaml', 'github-workflow'],
      granularity: 'file',
      provides: [],
      // A schema knows what is wrong, not what the author meant: `ports: 8080` could become
      // `ports: ["8080"]` or `ports: [8080]`, in a file that governs how something deploys.
      fixes: false,
    },

    async version() {
      const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
        version?: string
      }
      // Both halves are needed: the package version alone would not invalidate a cached result after a
      // vendored schema is refreshed, and the schema digest alone would not after a fix in `yaml.ts`.
      return `${manifest.version ?? '0.0.0'}+schemas.${hashJson(SCHEMA_BINDINGS.map((binding) => binding.schema)).slice(0, 12)}`
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      // `run` below gates each check on membership of this set, so it *is* this engine's enablement
      // decision and has to be built from the levels rather than the keys — otherwise an `['off', …]`
      // setting would read as enabled. Options are dropped and absent from the hash: the checks take none.
      const enabled = [...selection].filter(([, [level]]) => level !== 'off')
      const rulesetHash = hashJson(enabled.map(([rule, [level]]) => [rule, level]).sort())
      const path = join(context.tmpDir, `schema-selection.${rulesetHash.slice(0, 12)}.json`)
      selections.set(path, new Set(enabled.map(([rule]) => rule)))

      return {
        path,
        rulesetHash,
        ruleCount: enabled.length,
        async dispose() {
          selections.delete(path)
        },
      } satisfies EngineConfigHandle
    },

    async *run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      const selection = selections.get(handle.path) ?? new Set<string>()
      const enabled = (rule: SchemaRuleId): boolean => selection.has(rule)

      for (const file of batch.files) {
        signal.throwIfAborted()
        yield* inspectFile(file.path, context.rootDir, enabled, loadValidator)
      }
    },
  }
}

async function* inspectFile(
  relativePath: string,
  rootDir: string,
  enabled: (rule: SchemaRuleId) => boolean,
  loadValidator: () => Promise<SchemaValidator>,
): AsyncIterable<RawDiagnostic> {
  const binding = bindSchema(relativePath)
  const wantsStructure = enabled('duplicate-mapping-key') || enabled('parse-error')
  const wantsSchema = binding !== undefined && enabled('compose-spec')
  if (!wantsStructure && !wantsSchema) return

  let source: string
  try {
    source = await readFile(join(rootDir, relativePath), 'utf8')
  } catch {
    // A file deleted or made unreadable mid-run is not a finding about the repository, and failing the
    // whole engine over it would turn a race into an exit code 3.
    return
  }

  const index = createLineIndex(source)
  const { findings, documents, lineCounter } = inspectYaml(source)
  // `yaml` reports offsets in UTF-16 code units; `RawDiagnostic.range` is UTF-8 bytes (spec §10). Going
  // through `linePos` and core's own `LineIndex` rather than converting directly is what keeps a
  // multi-byte character earlier in the line from shifting every range after it.
  const toRange = (offset: number, endOffset: number) => {
    const start = lineCounter.linePos(offset)
    const end = lineCounter.linePos(Math.max(offset, endOffset))
    return {
      start: index.offsetAt({ line: start.line, column: start.col }),
      end: index.offsetAt({ line: end.line, column: end.col }),
    }
  }

  for (const finding of findings) {
    if (!enabled(finding.rule)) continue
    yield {
      engineRuleId: finding.rule,
      message: finding.message,
      severity: 'error',
      file: relativePath,
      range: toRange(finding.offset, finding.endOffset),
    }
  }

  if (!wantsSchema) return
  // Past every cheaper check, so `ajv` is loaded only for a file really bound to a schema with that
  // schema's rule enabled — the YAML-only findings above never reach it.
  const validate = await loadValidator()
  for (const document of documents) {
    for (const finding of validate(binding, document)) {
      yield {
        engineRuleId: binding.id,
        message: finding.message,
        severity: 'error',
        file: relativePath,
        range: toRange(finding.offset, finding.endOffset),
        docsUrl: binding.docsUrl,
      }
    }
  }
}
