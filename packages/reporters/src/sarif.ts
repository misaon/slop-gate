import type { CheckEvent, Diagnostic } from '@misaon/slop-gate-core'
import { compareStrings } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'
import { PLATFORM_LIMITS, PLATFORM_SEVERITY } from './platform.ts'

export const SARIF_VERSION = '2.1.0'
const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json'

type SarifRegion = {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  charOffset: number
  charLength: number
}

export function createSarifReporter(context: ReporterContext): Reporter {
  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return
      context.write(`${JSON.stringify(buildSarifLog(event.result.diagnostics, context.version), null, 2)}\n`)
    },
  }
}

export function buildSarifLog(diagnostics: readonly Diagnostic[], version: string): unknown {
  const kept = diagnostics.slice(0, PLATFORM_LIMITS.sarifResultsPerRun)

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'slop-gate',
            version,
            informationUri: 'https://github.com/misaon/slop-gate',
            rules: buildRuleDescriptors(kept),
          },
        },
        results: kept.map(toSarifResult),
        ...(kept.length === diagnostics.length
          ? {}
          : {
              invocations: [
                {
                  executionSuccessful: true,
                  toolExecutionNotifications: [
                    {
                      level: 'warning',
                      message: {
                        text:
                          `${diagnostics.length} findings were reported and ${kept.length} are in this log: ` +
                          "GitHub's code-scanning ingest accepts no more per run. Raise the threshold or narrow " +
                          'the run before reading this as the whole picture.',
                      },
                    },
                  ],
                },
              ],
            }),
      },
    ],
  }
}

function buildRuleDescriptors(diagnostics: readonly Diagnostic[]): readonly unknown[] {
  const byConcept = new Map<string, Diagnostic>()
  for (const diagnostic of diagnostics) if (!byConcept.has(diagnostic.concept)) byConcept.set(diagnostic.concept, diagnostic)

  return [...byConcept.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([concept, sample]) => ({
      id: concept,
      name: concept,
      shortDescription: { text: concept },
      fullDescription: { text: sample.help ?? sample.message },
      ...(sample.docsUrl === undefined ? {} : { helpUri: sample.docsUrl }),
      defaultConfiguration: { level: PLATFORM_SEVERITY.sarif[sample.severity] },
      properties: { engine: sample.engine, ruleRefKey: sample.ruleRefKey },
    }))
}

function toSarifResult(diagnostic: Diagnostic): unknown {
  return {
    ruleId: diagnostic.concept,
    level: PLATFORM_SEVERITY.sarif[diagnostic.severity],
    message: { text: diagnostic.message },
    partialFingerprints: { slopGateFingerprint: diagnostic.fingerprint },
    locations: [toSarifLocation(diagnostic)],
    properties: { engine: diagnostic.engine, ruleRefKey: diagnostic.ruleRefKey, concept: diagnostic.concept },
  }
}

function toSarifLocation(diagnostic: Diagnostic): unknown {
  if (diagnostic.file === null) return { physicalLocation: { artifactLocation: { uri: '.' } } }

  const region: SarifRegion = {
    startLine: diagnostic.position.startLine,
    startColumn: diagnostic.position.startColumn,
    endLine: diagnostic.position.endLine,
    endColumn: diagnostic.position.endColumn,
    charOffset: diagnostic.range.start,
    charLength: diagnostic.range.end - diagnostic.range.start,
  }

  return { physicalLocation: { artifactLocation: { uri: diagnostic.file, uriBaseId: '%SRCROOT%' }, region } }
}
