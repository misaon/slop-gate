import { createHash } from 'node:crypto'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, parse as parsePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ConfigError } from '../errors.ts'
import type { SlopGateConfig } from './types.ts'

const CONFIG_BASENAMES = [
  'slop-gate.config.ts',
  'slop-gate.config.mts',
  'slop-gate.config.js',
  'slop-gate.config.mjs',
] as const

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

export async function findConfigFile(cwd: string): Promise<string | null> {
  let current = cwd
  for (;;) {
    for (const basename of CONFIG_BASENAMES) {
      const candidate = join(current, basename)
      if (await exists(candidate)) return candidate
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function loadConfig(
  cwd: string,
): Promise<{ config: SlopGateConfig; file: string } | null> {
  const file = await findConfigFile(cwd)
  if (file === null) return null

  const module = await importModule(file)
  const exported = (module as { default?: unknown }).default

  if (exported === undefined) {
    throw new ConfigError(`${file} has no default export. Use \`export default defineConfig({ ... })\`.`)
  }
  if (typeof exported !== 'object' || exported === null || Array.isArray(exported)) {
    throw new ConfigError(`${file} must export a configuration object, received ${typeof exported}.`)
  }

  return { config: exported as SlopGateConfig, file }
}

async function importModule(file: string): Promise<unknown> {
  try {
    return await import(pathToFileURL(file).href)
  } catch (cause) {
    if (isModuleNotFound(cause)) {
      throw new ConfigError(
        `${file} imports a module that could not be resolved. Config files are loaded by the ` +
          `runtime directly, so tsconfig path aliases are not available — use a relative path or a ` +
          `package.json "imports" subpath instead.`,
        { cause },
      )
    }
    return await importTransformed(file, cause)
  }
}

/**
 * Fallback for syntax the runtime cannot strip on its own. The transformed file is written next to
 * the original rather than to a temp directory so relative imports inside the config still resolve.
 */
async function importTransformed(file: string, originalCause: unknown): Promise<unknown> {
  const { dir, name } = parsePath(file)
  let scratch: string | undefined

  try {
    const source = await readFile(file, 'utf8')
    const { transform } = await import('oxc-transform')
    const result = await transform(file, source, { sourcemap: false })

    // oxc-transform is error-tolerant: a total parse failure yields `code: ''` plus a populated
    // `errors`, and an empty module imports perfectly well. Without this check the caller reaches
    // the "no default export" branch and the user is told to add an export when their real problem
    // is an unclosed brace, while oxc's own precise diagnostic is thrown away.
    const [firstError] = result.errors
    if (firstError !== undefined) {
      throw new ConfigError(`${file} could not be parsed: ${firstError.codeframe ?? firstError.message}`)
    }

    const token = createHash('sha256').update(source).digest('hex').slice(0, 8)
    scratch = join(dir, `${name}.${token}.sgate.mjs`)
    await writeFile(scratch, result.code, 'utf8')
    return await import(pathToFileURL(scratch).href)
  } catch (cause) {
    if (cause instanceof ConfigError) throw cause
    throw new ConfigError(
      `failed to load ${file}: ${describe(originalCause)} (fallback also failed: ${describe(cause)})`,
      { cause },
    )
  } finally {
    if (scratch !== undefined) await rm(scratch, { force: true })
  }
}

function isModuleNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_MODULE_NOT_FOUND'
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
