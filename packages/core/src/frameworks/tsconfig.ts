import { posix } from 'node:path'
import { extractStringList, extractStringLiteral } from './literal.ts'

/**
 * What a `compilerOptions.jsx` value means for whether `React` has to be in scope. Measured against
 * tsc 5.9.3 rather than read off the documentation — see the `react-jsx-transform` profile.
 */
export type JsxTransform = 'automatic' | 'classic' | 'deferred'

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

/**
 * The paths TypeScript would try for one `extends` target. A specifier ending in `.json` is taken
 * literally; anything else gets `.json` appended and, failing that, is treated as a directory
 * holding a `tsconfig.json` — the same two completions `tsc` applies.
 */
function completions(base: string): string[] {
  return base.endsWith('.json') ? [base] : [`${base}.json`, posix.join(base, 'tsconfig.json')]
}

/**
 * Every candidate path for `specifier` written in `from`, most-likely first.
 *
 * A relative specifier resolves against the extending file's own directory. A bare one is a package
 * name, which TypeScript resolves through `node_modules` — walking up from that directory, exactly
 * as a runtime `import` would. The walk is bounded by the repository root: a `node_modules` above it
 * belongs to something slop-gate was not pointed at.
 *
 * Deliberately not a full module resolver. `exports` maps, `imports` subpaths and `typesVersions`
 * are not consulted, so a package that publishes its config behind one of those resolves to nothing
 * — and the caller turns that into a *stood-down profile with a reason*, never into a guess.
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
 * The effective `compilerOptions.jsx` for one config file, following `extends` to wherever the value
 * is actually written.
 *
 * This exists because a leaf `tsconfig.json` in a monorepo usually says almost nothing — that is the
 * point of the file. Measured on a 28-package React monorepo: only 4 of 19 config files set `jsx` at
 * all, and none of the four belonged to one of the three Next.js apps that hold most of the `.tsx`;
 * those reach it through `"extends": "../../tsconfig.app.json"`.
 *
 * TypeScript's own precedence, and both halves matter: **the extending file wins over everything it
 * extends**, and within the 5.0 array form **later entries win over earlier ones**. So the search is
 * own-value first, then the array walked back to front.
 *
 * Never throws and never loops: a config already on the current chain is skipped, which makes a
 * cycle end the search rather than hang it.
 */
export async function resolveJsx(file: string, readText: ReadText): Promise<EffectiveJsx> {
  return resolve(file, readText, new Set())
}

async function resolve(file: string, readText: ReadText, seen: Set<string>): Promise<EffectiveJsx> {
  if (seen.has(file)) return { kind: 'none' }
  seen.add(file)

  const source = await readText(file)
  if (source === null) return { kind: 'unknown', reason: `${file} could not be read` }

  const own = extractStringLiteral(source, ['compilerOptions', 'jsx'])
  if (own !== null) {
    return { kind: 'set', transform: TRANSFORMS[own] ?? 'deferred', value: own, declaredIn: file }
  }

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
    const inherited = await resolve(reached, readText, seen)
    if (inherited.kind !== 'none') return inherited
  }

  return { kind: 'none' }
}
