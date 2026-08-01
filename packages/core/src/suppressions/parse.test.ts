import { expect, test } from 'vitest'
import { parseSuppressions } from './parse.ts'

/**
 * The three directive tokens, spliced rather than written whole — the same idiom, for the same
 * reason, as `reporters/src/agent.ts`. `parseSuppressions` scans raw text with no notion of comments
 * or string literals, so a file that spells a token out verbatim *is* carrying that directive; a file
 * whose entire job is to feed directive text to the parser as input data would carry twenty of them,
 * every one reported as `config.unused-suppression` against this repository. Only the source text is
 * broken: each value below is byte-for-byte the real token, which is the point — these tests must
 * exercise the parser on exactly what a user writes, never on a lookalike. Every fixture in this file
 * is built from these, negative ones included, so the literal token appears nowhere below.
 */
const NEXT_LINE = `sgate-disable${'-next-line'}`
const LINE = `sgate-disable${'-line'}`
const FILE = `sgate-disable${'-file'}`

test('parses the canonical disable-next-line form from the spec', () => {
  const source = `// ${NEXT_LINE} slop.as-any-cast -- upstream types are wrong, see #482\nconst x = y as any\n`
  const [directive] = parseSuppressions(source)

  expect(directive).toEqual({
    kind: 'disable-next-line',
    line: 1,
    appliesToLine: 2,
    targets: ['slop.as-any-cast'],
    reason: 'upstream types are wrong, see #482',
  })
})

test('disable-line applies to the same line the comment sits on', () => {
  const source = `const x = y as any // ${LINE} slop.as-any-cast -- reason\n`
  const [directive] = parseSuppressions(source)

  expect(directive?.kind).toBe('disable-line')
  expect(directive?.appliesToLine).toBe(1)
})

test('disable-file applies to the whole file, not one line', () => {
  const [directive] = parseSuppressions(`// ${FILE} slop.as-any-cast -- reason\n`)

  expect(directive?.kind).toBe('disable-file')
  expect(directive?.appliesToLine).toBeNull()
})

test('a directive with no targets means "every concept at this location"', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} -- reason\n`)
  expect(directive?.targets).toEqual([])
})

test('splits multiple targets on commas', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} slop.as-any-cast,correctness.no-debugger -- reason\n`)
  expect(directive?.targets).toEqual(['slop.as-any-cast', 'correctness.no-debugger'])
})

test('splits multiple targets on whitespace', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} slop.as-any-cast correctness.no-debugger -- reason\n`)
  expect(directive?.targets).toEqual(['slop.as-any-cast', 'correctness.no-debugger'])
})

test('tolerates a comma and surrounding whitespace together', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} slop.as-any-cast ,  correctness.no-debugger -- reason\n`)
  expect(directive?.targets).toEqual(['slop.as-any-cast', 'correctness.no-debugger'])
})

test('accepts an engine rule id as a target, matching what config.rules accepts', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} oxlint/no-shadow -- reason\n`)
  expect(directive?.targets).toEqual(['oxlint/no-shadow'])
})

test('reason is null when there is no -- at all', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} slop.as-any-cast\n`)
  expect(directive?.reason).toBeNull()
  expect(directive?.targets).toEqual(['slop.as-any-cast'])
})

test('reason is null when -- is present but nothing follows it', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} slop.as-any-cast --\n`)
  expect(directive?.reason).toBeNull()
})

test('reason is null when -- is followed only by whitespace', () => {
  const [directive] = parseSuppressions(`// ${NEXT_LINE} slop.as-any-cast --   \n`)
  expect(directive?.reason).toBeNull()
})

test('a bare directive with a reason and no targets', () => {
  const [directive] = parseSuppressions(`// ${FILE} -- reason\n`)
  expect(directive?.targets).toEqual([])
  expect(directive?.reason).toBe('reason')
})

test('reports the 1-based line number of each directive', () => {
  const source = `line one\nline two\n// ${NEXT_LINE} -- reason\nline four\n`
  const [directive] = parseSuppressions(source)
  expect(directive?.line).toBe(3)
  expect(directive?.appliesToLine).toBe(4)
})

test('finds directives on multiple lines, each with its own line number', () => {
  const source = [
    `// ${NEXT_LINE} a.one -- first`,
    'const a = 1',
    `// ${NEXT_LINE} a.two -- second`,
    'const b = 2',
  ].join('\n')

  const directives = parseSuppressions(source)
  expect(directives.map((d) => [d.line, d.targets])).toEqual([
    [1, ['a.one']],
    [3, ['a.two']],
  ])
})

test('returns an empty array for a file with no directives', () => {
  expect(parseSuppressions('const a = 1\nconst b = 2\n')).toEqual([])
})

test('handles CRLF line endings without leaking \\r into the reason', () => {
  const source = `// ${NEXT_LINE} slop.as-any-cast -- reason\r\nconst x = 1\r\n`
  const [directive] = parseSuppressions(source)
  expect(directive?.reason).toBe('reason')
  expect(directive?.appliesToLine).toBe(2)
})

test('does not match the token embedded in a longer identifier', () => {
  expect(parseSuppressions('const sgate_disable_next_line_flag = 1\n')).toEqual([])
  expect(parseSuppressions(`x${FILE}\n`)).toEqual([])
})

test('does not match a near-miss suffix', () => {
  // `next-line` requires a word boundary right after it; `next-lines` fails that boundary check
  // and must not be misread as `disable-next-line`.
  expect(parseSuppressions(`// ${NEXT_LINE}s\n`)).toEqual([])
})

test('two directives on the same line each get their own scope, not a merged one', () => {
  const source = `// ${LINE} a.one -- first ${LINE} a.two -- second\n`
  const directives = parseSuppressions(source)

  expect(directives).toHaveLength(2)
  expect(directives[0]).toMatchObject({ targets: ['a.one'], reason: 'first' })
  expect(directives[1]).toMatchObject({ targets: ['a.two'], reason: 'second' })
})

test('text between two directives on one line leaks into the first reason — a known consequence of not parsing comment syntax', () => {
  // The first directive's "rest of line" runs up to the *second directive's own match*, not to any
  // comment boundary in between (there is no comment-boundary concept at all) — so a block
  // comment's closer and the next one's opener are just more characters of the first directive's
  // reason. Documented here for the same reason the string-literal test above is: so the behaviour
  // is a pinned, intentional trade-off, not a silent surprise.
  const source = `/* ${LINE} a.one -- first */ /* ${LINE} a.two -- second */\n`
  const [first, second] = parseSuppressions(source)
  expect(first?.reason).toBe('first */ /*')
  expect(second?.reason).toBe('second */')
})

test('matches the token inside a string literal — a documented cost, not a bug', () => {
  // Whole-line token scanning does not distinguish a real comment from a string literal containing
  // the same text. This assertion is where that cost is now evidenced: it used to be evidenced by
  // the phantom findings this file itself produced, which is a worse form of proof — noise nobody
  // can tell from a regression, in every measurement taken against this repository.
  const [directive] = parseSuppressions(`const s = "${NEXT_LINE} a.one -- reason"\n`)
  expect(directive?.targets).toEqual(['a.one'])
})
