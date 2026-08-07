import { createHash } from 'node:crypto'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, parse as parsePath } from 'node:path'
import { setImmediate as yieldToPending } from 'node:timers/promises'
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

type KeyShape = { readonly expected: string; readonly ok: (value: unknown) => boolean }

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
    if (value !== undefined && !shape.ok(value)) {
      throw new ConfigError(`${file}: \`${key}\` must be ${shape.expected}.`)
    }
  }

  return { config: exported, file }
}

async function importModule(file: string): Promise<unknown> {
  try {
    return await suppressModuleTypelessPackageJsonWarning(() => import(pathToFileURL(file).href))
  } catch (cause) {
    if (isModuleNotFound(cause)) {
      throw new ConfigError(unresolvedImportMessage(file, cause), { cause })
    }
    return await importTransformed(file, cause)
  }
}

async function importTransformed(file: string, originalCause: unknown): Promise<unknown> {
  const { dir, name } = parsePath(file)
  let scratch: string | undefined

  try {
    const source = await readFile(file, 'utf8')
    const { transform } = await import('oxc-transform')
    const result = await transform(file, source, { sourcemap: false })

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

let suppressionDepth = 0
let suppressedListeners: Array<(warning: Error) => void> = []

const filterWarning = (warning: NodeJS.ErrnoException): void => {
  if (warning.code === MODULE_TYPELESS_WARNING_CODE) return
  for (const listener of suppressedListeners) listener(warning)
}

export async function suppressModuleTypelessPackageJsonWarning<T>(fn: () => Promise<T>): Promise<T> {
  if (suppressionDepth === 0) {
    suppressedListeners = process.listeners('warning')
    process.removeAllListeners('warning')
    process.on('warning', filterWarning)
  }
  suppressionDepth++

  try {
    return await fn()
  } finally {
    await yieldToPending()
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

const UNRESOLVED = /Cannot find (package|module) '([^']+)'/

// A bare specifier is a package you can install; a path that does not exist is usually a tsconfig
// alias the runtime cannot see. Same error code from Node, opposite remedies.
function unresolvedImportMessage(file: string, cause: unknown): string {
  const match = UNRESOLVED.exec(describe(cause))
  const specifier = match?.[2]

  if (match?.[1] === 'package' && specifier !== undefined) {
    return (
      `${file} imports \`${specifier}\`, which is not installed in this project. Config files are ` +
      `loaded by the runtime directly, so every package a config imports has to be a real ` +
      `dependency — install it with \`npm install -D ${specifier}\`.`
    )
  }

  const named = specifier === undefined ? 'a module' : `\`${specifier}\``
  return (
    `${file} imports ${named}, which could not be resolved. Config files are loaded by the ` +
    `runtime directly, so tsconfig path aliases are not available — use a relative path or a ` +
    `package.json "imports" subpath instead.`
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
