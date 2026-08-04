import { expect, test } from 'vitest'
import { readScanSummary } from './summary.ts'

const REAL = [
  'sg: summary|project: isProject=false',
  'sg: summary|file: scannedFileCount=163,skippedFileCount=0',
  'sg: summary|rule: effectiveRuleCount=14,skippedRuleCount=0',
  '',
].join('\n')

test('reads the four counters out of real --inspect summary output', () => {
  expect(readScanSummary(REAL)).toEqual({
    scannedFileCount: 163,
    skippedFileCount: 0,
    effectiveRuleCount: 14,
    skippedRuleCount: 0,
  })
})

test('reports the skipped count that is the only trace of a file ast-grep declined to parse', () => {
  const stderr = REAL.replace('skippedFileCount=0', 'skippedFileCount=1')
  expect(readScanSummary(stderr)?.skippedFileCount).toBe(1)
})

test('survives an added counter, a reordering, and a changed line prefix', () => {
  const stderr = [
    'ast-grep: rule: skippedRuleCount=2,effectiveRuleCount=14,newCounter=99',
    'ast-grep: file: skippedFileCount=3,scannedFileCount=10',
  ].join('\n')
  expect(readScanSummary(stderr)).toEqual({
    scannedFileCount: 10,
    skippedFileCount: 3,
    effectiveRuleCount: 14,
    skippedRuleCount: 2,
  })
})

test('returns null when either load-bearing counter is absent', () => {
  expect(readScanSummary('sg: summary|file: scannedFileCount=1,skippedFileCount=0')).toBeNull()
  expect(readScanSummary('sg: summary|rule: effectiveRuleCount=14,skippedRuleCount=0')).toBeNull()
  expect(readScanSummary('')).toBeNull()
})

test('does not mistake a stderr line about a file for a counter', () => {
  const stderr = `ERROR: src/nope.ts: No such file or directory (os error 2)\n${REAL}`
  expect(readScanSummary(stderr)?.scannedFileCount).toBe(163)
})
