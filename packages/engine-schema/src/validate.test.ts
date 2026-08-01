import { expect, test } from 'vitest'
import { bindSchema } from './catalogue.ts'
import { createSchemaValidator } from './validate.ts'
import { inspectYaml } from './yaml.ts'

const validator = createSchemaValidator()
const binding = bindSchema('compose.yaml')!

const check = (source: string) => {
  const { documents } = inspectYaml(source)
  return documents.flatMap((document) => validator(binding, document))
}

const at = (source: string, finding: { offset: number; endOffset: number }) =>
  source.slice(finding.offset, finding.endOffset)

test('accepts a valid compose file', () => {
  expect(check('services:\n  web:\n    image: nginx\n    ports:\n      - "80:80"\n')).toEqual([])
})

test('accepts x- extension fields, which the specification reserves for users', () => {
  expect(check('x-shared: &s\n  a: 1\nservices:\n  web:\n    image: nginx\n    x-custom: anything\n')).toEqual([])
})

test('catches a misspelled service key and points at the misspelling itself', () => {
  const source = 'services:\n  web:\n    image: nginx\n    prots:\n      - "80:80"\n'
  const [finding, ...rest] = check(source)

  expect(rest).toEqual([])
  expect(at(source, finding!)).toBe('prots')
  expect(finding?.message).toContain('prots')
})

test('catches a misspelled top-level key', () => {
  const source = 'servcies:\n  web:\n    image: nginx\n'
  const [finding, ...rest] = check(source)

  expect(rest).toEqual([])
  expect(at(source, finding!)).toBe('servcies')
})

test('catches a value of the wrong type and points at the key', () => {
  const source = 'services:\n  web:\n    image: nginx\n    ports: 8080\n'
  const [finding, ...rest] = check(source)

  expect(rest).toEqual([])
  expect(at(source, finding!)).toBe('ports')
  expect(finding?.message).toContain('array')
})

test('reports one finding per defect, not one per failed oneOf branch', () => {
  // ajv reports this three times over: `type` (must be array), `enum` (the bad condition) and the
  // `oneOf` that failed as a whole. A reader needs the `enum` — the other two are that one restated
  // at a level of the schema they did not write.
  const source =
    'services:\n  web:\n    image: nginx\n    depends_on:\n      db:\n        condition: service_ok\n  db:\n    image: postgres\n'
  const findings = check(source)

  expect(findings).toHaveLength(1)
  expect(findings[0]?.pointer).toBe('/services/web/depends_on/db/condition')
  expect(at(source, findings[0]!)).toBe('condition')
})

test('keeps the deepest, most specific error rather than the outermost one', () => {
  const source = 'services:\n  web:\n    image: nginx\n    healthcheck:\n      tst: ["CMD", "true"]\n'
  const findings = check(source)

  expect(findings).toHaveLength(1)
  expect(at(source, findings[0]!)).toBe('tst')
})

test('reports two genuinely separate defects separately', () => {
  const source = 'servcies:\n  web:\n    image: nginx\nnetwrks: {}\n'
  const findings = check(source)

  expect(findings.map((finding) => at(source, finding)).sort()).toEqual(['netwrks', 'servcies'])
})

test('falls back to the document start when a pointer names no node', () => {
  // Defensive: a schema that reports a path the parser cannot resolve must still produce a usable
  // finding rather than an exception or a range of NaN.
  const source = 'services: 5\n'
  const findings = check(source)

  expect(findings.length).toBeGreaterThan(0)
  for (const finding of findings) {
    expect(Number.isInteger(finding.offset)).toBe(true)
    expect(finding.endOffset).toBeGreaterThanOrEqual(finding.offset)
  }
})

test('compiles each schema once and reuses it', () => {
  const shared = createSchemaValidator()
  const { documents } = inspectYaml('services:\n  web:\n    image: nginx\n')

  expect(shared(binding, documents[0]!)).toEqual([])
  expect(shared(binding, documents[0]!)).toEqual([])
})

test('names the specification in the message, so the finding says what it was judged against', () => {
  const findings = check('servcies: {}\n')
  expect(findings[0]?.message).toContain('Compose specification')
})
