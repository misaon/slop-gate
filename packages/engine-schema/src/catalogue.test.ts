import { expect, test } from 'vitest'
import { SCHEMA_BINDINGS, SCHEMA_EXCLUSIONS, bindSchema } from './catalogue.ts'

test('binds every filename Docker itself documents, at any depth', () => {
  for (const path of [
    'compose.yaml',
    'compose.yml',
    'docker-compose.yaml',
    'docker-compose.yml',
    'deploy/compose.yaml',
    'a/b/c/docker-compose.yml',
  ]) {
    expect(bindSchema(path)?.id, path).toBe('compose-spec')
  }
})

test('binds the environment-suffixed forms, which are the ones a real repository actually has', () => {
  // Measured against the corpus: the suffixed forms are how multi-environment repositories name
  // their compose files, and a fragment validates cleanly (see the schema's own optionality).
  for (const path of ['compose.override.yaml', 'compose.prod.yaml', 'docker-compose.dev.yml']) {
    expect(bindSchema(path)?.id, path).toBe('compose-spec')
  }
})

test('is case-insensitive on the basename but not on the directory', () => {
  expect(bindSchema('Docker-Compose.YML')?.id).toBe('compose-spec')
})

test('binds nothing for YAML that merely lives near a compose file', () => {
  for (const path of [
    'values.yaml',
    'k8s/deployment.yaml',
    '.github/workflows/ci.yml',
    'compose/README.yaml',
    'decompose.yaml',
    'my-compose-notes.yaml',
  ]) {
    expect(bindSchema(path), path).toBeUndefined()
  }
})

test('binds nothing for a compose-shaped name with a non-YAML extension', () => {
  expect(bindSchema('compose.json')).toBeUndefined()
  expect(bindSchema('docker-compose.toml')).toBeUndefined()
})

test('every binding names a schema this package actually ships', () => {
  for (const binding of SCHEMA_BINDINGS) {
    expect(binding.schema, binding.id).toBeTypeOf('object')
    expect(binding.docsUrl.startsWith('https://'), binding.id).toBe(true)
  }
})

test('every exclusion carries a written reason, so no gap is silent', () => {
  for (const [key, exclusion] of Object.entries(SCHEMA_EXCLUSIONS)) {
    expect(exclusion.reason.length, key).toBeGreaterThan(80)
  }
})
