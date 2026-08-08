import { expect, test } from 'vitest'
import { UNFORMATTED_RULE_ID, parseUnformattedFiles } from './parse.ts'

test('one diagnostic per listed file, anchored on the file rather than a position', () => {
  const found = parseUnformattedFiles('src/a.ts\nsrc/b.css')

  expect(found).toHaveLength(2)
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.engineRuleId).toBe(UNFORMATTED_RULE_ID)
  expect(found[0]?.range).toEqual({ start: 0, end: 0 })
})

test('the last path is kept even though oxfmt writes no trailing newline', () => {
  expect(parseUnformattedFiles('bad.ts').map((d) => d.file)).toEqual(['bad.ts'])
})

test('a terminated stream yields no phantom finding for the empty tail', () => {
  expect(parseUnformattedFiles('a.ts\nb.ts\n').map((d) => d.file)).toEqual(['a.ts', 'b.ts'])
})

test('nothing unformatted means no findings, not one for an empty line', () => {
  expect(parseUnformattedFiles('')).toEqual([])
  expect(parseUnformattedFiles('\n  \n')).toEqual([])
})

test('windows separators are normalised, so a finding matches the inventory path', () => {
  expect(parseUnformattedFiles(String.raw`src\a.ts`).map((d) => d.file)).toEqual(['src/a.ts'])
})
