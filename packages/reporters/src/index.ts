import type { CheckEvent } from '@misaon/slop-gate-core'
import { createAgentReporter } from './agent.ts'
import { createGithubReporter } from './github.ts'
import { createGitlabReporter } from './gitlab.ts'
import { createJsonReporter } from './json.ts'
import { createPrettyReporter } from './pretty.ts'
import { createSarifReporter } from './sarif.ts'

export type ReporterContext = {
  write(chunk: string): void
  color: boolean
  /** Unicode box-drawing characters and emoji severity markers, or the ASCII fallback (`TERM=dumb`).
   *  **Independent of `color`** — a colourless run still gets Unicode by default, and an ASCII run could
   *  still be coloured, so the two are never conflated. */
  unicode: boolean
  /** Terminal width in columns (the CLI supplies `process.stdout.columns ?? 80`). Read here rather than from
   *  `process.stdout` inside the reporter so frame width is deterministic in tests; `pretty` clamps it to
   *  its own drawable range and other reporters may ignore it. */
  width: number
  /** The CLI package version, shown in the `pretty` reporter's header. */
  version: string
  /** The file's content for code frames, or null when it cannot be read. `file` is `null` for an
   *  orchestrator-level diagnostic with no file to point at (see `Diagnostic.file`) — implementations must
   *  return `null` for that case rather than attempt to resolve a path. */
  readSource(file: string | null): string | null
  /** Upper bound on the `agent` reporter's output, in estimated tokens (`--max-tokens`); absent means no
   *  bound. Ignored by every other reporter: `pretty` is bounded by a terminal, and truncating `json` would
   *  produce an invalid document rather than a smaller one. */
  maxTokens?: number
}

export type Reporter = { onEvent(event: CheckEvent): void }

/**
 * `pretty` first because it is the default. The three platform formats come last because none of them is meant
 * to be read by a person: they exist to be handed to GitHub or GitLab, which is why `--format=sarif > out.sarif`
 * and an upload step is the documented shape rather than a terminal.
 */
export const REPORTER_NAMES = ['pretty', 'json', 'agent', 'sarif', 'github', 'gitlab'] as const

export type ReporterName = (typeof REPORTER_NAMES)[number]

export function createReporter(name: ReporterName, context: ReporterContext): Reporter {
  if (name === 'json') return createJsonReporter(context)
  if (name === 'agent') return createAgentReporter(context)
  if (name === 'sarif') return createSarifReporter(context)
  if (name === 'github') return createGithubReporter(context)
  if (name === 'gitlab') return createGitlabReporter(context)
  return createPrettyReporter(context)
}

export {
  AGENT_REPORT_VERSION,
  createAgentReporter,
  isCoverageGap,
  summariseAgentGroups,
  type AgentGroupSummary,
  type AgentReporterOptions,
} from './agent.ts'
export { createGithubReporter } from './github.ts'
export { createGitlabReporter, toCodeQualityViolation } from './gitlab.ts'
export { JSON_REPORT_VERSION } from './json.ts'
export { PLATFORM_LIMITS, PLATFORM_SEVERITY, escapeCommandData, escapeCommandProperty } from './platform.ts'
export { SARIF_VERSION, buildSarifLog, createSarifReporter } from './sarif.ts'
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

// --- Shared rendering primitives (box frames, severity vocabulary), used by both `pretty.ts` and the
// `sgate rules` renderers.
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
} from './box.ts'
export {
  SEVERITY_GLYPH,
  SEVERITY_GLYPH_ASCII,
  SEVERITY_NOUN,
  SEVERITY_ORDER,
  SEVERITY_STYLE,
} from './severity.ts'

// --- `sgate rules` commands: one pretty + one json renderer each, versioned like `JSON_REPORT_VERSION`.
export type { RulesReporterContext } from './rules/context.ts'
export { renderRulesListJson, renderRulesListPretty, RULES_LIST_JSON_VERSION } from './rules/list.ts'
export { renderRulesWhyJson, renderRulesWhyPretty, RULES_WHY_JSON_VERSION } from './rules/why.ts'
export { renderRulesConflictsJson, renderRulesConflictsPretty, RULES_CONFLICTS_JSON_VERSION } from './rules/conflicts.ts'
