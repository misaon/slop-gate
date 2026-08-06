import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { openCatalogue } from './catalogue.ts'

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

const app = new Hono()

app.get('/api/rules', async (context) => context.json(await catalogue.get()))

app.get('/api/health', (context) => context.json({ ok: true, generation: catalogue.generation() }))

/**
 * The page subscribes here and refetches when the registry source changes, so an edit to a rule is
 * on screen without anyone reloading. A heartbeat keeps the connection through the idle timeouts
 * proxies and browsers apply to a stream that says nothing for minutes.
 */
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
