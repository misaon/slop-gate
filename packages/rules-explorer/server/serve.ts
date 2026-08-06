import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { buildRuleCatalogue, IMPACTS, summariseCatalogue, type CatalogueEntry } from '@misaon/slop-gate-core'
import { Hono } from 'hono'
import { buildRuleHistory, type RuleHistory } from '../scripts/history.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const clientDir = join(here, '..', 'dist', 'client')

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
}

type Payload = {
  readonly generatedAt: string
  readonly rules: readonly CatalogueEntry[]
  readonly summary: ReturnType<typeof summariseCatalogue>
  readonly impacts: typeof IMPACTS
  readonly history: RuleHistory
}

/**
 * The catalogue is static data compiled into core, and the history is a walk of a handful of
 * commits. Both are the same for the life of the process, so they are built once and held.
 */
let payload: Promise<Payload> | null = null

function load(): Promise<Payload> {
  payload ??= (async () => {
    const rules = buildRuleCatalogue()
    const history = await buildRuleHistory(repoRoot).catch(
      (): RuleHistory => ({ origins: {}, removed: [] }),
    )
    return {
      generatedAt: new Date().toISOString(),
      rules,
      summary: summariseCatalogue(rules),
      impacts: IMPACTS,
      history,
    }
  })()
  return payload
}

const app = new Hono()

app.get('/api/rules', async (context) => context.json(await load()))

app.get('/api/health', (context) => context.json({ ok: true }))

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
  process.stdout.write(`rules explorer on http://${hostname}:${info.port}\n`)
})
