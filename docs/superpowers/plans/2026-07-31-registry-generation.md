# M1a — Registry generation

**Goal:** turn registry breadth from expensive hand-authoring into data, without turning the tool into a noise machine.

**Why this first:** 48 hand-written entries produced one finding on a real 120-file NestJS project. oxlint ships 847 rules. Hand-authoring the rest is not viable; generating them is a focused piece of work that unlocks every later milestone. Spec §5.2 already specifies a generated registry — this builds it.

---

## Grounding

Measured from `oxlint --rules --format json` against oxlint 1.76.0 on 2026-07-31. Each entry looks like:

```json
{ "scope": "eslint", "value": "accessor-pairs", "category": "pedantic",
  "type_aware": false, "fix": "none", "default": false,
  "docs_url": "https://oxc.rs/docs/guide/usage/linter/rules/eslint/accessor-pairs.html" }
```

| | |
|---|---|
| Total rules | 847 |
| Categories | correctness 260, style 279, pedantic 125, restriction 98, suspicious 59, perf 14, nursery 12 |
| Scopes | eslint, typescript, unicorn, react, vue, jest, vitest, import, promise, node, jsdoc, jsx_a11y, nextjs, react_perf, oxc |
| `correctness` + `suspicious` | 319 |
| Default-on | 114 |
| **Type-aware** | **59** |
| `fix` values | 13, encoding fixable/conditional × safe/dangerous × fix/suggestion |

Every `RuleEntry` field maps mechanically except `concepts` and `languages`.

---

## The five decisions

### 1. Generate every rule; keep the preset curated

All 847 get entries. **Registry breadth is availability; preset breadth is judgement.** A user can enable any rule by concept; `recommended` stays a deliberate, small set. Conflating the two is how a gate ends up opening with 204 `new-cap` warnings and teaching its user to ignore it.

### 2. Concepts are mechanical by default, hand-authored where it matters

Default: `concept = <category>.<kebab-cased value>`, e.g. `correctness.no-debugger`.

That is only adequate because most rules have no counterpart in another engine. **The whole point of a concept is that two engines detecting the same thing share one** — and no mechanical derivation can know that eslint's `no-unused-vars`, knip's unused-export and a future tsc diagnostic overlap. So the generator merges a hand-authored **override table** mapping specific rules onto shared or better-named concepts.

That table is where the human value lives and it stays small. Adding an engine means extending it, not regenerating semantics. Be honest about this in the code: mechanical naming makes the taxonomy *oxlint-shaped* today, and every override is a correction toward engine-independence.

### 3. Exclusions are first-class data with reasons

Some rules are actively wrong for real codebases. Measured example: `typescript/no-extraneous-class` fires 11 times on a NestJS project, **every hit a `@Module({}) export class XModule {}`** where the empty class is required by the framework. 11 of 11 false positives.

Excluded rules still get entries — they remain available to anyone who wants them — but never enter `recommended`, and each carries a reason string. An exclusion without a stated reason is indistinguishable from an oversight and will be "fixed" by someone later.

### 4. Type-aware rules must not reach `recommended`

59 rules are `type_aware`. oxlint reports `number_of_rules: 0` for them unless `--type-aware` is passed, which the adapter does not pass and which additionally needs `oxlint-tsgolint`. Electing one makes `parse.ts`'s rule-count assertion throw **on every run**, with a message blaming the config.

The generator must mark them and the preset must exclude them until M2 lands the flag, the dependency and the capability probe together. This is the one way this task can break the tool outright.

### 5. The generated file is committed

Per spec §5.2: committed, reviewable, diffable. A rule bump becomes a reviewable diff rather than an invisible behaviour change. CI regenerates and fails if the result differs from what is checked in.

---

## Mapping

| `RuleEntry` field | Source |
|---|---|
| `engine` | `'oxlint'` |
| `engineRuleId` | `scope === 'eslint' ? value : \`${scope}/${value}\`` — verify against the `code` field in real diagnostic output, which hyphenates `jsx_a11y` and `react_perf` |
| `concepts` | override table, else `<category>.<kebab value>` |
| `tier` | `type_aware ? 1 : 0` |
| `priority` | fixed default; unused until the M3 fix arbiter |
| `severityDefault` | `correctness` → `error`, everything else → `warn` |
| `fixKind` | `none`/`pending` → `none`; contains `dangerous` → `unsafe`; contains `suggestion` → `suggested`; else → `safe` |
| `fixTouches` | not derivable — `[]` when `fixKind` is `none`, otherwise a conservative default; the existing invariant test requires non-empty when fixable |
| `requires` | `type_aware ? ['types'] : []` |
| `languages` | from scope: `react`/`jsx_a11y`/`react_perf`/`nextjs` → jsx+tsx; `vue` → vue; `typescript` → ts+tsx+vue+svelte+astro; otherwise all script languages |
| `docsUrl` | `docs_url` |

---

## Tasks

**1 — the generator.** A script producing `packages/core/src/registry/entries.generated.ts` from the live catalogue, plus `concepts.generated.ts` for the concepts it invents. Deterministic output: same input, byte-identical file. Every existing `entries.test.ts` invariant must hold over the generated set.

**2 — the override and exclusion tables.** Hand-authored, committed, small. Seed exclusions with `typescript/no-extraneous-class` and its measurement. Seed overrides with the cross-engine cases the current hand-written registry already encodes, so nothing regresses.

**3 — the curated preset.** `recommended` selects from the generated registry by policy — correctness, non-type-aware, not excluded — rather than listing rules by hand. Measure the resulting finding count on a real project before and after.

**4 — the freshness check.** CI regenerates and fails on any diff, so an oxlint bump cannot silently change behaviour.

---

## Not in this task

Registry generation for engines that do not exist yet. The `rules why`/`rules conflicts` commands, the lockfile, and generated config types — the rest of M1. Framework detection: exclusions are hand-picked here; a curated registry can work around framework hostility, a generated one cannot, and that gap needs solving before the registry grows much further.
