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
export type { SchemaFinding, SchemaValidator } from './validate.ts'
export { inspectYaml, type YamlFinding, type YamlInspection, type YamlRuleId } from './yaml.ts'

export const SCHEMA_RULE_IDS = ['compose-spec', 'duplicate-mapping-key', 'parse-error'] as const

export type SchemaRuleId = (typeof SCHEMA_RULE_IDS)[number]

export function createSchemaEngine(): Engine {
  let validator: Promise<SchemaValidator> | undefined
  const loadValidator = (): Promise<SchemaValidator> => {
    validator ??= import('./validate.ts').then((module) => module.createSchemaValidator())
    return validator
  }

  const selections = new Map<string, ReadonlySet<string>>()

  return {
    id: 'schema',

    capabilities: {
      languages: ['yaml', 'github-workflow'],
      granularity: 'file',
      provides: [],
      fixes: false,
    },

    async version() {
      const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
        version?: string
      }
      return `${manifest.version ?? '0.0.0'}+schemas.${hashJson(SCHEMA_BINDINGS.map((binding) => binding.schema)).slice(0, 12)}`
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
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
    return
  }

  const index = createLineIndex(source)
  const { findings, documents, lineCounter } = inspectYaml(source)
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
