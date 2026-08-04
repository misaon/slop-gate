import type { CheckEvent, Diagnostic } from '@misaon/slop-gate-core'
import { compareStrings } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'
import { PLATFORM_LIMITS, PLATFORM_SEVERITY } from './platform.ts'

/**
 * SARIF 2.1.0 — the one output that is somebody else's standard rather than ours, which is why it comes first
 * of the three platform formats (§12.5). GitHub ingests it through the code-scanning API and renders inline
 * annotations plus a pull-request conversation; GitLab reads it for SAST.
 *
 * This is a projection, not new analysis: `Diagnostic` already carries everything a SARIF `result` needs.
 *
 * **`partialFingerprints` is what makes it useful rather than merely valid.** A platform uses it to recognise
 * a finding it has already shown, so the same issue does not reappear as new on every push. Ours is a hash of
 * the rule, the concept and the *text* of the line (§10.1) and deliberately excludes line and column, so
 * inserting an import above a finding does not re-report everything below it. That property is the whole
 * reason the field is populated from `fingerprint` rather than from the location.
 */
export const SARIF_VERSION = '2.1.0'
const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json'

/**
 * Byte offsets, not just line and column.
 *
 * SARIF's `region` accepts both, and `charOffset`/`charLength` are exact where a reader that recomputes a
 * position from `startLine` has to agree with us about tab width and line endings to land in the same place.
 * Both are emitted: GitHub's UI uses the line form, and a tool doing a textual replacement wants the offsets.
 */
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
            // One descriptor per *concept*, not per finding: a concept is slop-gate's stable identity for "the
            // thing being detected" (§5.1), so a platform's rule-level history survives the finding moving to a
            // different engine after arbitration. Sorted so two runs over the same repository produce the same
            // document byte for byte.
            rules: buildRuleDescriptors(kept),
          },
        },
        results: kept.map(toSarifResult),
        // Said out loud rather than left to the reader to notice, because a truncated run and a clean run look
        // identical on the platform. `invocations[].toolExecutionNotifications` is SARIF's own channel for a
        // message about the run itself rather than about the code.
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
      // `help` is the fix advice a human reads; falling back to the message keeps the field meaningful rather
      // than empty for a rule that carries no advice.
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
    // `partialFingerprints` and not `fingerprints`: the latter promises a value that identifies the finding for
    // all time, which a hash over the line's text does not — editing that line legitimately produces a new one.
    partialFingerprints: { slopGateFingerprint: diagnostic.fingerprint },
    locations: [toSarifLocation(diagnostic)],
    properties: { engine: diagnostic.engine, ruleRefKey: diagnostic.ruleRefKey, concept: diagnostic.concept },
  }
}

/**
 * A location for a diagnostic that may have no file.
 *
 * `Diagnostic.file` is `null` for an orchestrator-level finding — a config conflict with nothing on disk to
 * point at. SARIF requires at least one location per result, so those are anchored on the repository root with
 * no region: naming a file that does not exist is the bug `file: string | null` exists to prevent, and it would
 * become a broken link in the platform's UI.
 */
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
