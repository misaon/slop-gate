import { expect, test } from 'vitest'
import { inspectYaml } from './yaml.ts'

const rules = (source: string): string[] => inspectYaml(source).findings.map((finding) => finding.rule)

test('reports a duplicate mapping key, which silently discards the earlier value', () => {
  const { findings } = inspectYaml('scrape_configs:\n  - a\n\nscrape_configs:\n  - b\n')

  expect(findings).toHaveLength(1)
  expect(findings[0]?.rule).toBe('duplicate-mapping-key')
  expect(findings[0]?.message).toContain('scrape_configs')
})

test('points the duplicate at the second occurrence, not the first', () => {
  const source = 'a: 1\nb: 2\na: 3\n'
  const { findings } = inspectYaml(source)

  expect(source.slice(findings[0]!.offset, findings[0]!.offset + 1)).toBe('a')
  expect(findings[0]!.offset).toBe(source.lastIndexOf('a: 3'))
})

test('finds a duplicate nested inside a mapping, not only at the root', () => {
  expect(rules('services:\n  web:\n    image: nginx\n    image: alpine\n')).toEqual(['duplicate-mapping-key'])
})

test('accepts a multi-document file, which is legal YAML and very common', () => {
  expect(rules('apiVersion: v1\nkind: Service\n---\napiVersion: v1\nkind: Pod\n')).toEqual([])
})

test('reports each document of a multi-document file on its own', () => {
  expect(rules('a: 1\na: 2\n---\nb: 1\nb: 2\n')).toEqual(['duplicate-mapping-key', 'duplicate-mapping-key'])
})

test('reports tabs used as indentation, which YAML forbids outright', () => {
  expect(rules('a:\n\tb: 1\n')).toEqual(['parse-error'])
})

test('reports a document that cannot be parsed at all', () => {
  expect(rules('a: [1, 2\n')).toEqual(['parse-error'])
})

test('reports an alias whose anchor is never defined', () => {
  const { findings } = inspectYaml('a: *missing\n')

  expect(findings.map((finding) => finding.rule)).toEqual(['parse-error'])
  expect(findings[0]?.message).toContain('missing')
})

test('reports an alias that refers to an anchor defined later in the document', () => {
  expect(rules('use: *b\nbase: &b 1\n')).toEqual(['parse-error'])
})

test('accepts anchors, aliases and merge keys that resolve', () => {
  expect(rules('base: &b\n  x: 1\nuse: *b\n')).toEqual([])
  expect(rules('base: &b\n  x: 1\nuse:\n  <<: *b\n  y: 2\n')).toEqual([])
})

test('accepts an empty file, a comment-only file and an explicit document end', () => {
  expect(rules('')).toEqual([])
  expect(rules('# nothing to see\n')).toEqual([])
  expect(rules('a: 1\n...\n')).toEqual([])
  expect(rules('%YAML 1.2\n---\na: 1\n')).toEqual([])
})

test('exposes the resolved value of each document for schema validation', () => {
  const { documents } = inspectYaml('a: 1\n---\nb: 2\n')

  expect(documents.map((document) => document.value)).toEqual([{ a: 1 }, { b: 2 }])
})

test('exposes no value for a document that resolves to nothing, so nothing is validated', () => {
  expect(inspectYaml('# just a comment\n').documents).toEqual([])
  expect(inspectYaml('').documents).toEqual([])
})

test('still exposes a document that parsed despite a sibling document failing', () => {
  const { documents, findings } = inspectYaml('a: 1\n---\nb: [1, 2\n')

  expect(findings.map((finding) => finding.rule)).toEqual(['parse-error'])
  expect(documents[0]?.value).toEqual({ a: 1 })
})

test('reports at most one parse-error finding per document', () => {
  expect(rules('a: |\n  line\n\twith tab\n')).toEqual(['parse-error'])
})

test('emits no Node process warning, whatever the document contains', () => {
  const emitted: unknown[] = []
  const original = process.emitWarning
  process.emitWarning = (warning: unknown) => void emitted.push(warning)
  try {
    inspectYaml('a:\n  ? {replicas: 1}\n  : v\n')
  } finally {
    process.emitWarning = original
  }

  expect(emitted).toEqual([])
})

test('never throws on input that makes the parser itself give up', () => {
  for (const source of ['\u0000\u0001', '*', '&', '- - - - -', '{'.repeat(200)]) {
    expect(() => inspectYaml(source), JSON.stringify(source.slice(0, 12))).not.toThrow()
  }
})

test('drops the parser\'s trailing colon, which introduced a code frame we do not use', () => {
  const { findings } = inspectYaml('a:\n\tb: 1\n')

  expect(findings[0]?.message).not.toContain(':.')
  expect(findings[0]?.message.endsWith('.')).toBe(true)
})
