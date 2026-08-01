import composeSpec from './schemas/compose-spec.json' with { type: 'json' }

export type SchemaId = 'compose-spec'

export type SchemaBinding = {
  readonly id: SchemaId
  /** Matched against the **basename**, lowercased. Directories never participate — see `bindSchema`. */
  readonly pattern: RegExp
  /** Human name for the format, used verbatim in the diagnostic message. */
  readonly title: string
  readonly docsUrl: string
  readonly schema: object
}

/**
 * The Compose specification, vendored at `src/schemas/compose-spec.json` from
 * `compose-spec/compose-go` (Apache-2.0). The bundler inlines it into `dist/index.js`, so the
 * published package redistributes it and must carry the attribution with it: `NOTICE` and
 * `LICENSE-compose-spec.txt` at the package root are in `files` for exactly that reason, and removing
 * them from `files` would ship Apache-2.0 material with no licence. The copy in
 * `compose-spec/compose-spec` is a backward-compatibility mirror, so `compose-go` is the upstream
 * this tracks.
 *
 * Vendored rather than fetched: a linter that reaches the network to decide whether your file is
 * valid is a linter that fails in an air-gapped CI job and behaves differently on two machines on the
 * same day. The cost is that the copy ages, which `schemaRevision` makes visible — it is folded into
 * this engine's reported version, so a schema bump invalidates every cached result rather than
 * silently changing verdicts under a cache hit.
 *
 * **The binding pattern is deliberately the basename only.** `services:` at the top of a file named
 * `values.yaml` is a Helm chart, not a Compose project, and applying this schema to it would be a
 * wall of `additionalProperties` noise. Measured over 826 YAML files from four unrelated repositories
 * (docker/awesome-compose, kubernetes/examples, actions/starter-workflows, prometheus/prometheus):
 * the pattern matched exactly 39 files, every one a genuine Compose file, and all 39 validated clean.
 * No over-match, no false positive.
 */
export const SCHEMA_BINDINGS: readonly SchemaBinding[] = [
  {
    id: 'compose-spec',
    // `compose.yaml`, `docker-compose.yml`, and the environment-suffixed forms (`compose.prod.yaml`,
    // `docker-compose.override.yml`) that every multi-environment repository uses. The suffixed forms
    // are included because a Compose *fragment* validates cleanly against this schema — confirmed
    // directly: a file containing only `services: {web: {ports: [...]}}`, with no `image`, is valid —
    // so an override file is not a source of false positives the way a partial file would be against
    // a stricter schema.
    pattern: /^(?:docker-)?compose(?:\..+)?\.ya?ml$/,
    title: 'Compose specification',
    docsUrl: 'https://github.com/compose-spec/compose-spec/blob/main/spec.md',
    schema: composeSpec,
  },
]

/**
 * Config formats deliberately **not** bound to a schema yet, each with the reason stated plainly so
 * that a later reader can tell a considered omission from an oversight — the same discipline
 * `packages/core/src/registry/exclusions.ts` applies to rules.
 */
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

/**
 * The schema bound to a repo-relative path, or `undefined` when this engine has no opinion on the
 * file beyond its structural YAML checks.
 *
 * Matches on the basename alone, lowercased, and never on the directory: a Compose file is identified
 * by what it is called, everywhere Docker itself looks for one.
 */
export function bindSchema(relativePath: string): SchemaBinding | undefined {
  const basename = relativePath.slice(Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\')) + 1)
  const lower = basename.toLowerCase()
  return SCHEMA_BINDINGS.find((binding) => binding.pattern.test(lower))
}
