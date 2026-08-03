import { createHash } from 'node:crypto'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, parse as parsePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ConfigError } from '../errors.ts'
import { nearestName } from '../nearest-name.ts'
import { PRESETS } from './presets.ts'
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string')

/** What one top-level key must look like, and how to say so to whoever wrote it. */
type KeyShape = { readonly expected: string; readonly ok: (value: unknown) => boolean }

/**
 * The coarse shape of every `SlopGateConfig` key, checked before the cast in `loadConfig` — the only
 * point where a hand-written module becomes a typed value the rest of the run trusts.
 *
 * **Coarse on purpose, and it stops exactly where `RuleOptions` says core's opinion stops.** A rule
 * map's *values* are not checked here: the engine adapter that owns the elected rule is what gives an
 * option shape meaning, and oxlint refuses to parse its own config and names the offending key.
 * What is checked is every place a wrong shape is silently absorbed or crashes with a TypeError's own
 * words — `extends: 'recommended'` iterated as characters, `ignore: 'dist'` read as five patterns, a
 * single `overrides` block written where the list belongs.
 *
 * Declared as a `Record` over `keyof SlopGateConfig` via `satisfies`, so adding a config key without
 * a shape for it does not compile.
 */
const CONFIG_SHAPE = new Map<string, KeyShape>(
  Object.entries({
    extends: {
      expected: `an array of preset names (${Object.keys(PRESETS).join(', ')})`,
      ok: (value) => Array.isArray(value) && value.every((name) => typeof name === 'string' && Object.hasOwn(PRESETS, name)),
    },
    workspaces: { expected: "'auto' or an array of directory globs", ok: (value) => value === 'auto' || isStringList(value) },
    rules: { expected: 'an object mapping rule keys to levels', ok: isPlainObject },
    overrides: {
      expected: 'an array of `{ files, rules }` blocks',
      ok: (value) =>
        Array.isArray(value) &&
        value.every(
          (block) =>
            isPlainObject(block) && isStringList(block['files']) && (block['rules'] === undefined || isPlainObject(block['rules'])),
        ),
    },
    owners: { expected: 'an object mapping concept ids to engine ids', ok: isPlainObject },
    engines: { expected: 'an object mapping engine ids to their options', ok: isPlainObject },
    ignore: { expected: 'an array of path globs', ok: isStringList },
    generated: { expected: "'skip' or 'check'", ok: (value) => value === 'skip' || value === 'check' },
  } satisfies Record<keyof SlopGateConfig, KeyShape>),
)

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
  if (!isPlainObject(exported)) {
    throw new ConfigError(
      `${file} must export a configuration object, received ${Array.isArray(exported) ? 'an array' : typeof exported}.`,
    )
  }

  for (const [key, value] of Object.entries(exported)) {
    const shape = CONFIG_SHAPE.get(key)
    if (shape === undefined) {
      const meant = nearestName(key, CONFIG_SHAPE.keys())
      throw new ConfigError(
        `${file} sets an unknown top-level key \`${key}\`. ` +
          (meant === undefined ? `Known keys: ${[...CONFIG_SHAPE.keys()].join(', ')}.` : `Did you mean \`${meant}\`?`),
      )
    }
    // `undefined` is how an optional key is spelled when it is computed, so it has to mean absent
    // rather than "present and the wrong shape".
    if (value !== undefined && !shape.ok(value)) {
      throw new ConfigError(`${file}: \`${key}\` must be ${shape.expected}.`)
    }
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

    // oxc-transform is error-tolerant: a total parse failure yields `code: ''` plus a populated `errors`, and an
    // empty module imports perfectly well. Without this check the user is told to add a default export when
    // their real problem is an unclosed brace, and oxc's own precise diagnostic is thrown away.
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
 * Node emits a `[MODULE_TYPELESS_PACKAGE_JSON]` process warning whenever `import()` has to load a `.ts`/`.js`
 * file it cannot definitively classify as CommonJS or ESM from the containing `package.json`'s `type` field
 * alone — exactly what happens loading a hand-written `.ts` config outside a `"type": "module"` project.
 * `runInit` (`packages/cli/src/commands/init.ts`) writes the unambiguous `.mts` for such projects, but that only
 * helps *new* setups: an existing `.ts` config still prints four lines of Node internals in every report.
 *
 * **An *additional* `process.on('warning', ...)` listener does not suppress it.** Node's own stderr-printing is
 * itself just another 'warning' listener, and adding one never stops the existing ones from also firing. Every
 * existing listener has to be removed for the duration and reinstalled afterwards — which is also what keeps
 * this suppression scoped to loading one file rather than the rest of the process's lifetime.
 *
 * **"Afterwards" cannot mean "immediately after `fn()`'s promise resolves".** Node emits this particular warning
 * a tick or so after `import()` settles — after the import's own continuation runs, strictly before the next
 * macrotask, never synchronously. A `finally` that restores the original listeners right after `await fn()` lets
 * the warning slip through onto the just-restored original handler instead of the filter that was supposed to
 * catch it; yielding once via `setImmediate` first is what keeps the filter installed long enough.
 *
 * Matches on `warning.code`, never on `warning.message`: the message is Node's prose to reword at any time,
 * `code` is the stable documented identifier (see nodejs.org/api/module.html#module_typeless_package_json).
 *
 * **Re-entrant, via a depth count over one shared filter rather than a filter per call.** With a filter
 * per call, each one captured "whatever was installed when *I* started", so two overlapping calls
 * finishing in the other order reinstalled the first call's filter as the process's only 'warning'
 * listener and left it there — the exact opposite of the scoping above. One filter and a count restore
 * the real listeners once, when the last call in flight finishes.
 */
let suppressionDepth = 0
let suppressedListeners: Array<(warning: Error) => void> = []

const filterWarning = (warning: NodeJS.ErrnoException): void => {
  if (warning.code === MODULE_TYPELESS_WARNING_CODE) return
  for (const listener of suppressedListeners) listener(warning)
}

export async function suppressModuleTypelessPackageJsonWarning<T>(fn: () => Promise<T>): Promise<T> {
  if (suppressionDepth === 0) {
    suppressedListeners = process.listeners('warning') as Array<(warning: Error) => void>
    process.removeAllListeners('warning')
    process.on('warning', filterWarning)
  }
  suppressionDepth++

  try {
    return await fn()
  } finally {
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    suppressionDepth--
    if (suppressionDepth === 0) {
      process.removeAllListeners('warning')
      for (const listener of suppressedListeners) process.on('warning', listener)
      suppressedListeners = []
    }
  }
}

function isModuleNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND'
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
