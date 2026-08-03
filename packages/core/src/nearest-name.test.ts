import { expect, test } from 'vitest'
import { nearestName } from './nearest-name.ts'

const CONFIG_KEYS = ['extends', 'workspaces', 'rules', 'overrides', 'owners', 'engines', 'ignore', 'generated']

const TYPOS: readonly (readonly [typo: string, meant: string])[] = [
  ['ignoer', 'ignore'],
  ['ignor', 'ignore'],
  ['rule', 'rules'],
  ['owner', 'owners'],
  ['engine', 'engines'],
  ['exntends', 'extends'],
  ['Rules', 'rules'],
  ['overides', 'overrides'],
]

test.for(TYPOS)('%s is a typo of %s', ([typo, expected]) => {
  expect(nearestName(typo, CONFIG_KEYS)).toBe(expected)
})

test.for(['plugins', 'reporters', 'severity', 'x', ''])('%s resembles no known key', (unrelated) => {
  expect(nearestName(unrelated, CONFIG_KEYS)).toBeUndefined()
})

test('a transposition counts as one edit, so it outranks a same-distance substitution', () => {
  expect(nearestName('sr', ['rs', 'xy'])).toBe('rs')
})

test('an exact match is its own nearest name', () => {
  expect(nearestName('rules', CONFIG_KEYS)).toBe('rules')
})

test('ties resolve to the first candidate in the given order, not an arbitrary one', () => {
  expect(nearestName('ab', ['aa', 'bb'])).toBe('aa')
  expect(nearestName('ab', ['bb', 'aa'])).toBe('bb')
})

test('no candidates yields no suggestion', () => {
  expect(nearestName('rules', [])).toBeUndefined()
})
