import { describe, expect, it } from 'vitest'
import { findDependencyRange } from './manifest.ts'

const slice = (source: string, range: { start: number; end: number } | undefined) =>
  range === undefined ? undefined : new TextDecoder().decode(new TextEncoder().encode(source).subarray(range.start, range.end))

describe('findDependencyRange', () => {
  it('points at the quoted key inside a dependency group', () => {
    const source = `{
  "name": "app",
  "dependencies": {
    "lodash": "^4.17.21"
  }
}`

    expect(slice(source, findDependencyRange(source, 'lodash'))).toBe('"lodash"')
  })

  it('does not match a key of the same name outside a dependency group', () => {
    const source = `{
  "name": "lodash",
  "devDependencies": {
    "lodash": "^4.17.21"
  }
}`

    const range = findDependencyRange(source, 'lodash')
    expect(range).toBeDefined()
    expect(source.slice(0, range?.start)).toContain('"devDependencies"')
  })

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])('searches %s', (group) => {
    const source = `{ "${group}": { "vitest": "^3.0.0" } }`
    expect(slice(source, findDependencyRange(source, 'vitest'))).toBe('"vitest"')
  })

  it('keeps scoped names whole', () => {
    const source = `{ "dependencies": { "@nestjs/core": "^9.0.0" } }`
    expect(slice(source, findDependencyRange(source, '@nestjs/core'))).toBe('"@nestjs/core"')
  })

  it('is not confused by braces inside string values', () => {
    const source = `{
  "scripts": { "start": "node -e '{}'" },
  "dependencies": { "lodash": "^4.17.21" }
}`

    expect(slice(source, findDependencyRange(source, 'lodash'))).toBe('"lodash"')
  })

  it('is not confused by an escaped quote in a value', () => {
    const source = `{
  "description": "a \\" quote",
  "dependencies": { "lodash": "^4.17.21" }
}`

    expect(slice(source, findDependencyRange(source, 'lodash'))).toBe('"lodash"')
  })

  it('returns byte offsets, not string indexes', () => {
    const source = `{
  "description": "ünïcøde — a long enough string to matter 🎈",
  "dependencies": { "lodash": "^4.17.21" }
}`

    const range = findDependencyRange(source, 'lodash')
    expect(slice(source, range)).toBe('"lodash"')
    expect(range?.start).toBeGreaterThan(source.indexOf('"lodash"'))
  })

  it('finds a name that also appears as a value elsewhere', () => {
    const source = `{
  "bin": { "cli": "lodash" },
  "dependencies": { "lodash": "^4.17.21" }
}`

    expect(slice(source, findDependencyRange(source, 'lodash'))).toBe('"lodash"')
  })

  it('ignores a nested dependencies block and anchors in the top-level group', () => {
    const source = `{
  "pnpm": {
    "packageExtensions": {
      "some-plugin": { "dependencies": { "lodash": "^3.0.0" } }
    }
  },
  "dependencies": { "lodash": "^4.17.21" }
}`

    const range = findDependencyRange(source, 'lodash')
    expect(slice(source, range)).toBe('"lodash"')
    expect(range?.start).toBeGreaterThan(source.indexOf('"dependencies": { "lodash": "^4.17.21" }'))
  })

  it('still finds a package the nested dependencies block does not mention', () => {
    const source = `{
  "pnpm": {
    "packageExtensions": {
      "some-plugin": { "dependencies": { "react": "^18.0.0" } }
    }
  },
  "dependencies": { "lodash": "^4.17.21" }
}`

    expect(slice(source, findDependencyRange(source, 'lodash'))).toBe('"lodash"')
  })

  it('reports nothing rather than guessing when the name is absent', () => {
    expect(findDependencyRange(`{ "dependencies": { "lodash": "^4.0.0" } }`, 'express')).toBeUndefined()
  })

  it('reports nothing for a manifest with no dependency groups', () => {
    expect(findDependencyRange(`{ "name": "app" }`, 'lodash')).toBeUndefined()
  })

  it('reports nothing for an unterminated group rather than running to the end', () => {
    expect(findDependencyRange(`{ "dependencies": { "lodash": "^4.0.0"`, 'lodash')).toBeUndefined()
  })
})
