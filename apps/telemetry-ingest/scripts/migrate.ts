import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

/**
 * Applies the SQL in `migrations/` with the owner role, once, in order.
 *
 * The owner connection is read from the environment and used *only* here. Runtime uses
 * `TELEMETRY_INGEST_URL`, which can insert into two tables and nothing else.
 *
 * ```
 * pnpm --filter @misaon/slop-gate-telemetry-ingest migrate
 * ```
 */
const here = dirname(fileURLToPath(import.meta.url))

function statementsOf(source: string): string[] {
  return source
    .split(/;\s*\n/)
    // A file begins with a comment block, and so does most statements — stripping the leading
    // comment lines is not the same as dropping any chunk that starts with one, which silently
    // skipped the `create table` the first time this was written.
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((statement) => statement !== '')
}

const url = process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL']
if (url === undefined || url === '') {
  process.stderr.write('DATABASE_URL is not set. Run `vercel env pull .env.local` and source it.\n')
  process.exit(1)
}

const sql = neon(url)
const directory = join(here, '..', 'migrations')
const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()

for (const file of files) {
  // 002_roles.sql carries placeholder passwords and is applied by hand, once, by a human.
  if (file.includes('roles')) {
    process.stdout.write(`${file}: skipped — apply by hand after replacing the passwords\n`)
    continue
  }

  const statements = statementsOf(await readFile(join(directory, file), 'utf8'))
  for (const [index, statement] of statements.entries()) {
    try {
      await sql.query(statement)
    } catch (error) {
      process.stderr.write(`${file}: statement ${index + 1} failed — ${error instanceof Error ? error.message : String(error)}\n`)
      process.stderr.write(`${statement.slice(0, 200)}\n`)
      process.exit(1)
    }
  }
  process.stdout.write(`${file}: ${statements.length} statements applied\n`)
}
