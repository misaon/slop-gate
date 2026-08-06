import { bench, describe } from 'vitest'
import { createLineIndex, hashContent } from '@misaon/slop-gate-core'
import { displayWidth, padEndDisplay, truncateEnd } from '@misaon/slop-gate-reporters'

/**
 * The functions a run calls per diagnostic or per line, which is where a small constant becomes the
 * whole profile. `displayWidth` is the hottest self-time frame in a large run
 * (docs/measurements.md#displaywidth-is-the-hottest-self-time-frame-in-a-large-run), and the rest are on
 * the same footing: the cache key of every file, and the line index rebuilt for every source read.
 *
 * Inputs are fixed strings rather than generated ones. A benchmark whose input changes between runs
 * measures the input.
 */

const ASCII_MESSAGE = 'Unexpected console statement in a module that ships to a user, at column 42'
const WIDE_MESSAGE = '意図しないコンソール出力です — 全角文字と絵文字 🚨 を含む行、42 桁目'
const MIXED_MESSAGE = `${ASCII_MESSAGE} · ${WIDE_MESSAGE}`

const SMALL_SOURCE = Array.from({ length: 40 }, (_, line) => `export const value${line} = ${line}`).join('\n')
const LARGE_SOURCE = Array.from({ length: 4000 }, (_, line) => `export const value${line} = ${line}`).join('\n')

describe('displayWidth', () => {
  bench('ascii', () => void displayWidth(ASCII_MESSAGE))
  bench('wide and emoji', () => void displayWidth(WIDE_MESSAGE))
  bench('mixed', () => void displayWidth(MIXED_MESSAGE))
})

describe('column alignment', () => {
  bench('padEndDisplay to 100', () => void padEndDisplay(ASCII_MESSAGE, 100))
  bench('truncateEnd to 40', () => void truncateEnd(MIXED_MESSAGE, 40))
})

describe('createLineIndex', () => {
  bench('40 lines', () => void createLineIndex(SMALL_SOURCE))
  bench('4000 lines', () => void createLineIndex(LARGE_SOURCE))
})

describe('hashContent', () => {
  bench('40 lines', () => void hashContent(SMALL_SOURCE))
  bench('4000 lines', () => void hashContent(LARGE_SOURCE))
})
