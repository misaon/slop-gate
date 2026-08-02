import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { afterEach, beforeEach, expect, test } from 'vitest'

/**
 * The MCP surface driven the way a host actually drives it: the published `bin/sgate.js`, spawned as
 * a subprocess, spoken to over real newline-delimited JSON-RPC on its stdin and stdout by the
 * official client SDK.
 *
 * The unit tests next door call the handlers directly, which proves what the tools compute and
 * nothing about whether any of it reaches a client. Everything between — the stateless 2026-07-28
 * opening with no handshake, `server/discover`, JSON Schema generation for `tools/list`, output
 * validation against the declared schemas, the framing, the shutdown — only exists on this path.
 *
 * **This runs the built `dist`, not `src`.** That is the point (it is what a user installs) and the
 * cost (a stale build tests stale code), which is why the repository's convention is `pnpm build`
 * before `pnpm test`.
 */
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'sgate.js')

/**
 * The revision this server is written against, and the one the tests below pin.
 *
 * Pinned rather than left to the client's default on purpose. `Client`'s `versionNegotiation.mode`
 * defaults to `'legacy'` — a v2 client with no options opens with the 2025 `initialize` handshake,
 * and our server answers it, because `serveStdio` serves both eras from one factory. That is
 * backward compatibility working correctly, and it is also a way for every test here to pass without
 * the modern path ever being exercised. `{ pin }` removes the fallback entirely: connect fails
 * loudly unless `server/discover` offers this exact revision.
 */
const REVISION = '2026-07-28'

let dir: string
let client: Client
const open = async (mode: 'legacy' | 'auto' | { pin: string }): Promise<Client> => {
  const connected = new Client({ name: 'slop-gate-e2e', version: '0.0.0' }, { versionNegotiation: { mode } })
  await connected.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd: dir, stderr: 'ignore' }))
  return connected
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-mcp-e2e-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'spread.ts'), 'export const v = { ...{ a: 1 } }\n')
  // Pinned rather than inherited, and the reason is that these tests are about the MCP tool's own
  // output shape, not about what `recommended` happens to contain this month. Several of its concepts
  // cannot be satisfied by a bare temp directory at all: `types.type-error` needs a tsconfig and an
  // installed `typescript`, `dead-code.unused-file` calls every file here unreachable because there is
  // no entry point, and the three `deps-security` concepts need an advisory snapshot that only
  // `sgate engines install advisories` writes. Left inherited, each turned "a clean run says clean"
  // red the first time the preset grew — a test asserting the preset's size through a hole in the
  // fixture. Everything these tests actually drive (oxlint findings, the actionlint gap, schema) is
  // untouched.
  //
  // The neighbouring `tools.test.ts` constructs an advisory snapshot instead of switching the
  // concepts off, and the difference is not a preference: that file calls the handlers in-process, so
  // `SLOP_GATE_ADVISORIES_PATH` reaches them. This one spawns the published `bin/sgate.js` over stdio
  // through a transport that passes a filtered environment, so the config file is the only channel
  // into the child that is certain to arrive.
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    'export default { extends: [\'recommended\'], rules: { ' +
      "'types.type-error': 'off', 'dead-code.unused-file': 'off', " +
      "'security.vulnerable-dependency': 'off', 'security.malicious-dependency': 'off', " +
      "'deps.advisory-coverage-gap': 'off' } }\n",
  )
  client = await open({ pin: REVISION })
})

afterEach(async () => {
  await client.close()
  await rm(dir, { recursive: true, force: true })
})

test('connecting pinned to the stateless revision succeeds, with no handshake to fall back on', async () => {
  // The connect in `beforeEach` already proves this — `{ pin }` rejects rather than falling back —
  // so this asserts what the pinned connection then reports about itself.
  const discovered = await client.discover()

  expect(discovered.supportedVersions).toContain(REVISION)
  expect(discovered.capabilities.tools).toBeDefined()
  expect(discovered.instructions).toContain('never read an empty findings list as a pass')
}, 60_000)

test('a client probing for the modern era finds it rather than falling back', async () => {
  // `'auto'` is what a host that supports both eras does: probe with `server/discover`, and treat
  // anything short of definitive modern evidence as a legacy server. Landing on the legacy path here
  // would be silent — every tool would still work — so it is asserted rather than assumed.
  const probing = await open('auto')
  try {
    expect((await probing.discover()).supportedVersions).toContain(REVISION)
  } finally {
    await probing.close()
  }
}, 60_000)

test('a client that only speaks the 2025 handshake is still served', async () => {
  // The SDK's own default, and therefore the common case for a while yet. Worth pinning as a
  // property rather than discovering as a surprise: one factory serves both eras, so nothing about
  // the tool surface depends on which era the caller is from.
  const legacy = await open('legacy')
  try {
    const { tools } = await legacy.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(['check', 'explain_concept', 'propose_fixes'])
  } finally {
    await legacy.close()
  }
}, 60_000)

test('tools/list offers exactly the three tools, all marked read-only', async () => {
  const { tools } = await client.listTools()

  expect(tools.map((tool) => tool.name).sort()).toEqual(['check', 'explain_concept', 'propose_fixes'])
  for (const tool of tools) {
    expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
    expect(tool.inputSchema, tool.name).toBeDefined()
    expect(tool.outputSchema, tool.name).toBeDefined()
  }
}, 60_000)

test('the schema a client reads tells it, before any call, that propose_fixes cannot write', async () => {
  // `applied` is a `const: false` in the published output schema, so "this tool never writes" is
  // something a host can see in `tools/list` rather than a promise buried in prose.
  const { tools } = await client.listTools()
  const schema = tools.find((tool) => tool.name === 'propose_fixes')?.outputSchema as
    | { properties?: { applied?: { const?: unknown } }; required?: string[] }
    | undefined

  expect(schema?.properties?.applied?.const).toBe(false)
  expect(schema?.required).toContain('applied')
}, 60_000)

test('the check tool round-trips a real finding, with the report as text and the rollup as structure', async () => {
  const result = await client.callTool({ name: 'check', arguments: {} })

  expect(result.isError).toBeFalsy()
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? ''
  expect(text).toContain('slop-gate agent report v1')
  expect(text).toContain('nextActions')

  const data = result.structuredContent as { outcome: string; complete: boolean; concepts: Array<{ concept: string }> }
  expect(data.outcome).toBe('findings')
  expect(data.complete).toBe(true)
  expect(data.concepts.length).toBeGreaterThan(0)
  for (const concept of data.concepts) expect(text).toContain(`### ${concept.concept}`)
}, 120_000)

test('every check result satisfies the declared output schema, validated by the client', async () => {
  // Not decoration. The SDK validates `structuredContent` against `outputSchema` before it reaches
  // the wire, so the required `outcome`/`gaps` fields are enforced rather than merely intended: a
  // future edit that drops the coverage block turns into a loud validation failure instead of a
  // quietly reassuring result. This asserts the client sees a conforming payload, which is the half
  // of that contract observable from outside the server.
  const result = await client.callTool({ name: 'check', arguments: {} })
  const data = result.structuredContent as Record<string, unknown>

  for (const field of ['outcome', 'complete', 'gaps', 'counts', 'concepts', 'uncoveredConcepts', 'unknownConfigKeys', 'reportTruncated']) {
    expect(data, field).toHaveProperty(field)
  }
}, 120_000)

test('propose_fixes returns a diff over the wire and leaves the file alone', async () => {
  const { readFile } = await import('node:fs/promises')
  const before = await readFile(join(dir, 'spread.ts'), 'utf8')

  const result = await client.callTool({ name: 'propose_fixes', arguments: { tier: 'unsafe' } })
  const data = result.structuredContent as { applied: boolean; command: string; files: Array<{ diff: string }> }

  expect(data.applied).toBe(false)
  expect(data.command).toBe('sgate fix --unsafe')
  expect(data.files[0]?.diff).toContain('spread.ts')
  expect(await readFile(join(dir, 'spread.ts'), 'utf8')).toBe(before)
}, 120_000)

test('explain_concept answers over the wire, and a rule id comes back as a correctable tool error', async () => {
  const explained = await client.callTool({ name: 'explain_concept', arguments: { concept: 'correctness.no-debugger' } })
  expect(explained.isError).toBeFalsy()
  expect((explained.structuredContent as { known: boolean }).known).toBe(true)

  const misused = await client.callTool({ name: 'explain_concept', arguments: { concept: 'oxlint/no-debugger' } })
  expect(misused.isError).toBe(true)
  expect((misused.content as Array<{ text: string }>)[0]?.text).toContain('is a rule id, not a concept id')
}, 60_000)

test('a bad argument is rejected by the declared input schema rather than reaching the handler', async () => {
  const result = await client.callTool({ name: 'check', arguments: { maxTokens: -5 } })

  expect(result.isError).toBe(true)
  expect((result.content as Array<{ text: string }>)[0]?.text).toContain('validation')
}, 60_000)

test('the server writes nothing to stderr on a normal run', async () => {
  // stderr is the operator's channel and the client is told not to read it as failure, so noise
  // there is not fatal — but a host that logs it gets a line per launch for nothing. This also
  // covers the interactive hint's guard: it is written only when stdin is a TTY, and under a client
  // it never is, so anything arriving here means that branch fired when it should not have.
  const piped = new Client({ name: 'stderr-probe', version: '0.0.0' }, { versionNegotiation: { mode: { pin: REVISION } } })
  const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd: dir, stderr: 'pipe' })
  let logged = ''
  await piped.connect(transport)
  transport.stderr?.on('data', (chunk: Uint8Array) => (logged += new TextDecoder().decode(chunk)))

  try {
    await piped.listTools()
    await piped.callTool({ name: 'explain_concept', arguments: { concept: 'correctness.no-debugger' } })
  } finally {
    await piped.close()
  }

  expect(logged).toBe('')
}, 60_000)

test('an unknown tool is a protocol error, not a tool result', async () => {
  // The spec's own split: a request the model cannot correct by adjusting arguments is a JSON-RPC
  // error, and only an actionable failure is an `isError` result.
  await expect(client.callTool({ name: 'no_such_tool', arguments: {} })).rejects.toThrow(/no_such_tool/)
}, 60_000)

test('two calls on one connection are independent, which is what statelessness has to mean in practice', async () => {
  // No handshake was performed and no session exists, so the second call must be answerable purely
  // from its own contents. Byte-identical results also re-prove the reporter's determinism through
  // the whole transport.
  const first = await client.callTool({ name: 'check', arguments: {} })
  const second = await client.callTool({ name: 'check', arguments: {} })

  expect(second.structuredContent).toEqual(first.structuredContent)
  expect(second.content).toEqual(first.content)
}, 180_000)
