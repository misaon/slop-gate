import type { CheckEvent } from '@misaon/slop-gate-core'
import { createAgentReporter } from './agent.ts'
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
  /**
   * Upper bound on the `agent` reporter's output, in estimated tokens (`--max-tokens`). Absent means
   * no bound. Read here for the same reason `width` is — a reporter must not reach into `process`
   * for something a test needs to pin — and ignored by every other reporter: `pretty` is bounded by
   * a terminal, and truncating `json` would produce an invalid document rather than a smaller one.
   */
  maxTokens?: number
}

export type Reporter = { onEvent(event: CheckEvent): void }

export const REPORTER_NAMES = ['pretty', 'json', 'agent'] as const

export type ReporterName = (typeof REPORTER_NAMES)[number]

export function createReporter(name: ReporterName, context: ReporterContext): Reporter {
  if (name === 'json') return createJsonReporter(context)
  if (name === 'agent') return createAgentReporter(context)
  return createPrettyReporter(context)
}

export { renderCodeFrame } from './code-frame.ts'
export {
  AGENT_REPORT_VERSION,
  createAgentReporter,
  summariseAgentGroups,
  type AgentGroupSummary,
  type AgentReporterOptions,
} from './agent.ts'
export { JSON_REPORT_VERSION } from './json.ts'
export { createPrettyReporter } from './pretty.ts'
export {
  displayWidth,
  hasWideOrFullwidthCharacter,
  padEndDisplay,
  padStartDisplay,
  truncateEnd,
  truncateStart,
} from './display-width.ts'
export { wrapText } from './wrap-text.ts'

// --- Shared rendering primitives (box frames, severity vocabulary) — used by both the `check`
// reporter (`pretty.ts`) and the `sgate rules` governance commands' renderers, so there is exactly
// one implementation of each rather than a second copy growing alongside the new commands.
export {
  ASCII_BOX,
  createFrameKit,
  MAX_FRAME_WIDTH,
  MIN_FRAME_WIDTH,
  plural,
  UNICODE_BOX,
  type Box,
  type FrameContext,
  type FrameKit,
} from './frame.ts'
export {
  SEVERITY_GLYPH,
  SEVERITY_GLYPH_ASCII,
  SEVERITY_NOUN,
  SEVERITY_ORDER,
  SEVERITY_STYLE,
} from './severity.ts'

// --- `sgate rules` governance commands: one pretty + one json renderer per command, each
// versioned like `JSON_REPORT_VERSION` above.
export type { RulesReporterContext } from './rules/context.ts'
export { renderRulesListJson, renderRulesListPretty, RULES_LIST_JSON_VERSION } from './rules/list.ts'
export { renderRulesWhyJson, renderRulesWhyPretty, RULES_WHY_JSON_VERSION } from './rules/why.ts'
export { renderRulesConflictsJson, renderRulesConflictsPretty, RULES_CONFLICTS_JSON_VERSION } from './rules/conflicts.ts'
