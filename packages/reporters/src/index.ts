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
  unicode: boolean
  width: number
  version: string
  readSource(file: string | null): string | null
  maxTokens?: number
  maxFindings?: number
}

export type Reporter = { onEvent(event: CheckEvent): void }

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

export type { RulesReporterContext } from './rules/context.ts'
export { renderRulesListJson, renderRulesListPretty, RULES_LIST_JSON_VERSION } from './rules/list.ts'
export { renderRulesWhyJson, renderRulesWhyPretty, RULES_WHY_JSON_VERSION } from './rules/why.ts'
export { renderRulesConflictsJson, renderRulesConflictsPretty, RULES_CONFLICTS_JSON_VERSION } from './rules/conflicts.ts'
