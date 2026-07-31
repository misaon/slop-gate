import type { CheckEvent } from '@misaon/slop-gate-core'
import { createJsonReporter } from './json.ts'
import { createPrettyReporter } from './pretty.ts'

export type ReporterContext = {
  write(chunk: string): void
  color: boolean
  /**
   * True to draw Unicode box-drawing characters and emoji severity markers; false to fall back to
   * ASCII (`TERM=dumb`). Independent of `color` — a colourless run still gets Unicode by default,
   * and in principle an ASCII run could still be coloured, so the two are never conflated.
   */
  unicode: boolean
  /**
   * Terminal width in columns (the CLI supplies `process.stdout.columns ?? 80`). Read here rather
   * than from `process.stdout` inside the reporter so frame width is deterministic in tests. The
   * `pretty` reporter clamps this to its own drawable range; other reporters may ignore it.
   */
  width: number
  /** The CLI package version, shown in the `pretty` reporter's header. */
  version: string
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
export { SEVERITY_GLYPH, createPrettyReporter } from './pretty.ts'
export { displayWidth, padEndDisplay, padStartDisplay, truncateEnd, truncateStart } from './display-width.ts'
export { wrapText } from './wrap-text.ts'
