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
    return await suppressModuleTypelessPackageJsonWarning(() => import(pathToFileURL(file).href))
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

const MODULE_TYPELESS_WARNING_CODE = 'MODULE_TYPELESS_PACKAGE_JSON'

/**
 * Node emits a `[MODULE_TYPELESS_PACKAGE_JSON]` process warning whenever `import()` has to load a
 * `.ts`/`.js` file it cannot definitively classify as CommonJS or ESM from the containing
 * `package.json`'s `type` field alone — exactly what happens loading a pre-existing or hand-written
 * `.ts` config outside a `"type": "module"` project. `runInit` (`packages/cli/src/commands/init.ts`)
 * writes `.mts` for such projects specifically to dodge this (an `.mts` extension is unambiguous),
 * but that only helps *new* setups: an existing `.ts` config still prints four lines of Node
 * internals in the middle of every report. The file is ours, loaded by our own code — the noise is
 * ours to own, not Node's.
 *
 * Suppressing it takes more than adding a `process.on('warning', ...)` listener alongside whatever
 * is already there: Node's own stderr-printing is itself just another 'warning' listener, and an
 * *additional* listener never stops the existing ones from also firing (verified empirically —
 * every existing listener has to be removed for the duration and reinstalled afterwards, which is
 * also what keeps this suppression scoped to loading this one file rather than the rest of the
 * process's lifetime).
 *
 * "Afterwards" cannot mean "immediately after `fn()`'s promise resolves", either: Node emits this
 * particular warning a tick or so after `import()` settles — empirically, after the import's own
 * continuation runs but strictly before the next macrotask, never synchronously with it. A `finally`
 * that restores the original listeners right after `await fn()` is too early: it lets the warning
 * slip through onto the just-restored original handler instead of the filter that was supposed to
 * catch it. Yielding once via `setImmediate` before restoring is what keeps the filter installed
 * long enough — verified by running this 30 times in a row against a real typeless `.ts` config with
 * a distinct, differently-coded warning emitted immediately after restore completed: the unrelated
 * warning printed every time, this one never did (see `.superpowers/rules-commands-report.md`).
 *
 * Matches on `warning.code`, never on `warning.message`: the message is Node's prose to reword at
 * any time; `code` is the stable, documented identifier
 * (see nodejs.org/api/module.html#module_typeless_package_json).
 */
export async function suppressModuleTypelessPackageJsonWarning<T>(fn: () => Promise<T>): Promise<T> {
  const previousListeners = process.listeners('warning') as Array<(warning: Error) => void>
  process.removeAllListeners('warning')
  process.on('warning', (warning: NodeJS.ErrnoException) => {
    if (warning.code === MODULE_TYPELESS_WARNING_CODE) return
    for (const listener of previousListeners) listener(warning)
  })

  try {
    return await fn()
  } finally {
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    process.removeAllListeners('warning')
    for (const listener of previousListeners) process.on('warning', listener)
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
