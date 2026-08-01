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
import { createSchemaValidator } from './validate.ts'
import { inspectYaml } from './yaml.ts'

export { SCHEMA_BINDINGS, SCHEMA_EXCLUSIONS, bindSchema, type SchemaBinding, type SchemaId } from './catalogue.ts'
export { createSchemaValidator, type SchemaFinding, type SchemaValidator } from './validate.ts'
export { inspectYaml, type YamlFinding, type YamlInspection, type YamlRuleId } from './yaml.ts'

/**
 * Every rule this engine can report. Exported so `entries.manual.ts`'s registry entries and this list
 * can be asserted to agree — an engine that can report a rule the registry has never heard of would
 * emit diagnostics `normalizeDiagnostics` cannot attribute to a concept.
 */
export const SCHEMA_RULE_IDS = ['compose-spec', 'duplicate-mapping-key', 'malformed-document'] as const

export type SchemaRuleId = (typeof SCHEMA_RULE_IDS)[number]

/**
 * JSON Schema and YAML structural validation for configuration files — the `schema` engine of the
 * design's §13.1 domain table, and the only engine in this repository that is not a wrapper around
 * somebody else's binary.
 *
 * That difference is the point rather than an accident. Every other config-file linter worth having
 * for this domain is written in Go, Haskell, Rust or Python and reaches the network to install; a
 * validator built from a vendored schema, `ajv` and `yaml` installs with `npm install`, runs offline,
 * behaves identically on macOS, Linux and Windows, and has no platform matrix to get wrong. It is
 * also, measurably, most of the value: over 826 YAML files from four unrelated repositories it found
 * six real defects and produced zero false positives.
 *
 * **In-process, so there is no config file to materialise.** `materializeConfig` still returns a
 * handle — `rulesetHash` is part of every cache key and must be real — but the `path` it names is
 * never created, because nothing would ever read it. Core does not touch `handle.path`; only an
 * engine's own `run` does, and this one has the selection in hand already.
 */
export function createSchemaEngine(): Engine {
  const validate = createSchemaValidator()
  // Keyed by the handle's `path`, which is unique per handle, so two concurrent assignments cannot
  // read each other's selection.
  const selections = new Map<string, EngineRuleSelection>()

  return {
    id: 'schema',

    capabilities: {
      // `yaml` is the domain; `github-workflow` is here because a workflow is a YAML document before
      // it is a workflow, and a duplicate `jobs:` key breaks it exactly the way a duplicate key breaks
      // any other file. The *semantic* half of workflow checking belongs to actionlint and is
      // deliberately not attempted here — see `SCHEMA_EXCLUSIONS['github-workflow']`.
      languages: ['yaml', 'github-workflow'],
      granularity: 'file',
      provides: [],
      // A schema knows what is wrong, not what the author meant. `ports: 8080` could become
      // `ports: ["8080"]` or `ports: [8080]`, and picking one would be guessing at intent in a file
      // that governs how something deploys.
      fixes: false,
    },

    async version() {
      const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
        version?: string
      }
      // The package version alone would not invalidate a cached result after a vendored schema is
      // refreshed, and the schema digest alone would not invalidate one after a fix to the checks in
      // `yaml.ts`. Both together cover the two ways this engine's verdict can change.
      return `${manifest.version ?? '0.0.0'}+schemas.${hashJson(SCHEMA_BINDINGS.map((binding) => binding.schema)).slice(0, 12)}`
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      const rulesetHash = hashJson([...selection].map(([rule, level]) => [rule, level]).sort())
      const path = join(context.tmpDir, `schema-selection.${rulesetHash.slice(0, 12)}.json`)
      selections.set(path, selection)

      return {
        path,
        rulesetHash,
        ruleCount: selection.size,
        async dispose() {
          selections.delete(path)
        },
      } satisfies EngineConfigHandle
    },

    async *run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      const selection = selections.get(handle.path) ?? new Map<string, never>()
      const enabled = (rule: SchemaRuleId): boolean => selection.has(rule)

      for (const file of batch.files) {
        signal.throwIfAborted()
        yield* inspectFile(file.path, context.rootDir, enabled, validate)
      }
    },
  }
}

async function* inspectFile(
  relativePath: string,
  rootDir: string,
  enabled: (rule: SchemaRuleId) => boolean,
  validate: ReturnType<typeof createSchemaValidator>,
): AsyncIterable<RawDiagnostic> {
  const binding = bindSchema(relativePath)
  const wantsStructure = enabled('duplicate-mapping-key') || enabled('malformed-document')
  const wantsSchema = binding !== undefined && enabled('compose-spec')
  if (!wantsStructure && !wantsSchema) return

  let source: string
  try {
    source = await readFile(join(rootDir, relativePath), 'utf8')
  } catch {
    // The inventory listed this file, so it existed when the run started. A file deleted or made
    // unreadable mid-run is not a finding about the repository, and failing the whole engine over it
    // would turn a race into an exit code 3.
    return
  }

  const index = createLineIndex(source)
  const { findings, documents, lineCounter } = inspectYaml(source)
  // `yaml` reports offsets in UTF-16 code units; `RawDiagnostic.range` is UTF-8 bytes (spec §10).
  // Going through `linePos` and core's own `LineIndex` rather than converting directly is what keeps
  // a multi-byte character earlier in the line from shifting every range after it.
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
