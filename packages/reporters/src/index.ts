import type { CheckEvent } from '@misaon/slop-gate-core'
import { createJsonReporter } from './json.ts'
import { createPrettyReporter } from './pretty.ts'

export type ReporterContext = {
  write(chunk: string): void
  color: boolean
  /**
   * Returns the file's content for code frames, or null when it cannot be read. `file` is `null`
   * for an orchestrator-level diagnostic with no file to point at (see `Diagnostic.file`) —
   * implementations must return `null` for that case rather than attempt to resolve a path.
   */
  readSource(file: string | null): string | null
}

export type Reporter = { onEvent(event: CheckEvent): void }

export const REPORTER_NAMES = ['pretty', 'json'] as const

export type ReporterName = (typeof REPORTER_NAMES)[number]

export function createReporter(name: ReporterName, context: ReporterContext): Reporter {
  return name === 'json' ? createJsonReporter(context) : createPrettyReporter(context)
}

export { renderCodeFrame } from './code-frame.ts'
export { JSON_REPORT_VERSION } from './json.ts'
