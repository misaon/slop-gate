import { posix } from 'node:path'
import { compareStrings } from '../ordering.ts'
import { extractStringList, extractStringLiteral } from './literal.ts'

/** What a `compilerOptions.jsx` value means for whether `React` has to be in scope. Measured against
 *  tsc 5.9.3 rather than read off the documentation — see the `react-jsx-transform` profile. */
type JsxTransform = 'automatic' | 'classic' | 'deferred'

export type EffectiveJsx =
  /** Resolved to a value, `declaredIn` naming the file that actually wrote it. */
  | { readonly kind: 'set'; readonly transform: JsxTransform; readonly value: string; readonly declaredIn: string }
  /** The chain completed and nothing in it configures `jsx`. */
  | { readonly kind: 'none' }
  /** The chain broke, so a `"jsx": "react"` further up would have been missed. */
  | { readonly kind: 'unknown'; readonly reason: string }

const TRANSFORMS: Readonly<Record<string, JsxTransform>> = {
  'react-jsx': 'automatic',
  'react-jsxdev': 'automatic',
  react: 'classic',
  preserve: 'deferred',
  'react-native': 'deferred',
}

/** A `tsconfig.json`, `tsconfig.app.json`, `jsconfig.json` — anything `extends` can name. */
export const TSCONFIG = /(^|\/)[jt]sconfig(\.[^/]+)?\.json$/

/** The paths TypeScript would try for one `extends` target — the same two completions `tsc` applies: a
 *  specifier ending in `.json` is taken literally, anything else gets `.json` appended and, failing that,
 *  is treated as a directory holding a `tsconfig.json`. */
function completions(base: string): string[] {
  return base.endsWith('.json') ? [base] : [`${base}.json`, posix.join(base, 'tsconfig.json')]
}

/**
 * Every candidate path for `specifier` written in `from`, most-likely first. A relative specifier resolves
 * against the extending file's own directory; a bare one is a package name, resolved through
 * `node_modules` walking up from that directory exactly as a runtime `import` would. The walk is bounded
 * by the repository root: a `node_modules` above it belongs to something slop-gate was not pointed at.
 *
 * Deliberately not a full module resolver — `exports` maps, `imports` subpaths and `typesVersions` are not
 * consulted, so a package that publishes its config behind one of those resolves to nothing, which the
 * caller turns into a *stood-down profile with a reason*, never into a guess.
 */
function candidates(specifier: string, from: string): string[] {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return completions(posix.normalize(posix.join(posix.dirname(from), specifier)))
  }
  if (specifier.startsWith('/') || /^[a-zA-Z]:/.test(specifier)) return []

  const found: string[] = []
  let directory = posix.dirname(from)
  for (;;) {
    const base = directory === '.' ? 'node_modules' : posix.join(directory, 'node_modules')
    found.push(...completions(posix.join(base, specifier)))
    if (directory === '.' || directory === '/' || directory === '') break
    directory = posix.dirname(directory)
  }
  return found
}

type ReadText = (path: string) => Promise<string | null>

/**
 * The effective `compilerOptions.jsx` for one config file, following `extends` to wherever the value is
 * actually written — a leaf `tsconfig.json` in a monorepo usually says almost nothing, which is the point
 * of the file, and reaches `jsx` through something like `"extends": "../../tsconfig.app.json"`.
 *
 * TypeScript's own precedence, and both halves matter: **the extending file wins over everything it
 * extends**, and within the 5.0 array form **later entries win over earlier ones**. So the search is
 * own-value first, then the array walked back to front.
 *
 * Never throws and never loops: a config already on the current chain is skipped, which makes a cycle end
 * the search rather than hang it.
 */
export async function resolveJsx(file: string, readText: ReadText): Promise<EffectiveJsx> {
  const option = await resolveOption(file, ['compilerOptions', 'jsx'], readText, new Set())
  if (option.kind !== 'set') return option
  return { kind: 'set', transform: TRANSFORMS[option.value] ?? 'deferred', value: option.value, declaredIn: option.declaredIn }
}

/**
 * The effective `compilerOptions.jsxImportSource`, resolved through the same chain and independently of
 * `jsx` — TypeScript inherits each compiler option separately, so the two can be written in different
 * files, and on `honojs/hono` they are.
 *
 * **This is the evidence `jsx` alone cannot give.** `"jsx": "preserve"` says only that TypeScript emits
 * the JSX untouched and something downstream decides; the `react-jsx-transform` profile therefore treats
 * it as no evidence in either direction. But a `jsxImportSource` naming anything other than `react` says
 * outright whose runtime that downstream step targets — `solid-js`, `hono/jsx`, `preact` — and a project
 * compiling JSX to somebody else's runtime cannot need `React` in scope.
 */
export async function resolveJsxImportSource(file: string, readText: ReadText): Promise<EffectiveOption> {
  return resolveOption(file, ['compilerOptions', 'jsxImportSource'], readText, new Set())
}

export type EffectiveOption =
  | { readonly kind: 'set'; readonly value: string; readonly declaredIn: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown'; readonly reason: string }

async function resolveOption(
  file: string,
  property: readonly string[],
  readText: ReadText,
  seen: Set<string>,
): Promise<EffectiveOption> {
  if (seen.has(file)) return { kind: 'none' }
  seen.add(file)

  const source = await readText(file)
  if (source === null) return { kind: 'unknown', reason: `${file} could not be read` }

  const own = extractStringLiteral(source, property)
  if (own !== null) return { kind: 'set', value: own, declaredIn: file }

  const extended = extractStringList(source, ['extends'])
  if (extended.kind === 'absent') return { kind: 'none' }
  if (extended.kind === 'unreadable') {
    return { kind: 'unknown', reason: `\`extends\` in ${file} is not a plain string or array of them` }
  }

  for (const specifier of [...extended.values].reverse()) {
    const paths = candidates(specifier, file)
    let reached: string | null = null
    for (const path of paths) {
      if (seen.has(path)) {
        reached = path
        break
      }
      if ((await readText(path)) !== null) {
        reached = path
        break
      }
    }
    if (reached === null) {
      return { kind: 'unknown', reason: `${file} extends \`${specifier}\`, which resolves to no file here` }
    }
    const inherited = await resolveOption(reached, property, readText, seen)
    if (inherited.kind !== 'none') return inherited
  }

  return { kind: 'none' }
}

/**
 * The paths one config governs, as `disable-concept` globs — its own `include` list resolved against its
 * directory, or that whole directory when it has none.
 *
 * **Deliberately not inherited through `extends`.** TypeScript does inherit `include`, but a base config
 * that says `["src"]` means *its own* `src`, and a leaf two directories down inheriting that would be
 * scoped to a directory it does not own. Reading only the config's own list keeps every pattern relative
 * to the file that wrote it; a leaf with no `include` falls back to its directory, which is the same
 * answer with none of the aliasing.
 *
 * **Each entry is cut back to its literal prefix and given a `/**` tail.** A bare `"src"` entry means the
 * directory's contents, which picomatch does not match on its own, and `src/**‌/*.ts` narrows to a file
 * extension this profile has no business honouring — the question here is *which files a config governs*,
 * not which of them TypeScript compiles. Cutting at the first wildcard answers exactly that, and it is
 * why `"src"` and `"src/**‌/*.tsx"` both come back as `src/**`.
 *
 * **An unreadable list widens to the directory rather than narrowing on a guess** — the same standing-down
 * instinct the rest of this module applies, pointed the one way that cannot silently turn a rule off over
 * code nobody looked at.
 */
export async function resolveIncludeScope(file: string, readText: ReadText): Promise<string[]> {
  const directory = posix.dirname(file)
  const whole = [directory === '.' ? '**' : `${directory}/**`]

  const source = await readText(file)
  if (source === null) return whole

  const include = extractStringList(source, ['include'])
  if (include.kind !== 'values' || include.values.length === 0) return whole

  const bases = new Set<string>()
  for (const pattern of include.values) {
    const literal: string[] = []
    for (const segment of pattern.split('/')) {
      if (WILDCARD.test(segment)) break
      literal.push(segment)
    }
    const joined = posix.normalize(posix.join(directory, literal.join('/')))
    bases.add(joined === '.' || joined === '' ? '' : joined)
  }

  // `["src", "src/middleware/keys.test.json"]` is one scope, not two: an entry under another adds
  // nothing, and emitting both would make the recorded glob list longer than the fact behind it.
  const roots = [...bases].filter((base) => ![...bases].some((other) => other !== base && isUnder(base, other)))
  return roots.sort(compareStrings).map((base) => (base === '' ? '**' : `${base}/**`))
}

const WILDCARD = /[*?[\]{}]/

/** True when `path` is `ancestor` itself or lies beneath it. `''` is the repository root, above everything. */
function isUnder(path: string, ancestor: string): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}/`)
}
