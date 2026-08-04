import { McpServer } from '@modelcontextprotocol/server'
import {
  callCheck,
  callExplain,
  callPropose,
  CHECK_INPUT,
  CHECK_OUTPUT,
  EXPLAIN_INPUT,
  EXPLAIN_OUTPUT,
  PROPOSE_INPUT,
  PROPOSE_OUTPUT,
  type ToolContext,
  type ToolResult,
} from './tools.ts'

export type BuildServerOptions = {
  readonly serverRoot: string
  readonly version: string
  readonly track?: <T>(work: () => Promise<T>) => Promise<T>
}

export function buildMcpServer(options: BuildServerOptions): McpServer {
  const server = new McpServer(
    { name: 'slop-gate', version: options.version },
    {
      capabilities: { tools: {} },
      instructions:
        'slop-gate is one quality gate over several analysis engines. Call `check` first; its text output is ' +
        'written for you to act on, and its `outcome` field tells you whether the run could see everything — ' +
        'never read an empty findings list as a pass without it. Findings under `## automated` belong to ' +
        '`sgate fix`; do not hand-edit those. Use `explain_concept` when you need to decide whether a finding ' +
        'is worth acting on, and `propose_fixes` to see the exact diff `sgate fix` would write. Nothing here ' +
        'modifies the repository.',
    },
  )

  const track = options.track ?? (<T>(work: () => Promise<T>) => work())
  const call = <A>(handler: (args: A, context: ToolContext) => Promise<ToolResult>, args: A, signal: AbortSignal): Promise<ToolResult> =>
    track(() => handler(args, { serverRoot: options.serverRoot, version: options.version, signal }))

  server.registerTool(
    'check',
    {
      title: 'Check a repository',
      description:
        'Analyse the repository and report what is wrong, as a report written to be acted on by an agent: ' +
        'grouped by concept, split into what `sgate fix` rewrites and what needs your judgement, and ending in ' +
        'concrete next actions. Runs every installed engine. Read `outcome` before concluding anything from a ' +
        'zero finding count — a run that could not check everything says so there.',
      inputSchema: CHECK_INPUT,
      outputSchema: CHECK_OUTPUT,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args, ctx) => call(callCheck, args, ctx.mcpReq.signal),
  )

  server.registerTool(
    'explain_concept',
    {
      title: 'Explain a concept',
      description:
        'Explain why one concept is enabled or disabled in this repository, which engine rule owns it, what ' +
        'lost arbitration for it, and whether an absent engine would have owned it instead. Takes the `concept` ' +
        'of a finding, not its `ruleRefKey`. Runs no engines.',
      inputSchema: EXPLAIN_INPUT,
      outputSchema: EXPLAIN_OUTPUT,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args, ctx) => call(callExplain, args, ctx.mcpReq.signal),
  )

  server.registerTool(
    'propose_fixes',
    {
      title: 'Propose fixes',
      description:
        'Show the exact edits `sgate fix` would write, as unified diffs, without writing any of them. This tool ' +
        'never modifies a file: applying is left to a human running `sgate fix`, because a tool that rewrites a ' +
        'repository because a model asked it to is not the same risk as a command someone typed.',
      inputSchema: PROPOSE_INPUT,
      outputSchema: PROPOSE_OUTPUT,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args, ctx) => call(callPropose, args, ctx.mcpReq.signal),
  )

  return server
}
