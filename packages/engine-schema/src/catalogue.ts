import composeSpec from './schemas/compose-spec.json' with { type: 'json' }

export type SchemaId = 'compose-spec'

export type SchemaBinding = {
  readonly id: SchemaId
  readonly pattern: RegExp
  readonly title: string
  readonly docsUrl: string
  readonly schema: object
}

export const SCHEMA_BINDINGS: readonly SchemaBinding[] = [
  {
    id: 'compose-spec',
    pattern: /^(?:docker-)?compose(?:\..+)?\.ya?ml$/,
    title: 'Compose specification',
    docsUrl: 'https://github.com/compose-spec/compose-spec/blob/main/spec.md',
    schema: composeSpec,
  },
]

export const SCHEMA_EXCLUSIONS: Readonly<Record<string, { readonly reason: string }>> = {
  'github-workflow': {
    reason:
      'A workflow schema would duplicate actionlint, which is the elected owner of GitHub Actions ' +
      'correctness in the design (§13.1) and checks far more than shape — expression types, ' +
      '`needs` references, shellcheck over `run:` blocks. Binding SchemaStore\'s workflow schema here ' +
      'would produce a second, weaker opinion on the same files and force an arbitration fight over ' +
      'concepts actionlint should own outright. This engine still applies its *structural* YAML ' +
      'checks to workflows, because those are about the document, not the workflow semantics.',
  },
  'kubernetes-manifest': {
    reason:
      'There is no single Kubernetes schema: validation is per apiVersion/kind against the cluster\'s ' +
      'own OpenAPI, and the published per-version schema bundles are hundreds of megabytes — far past ' +
      'what may be vendored into an npm package. Measured on kubernetes/examples (250 YAML files), the ' +
      'structural checks this engine does ship already found the only real defects present, five ' +
      'duplicate keys. A cluster-aware validator is a different tool from a linter.',
  },
  'tsconfig-and-package-json': {
    reason:
      'Both are named in the design\'s §13.1 row for this engine and both are genuinely worth ' +
      'validating, but both are JSON, and this engine currently reports positions only for YAML — the ' +
      '`yaml` package supplies the node ranges every finding needs. Shipping JSON support means ' +
      'adding a position-preserving JSON parser, which is real work rather than another catalogue ' +
      'entry. Recorded here so the gap is visible rather than looking like the schema simply passed.',
  },
}

export function bindSchema(relativePath: string): SchemaBinding | undefined {
  const basename = relativePath.slice(Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\')) + 1)
  const lower = basename.toLowerCase()
  return SCHEMA_BINDINGS.find((binding) => binding.pattern.test(lower))
}
