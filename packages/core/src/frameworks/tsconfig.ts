import { posix } from 'node:path'
import { compareStrings } from '../ordering.ts'
import { extractStringList, extractStringLiteral } from './literal.ts'

type JsxTransform = 'automatic' | 'classic' | 'deferred'

export type EffectiveJsx =
  | { readonly kind: 'set'; readonly transform: JsxTransform; readonly value: string; readonly declaredIn: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown'; readonly reason: string }

const TRANSFORMS: Readonly<Record<string, JsxTransform>> = {
  'react-jsx': 'automatic',
  'react-jsxdev': 'automatic',
  react: 'classic',
  preserve: 'deferred',
  'react-native': 'deferred',
}

export const TSCONFIG = /(^|\/)[jt]sconfig(\.[^/]+)?\.json$/

function completions(base: string): string[] {
  return base.endsWith('.json') ? [base] : [`${base}.json`, posix.join(base, 'tsconfig.json')]
}

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

export async function resolveJsx(file: string, readText: ReadText): Promise<EffectiveJsx> {
  const option = await resolveOption(file, ['compilerOptions', 'jsx'], readText, new Set())
  if (option.kind !== 'set') return option
  return { kind: 'set', transform: TRANSFORMS[option.value] ?? 'deferred', value: option.value, declaredIn: option.declaredIn }
}

export async function resolveJsxImportSource(file: string, readText: ReadText): Promise<EffectiveOption> {
  return resolveOption(file, ['compilerOptions', 'jsxImportSource'], readText, new Set())
}

export async function resolveJsxFactory(file: string, readText: ReadText): Promise<EffectiveOption> {
  return resolveOption(file, ['compilerOptions', 'jsxFactory'], readText, new Set())
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

  const roots = [...bases].filter((base) => ![...bases].some((other) => other !== base && isUnder(base, other)))
  return roots.sort(compareStrings).map((base) => (base === '' ? '**' : `${base}/**`))
}

const WILDCARD = /[*?[\]{}]/

function isUnder(path: string, ancestor: string): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}/`)
}
