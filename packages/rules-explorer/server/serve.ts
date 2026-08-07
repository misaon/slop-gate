import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { CatalogueStatus, Impact } from '@misaon/slop-gate-core'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { openCatalogue } from './catalogue.ts'
import { openRegistryWriter, type RuleEdit } from './registry-write.ts'
import { openTelemetry } from './telemetry.ts'

const here = import.meta.dirname
const repoRoot = resolve(here, '../../..')
const clientDir = join(here, '..', 'dist', 'client')

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
}

const catalogue = openCatalogue(repoRoot)
const telemetry = openTelemetry()
const writer = openRegistryWriter(repoRoot, catalogue)

const isStatus = (value: unknown): value is CatalogueStatus =>
  value === 'recommended' || value === 'withheld' || value === 'unlisted'
const isImpact = (value: unknown): value is Impact => value === 1 || value === 2 || value === 3

function readEdit(body: unknown): RuleEdit | null {
  if (typeof body !== 'object' || body === null) return null
  const fields = body as Record<string, unknown>

  const { ruleRefKey, status, impact, reason, evidence, impactNote } = fields
  if (typeof ruleRefKey !== 'string') return null
  if (status !== undefined && !isStatus(status)) return null
  if (impact !== undefined && !isImpact(impact)) return null

  const edit: { -readonly [K in keyof RuleEdit]: RuleEdit[K] } = { ruleRefKey }
  if (isStatus(status)) edit.status = status
  if (isImpact(impact)) edit.impact = impact
  if (typeof reason === 'string') edit.reason = reason
  if (typeof evidence === 'string') edit.evidence = evidence
  if (typeof impactNote === 'string') edit.impactNote = impactNote
  return edit
}

const app = new Hono()

app.get('/api/rules', async (context) => context.json(await catalogue.get()))

// This endpoint rewrites `packages/core/src`, and the server listens on every interface. Same-origin
// only, so a page a developer happens to have open cannot post an exclusion into their registry.
app.post('/api/rules', async (context) => {
  const origin = context.req.header('origin')
  if (origin !== undefined && new URL(origin).host !== new URL(context.req.url).host) {
    return context.json({ ok: false, error: 'Cross-origin edits are refused.' }, 403)
  }

  const edit = readEdit(await context.req.json().catch(() => null))
  if (edit === null) return context.json({ ok: false, error: 'Expected { ruleRefKey, status?, impact?, … }.' }, 400)

  const result = await writer.apply(edit)
  return context.json(result, result.ok ? 200 : 422)
})

app.get('/api/telemetry', async (context) => context.json(await telemetry.read()))

app.get('/api/health', (context) => context.json({ ok: true, generation: catalogue.generation() }))

// The heartbeat is not decoration: proxies and browsers drop a stream that says nothing for minutes.
app.get('/api/changes', (context) =>
  streamSSE(context, async (stream) => {
    const unsubscribe = catalogue.onChange((generation) => {
      void stream.writeSSE({ event: 'changed', data: String(generation) })
    })
    stream.onAbort(unsubscribe)

    await stream.writeSSE({ event: 'hello', data: String(catalogue.generation()) })
    while (!stream.closed) {
      await stream.sleep(25_000)
      await stream.writeSSE({ event: 'ping', data: '' })
    }
  }),
)

app.get('/*', async (context) => {
  const requested = new URL(context.req.url).pathname
  const candidate = requested === '/' ? '/index.html' : requested

  // Everything under dist/client is a build artefact of this package; refuse anything that escapes it.
  const target = resolve(join(clientDir, candidate))
  const file = target.startsWith(resolve(clientDir)) && existsSync(target) ? target : join(clientDir, 'index.html')
  if (!existsSync(file)) {
    return context.text('The client is not built. Run `pnpm --filter @misaon/slop-gate-rules-explorer build`.', 503)
  }

  const extension = file.slice(file.lastIndexOf('.'))
  return new Response(await readFile(file), {
    headers: { 'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream' },
  })
})

const port = Number(process.env['PORT'] ?? 4173)
const hostname = process.env['HOST'] ?? '0.0.0.0'

serve({ fetch: app.fetch, port, hostname }, (info) => {
  process.stdout.write(`rules explorer on http://${hostname}:${info.port}, watching packages/core/src\n`)
})
