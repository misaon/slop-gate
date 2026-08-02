import { expect, test } from 'vitest'
import { FOREIGN_SUPPRESSION_RULE_ID } from './rules.ts'
import { findForeignSuppressions } from './suppressions.ts'

test('reports a biome-ignore comment as a finding on its own range', () => {
  const source = 'a { color: red }\n/* biome-ignore lint/suspicious/noDuplicateProperties: legacy */\nb { color: red; color: blue }\n'
  const [diagnostic] = findForeignSuppressions('web/a.css', source)
  expect(diagnostic).toMatchObject({ engineRuleId: FOREIGN_SUPPRESSION_RULE_ID, severity: 'warning', file: 'web/a.css' })
  expect(source.slice(diagnostic!.range.start, diagnostic!.range.end)).toBe('biome-ignore')
})

test('names the suppressed rule in the message when the comment carries one', () => {
  const [diagnostic] = findForeignSuppressions(
    'a.css',
    '/* biome-ignore lint/suspicious/noDuplicateProperties: legacy */\n',
  )
  expect(diagnostic!.message).toContain('lint/suspicious/noDuplicateProperties')
})

test('reports every occurrence, including the range and file-wide forms', () => {
  const source = [
    '/* biome-ignore-all lint/style/noHexColors: theme file */',
    'a { color: #fff }',
    '/* biome-ignore-start lint/suspicious/noEmptyBlock: generated below */',
    'b {}',
    '/* biome-ignore-end lint/suspicious/noEmptyBlock: generated above */',
  ].join('\n')
  const diagnostics = findForeignSuppressions('a.css', source)
  expect(diagnostics).toHaveLength(3)
  const starts = diagnostics.map((d) => d.range.start)
  expect(starts).toEqual(starts.toSorted((a, b) => a - b))
})

test('reports byte offsets, not UTF-16 indices', () => {
  const source = '/* ćććććććććć */\n/* biome-ignore lint/style/noHexColors: x */\n'
  const [diagnostic] = findForeignSuppressions('a.css', source)
  const bytes = new TextEncoder().encode(source)
  expect(new TextDecoder().decode(bytes.subarray(diagnostic!.range.start, diagnostic!.range.end))).toBe('biome-ignore')
})

// Assembled rather than written out, because this repository lints itself: slop-gate's own
// directive spelled in full anywhere in a source file *is* a directive, not a mention of one.
const OURS = `sgate-disable-${'next-line'}`

test('says nothing about a file with no foreign suppression', () => {
  expect(findForeignSuppressions('a.css', `a { color: red }\n/* ${OURS} style.css-hex-color -- ours */\n`)).toEqual([])
})

test('does not mistake slop-gate’s own directives for foreign ones', () => {
  expect(findForeignSuppressions('a.css', `/* ${OURS} correctness.css-duplicate-property -- deliberate */\n`)).toEqual([])
})
