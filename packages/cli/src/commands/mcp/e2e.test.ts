import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { afterEach, beforeEach, expect, test } from 'vitest'

const CLI = join(import.meta.dirname, '..', '..', '..', 'bin', 'sgate.js')

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
  const discovered = await client.discover()

  expect(discovered.supportedVersions).toContain(REVISION)
  expect(discovered.capabilities.tools).toBeDefined()
  expect(discovered.instructions).toContain('never read an empty findings list as a pass')
}, 60_000)

test('a client probing for the modern era finds it rather than falling back', async () => {
  const probing = await open('auto')
  try {
    expect((await probing.discover()).supportedVersions).toContain(REVISION)
  } finally {
    await probing.close()
  }
}, 60_000)

test('a client that only speaks the 2025 handshake is still served', async () => {
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
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? ''
  expect(text).toContain('slop-gate agent report v1')
  expect(text).toContain('nextActions')

  const data = result.structuredContent as { outcome: string; complete: boolean; concepts: { concept: string }[] }
  expect(data.outcome).toBe('findings')
  expect(data.complete).toBe(true)
  expect(data.concepts.length).toBeGreaterThan(0)
  for (const concept of data.concepts) expect(text).toContain(`### ${concept.concept}`)
}, 120_000)

test('every check result satisfies the declared output schema, validated by the client', async () => {
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
  const data = result.structuredContent as { applied: boolean; command: string; files: { diff: string }[] }

  expect(data.applied).toBe(false)
  expect(data.command).toBe('sgate fix --unsafe')
  expect(data.files[0]?.diff).toContain('spread.ts')
  await expect(readFile(join(dir, 'spread.ts'), 'utf8')).resolves.toBe(before)
}, 120_000)

test('explain_concept answers over the wire, and a rule id comes back as a correctable tool error', async () => {
  const explained = await client.callTool({ name: 'explain_concept', arguments: { concept: 'correctness.no-debugger' } })
  expect(explained.isError).toBeFalsy()
  expect((explained.structuredContent as { known: boolean }).known).toBe(true)

  const misused = await client.callTool({ name: 'explain_concept', arguments: { concept: 'oxlint/no-debugger' } })
  expect(misused.isError).toBe(true)
  expect((misused.content as { text: string }[])[0]?.text).toContain('is a rule id, not a concept id')
}, 60_000)

test('a bad argument is rejected by the declared input schema rather than reaching the handler', async () => {
  const result = await client.callTool({ name: 'check', arguments: { maxTokens: -5 } })

  expect(result.isError).toBe(true)
  expect((result.content as { text: string }[])[0]?.text).toContain('validation')
}, 60_000)

test('the server writes nothing to stderr on a normal run', async () => {
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
  await expect(client.callTool({ name: 'no_such_tool', arguments: {} })).rejects.toThrow(/no_such_tool/)
}, 60_000)

test('two calls on one connection are independent, which is what statelessness has to mean in practice', async () => {
  const first = await client.callTool({ name: 'check', arguments: {} })
  const second = await client.callTool({ name: 'check', arguments: {} })

  expect(second.structuredContent).toEqual(first.structuredContent)
  expect(second.content).toEqual(first.content)
}, 180_000)
