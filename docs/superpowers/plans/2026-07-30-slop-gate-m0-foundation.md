# slop-gate M0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working `sgate check` that analyses a real monorepo end to end — shared discovery, a real concept-based rule registry with deterministic arbitration, content-addressed caching, streaming pretty output, and correct exit codes.

**Architecture:** A TypeScript orchestrator in a pnpm workspace. `core` owns config resolution, the rule registry, discovery, caching and planning, and depends on no engine. Engines implement a single `Engine` interface and are registered at runtime; M0 ships one (oxlint, via subprocess with `--format json`). Diagnostics from every engine are normalized into one canonical shape, filtered by concept ownership, fingerprinted, and streamed to reporters.

**Tech Stack:** TypeScript 5.9+ · Node 24 · pnpm 10 workspaces · Turborepo · tsdown (Rolldown+oxc) · Vitest · citty · picomatch · yaml · `oxc-transform` · `node:util.styleText` for colour · oxlint as the first engine

**Spec:** [`docs/superpowers/specs/2026-07-30-slop-gate-design.md`](../specs/2026-07-30-slop-gate-design.md). Section references below (§) point at it.

## Global Constraints

Every task's requirements implicitly include this section.

- **Node:** `engines.node` is `">=24"`. Nothing below Node 24 is tested or supported.
- **Modules:** ESM only. `"type": "module"` in every package. No CommonJS entry points, no `require`.
- **Runtime portability:** no Node-only API that Bun and Deno lack. `node:*` imports are fine; native addons are not.
- **Package manager:** pnpm 10. `packageManager` field pinned in the root `package.json`.
- **Package names:** CLI is `@misaon/slop-gate` (bins `sgate` and `slop-gate`). Libraries are `@misaon/slop-gate-<name>`.
- **Licence:** MIT, `LICENSE` at the repo root, `"license": "MIT"` in every `package.json`.
- **No LLM calls anywhere in this milestone.** `check` is offline and deterministic.
- **Exit codes:** `0` clean · `1` findings at or above threshold · `2` config or usage error · `3` engine failure · `4` frozen-ruleset drift. Never `process.exit` outside the CLI layer; core returns results and throws typed errors.
- **Paths:** repo-relative with POSIX separators in every public data structure and every output format. Absolute OS-native paths exist only inside the discovery and engine-adapter layers.
- **Positions:** byte offsets are the internal truth. Line and column are always **recomputed from byte offsets** by `core`, never taken from an engine's own line/column output — cross-engine consistency matters more than saving the work. Columns are UTF-16 code units, 1-based.
- **Code style:** no comment that restates the code beneath it; comments explain non-obvious *why* only. No duplicated logic across packages. A file that outgrows one responsibility gets split, not extended.
- **Dependencies:** every new runtime dependency needs a one-line justification in the task that adds it. Prefer a Node built-in when one exists.

---

## File Structure

```
slop-gate/
├── package.json                  workspace root: scripts, pnpm + turbo config
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json            strict compiler options shared by all packages
├── vitest.config.ts              workspace-level test config
├── LICENSE                       MIT
├── AGENTS.md                     entry point for agents; points at the spec
├── .gitignore
├── .github/workflows/ci.yml      lint, build, test on Linux/macOS/Windows × Node 24/26
└── packages/
    ├── core/                     @misaon/slop-gate-core
    │   └── src/
    │       ├── index.ts                    public surface
    │       ├── ordering.ts                 locale-free string comparator
    │       ├── diagnostics/
    │       │   ├── types.ts                Diagnostic, Edit, Severity, ByteRange
    │       │   ├── position.ts             byte offset → UTF-16 line/column
    │       │   └── fingerprint.ts          reformat-resistant fingerprints
    │       ├── concepts/
    │       │   ├── catalogue.ts            the concept taxonomy as data
    │       │   └── validate.ts             taxonomy invariants
    │       ├── registry/
    │       │   ├── types.ts                RuleEntry, EngineId, Capability
    │       │   ├── entries.ts              hand-authored M0 rule entries
    │       │   ├── elect.ts                deterministic owner election
    │       │   └── ownership.ts            diagnostic-level ownership filter
    │       ├── config/
    │       │   ├── types.ts                SlopGateConfig, RuleSetting
    │       │   ├── define.ts               defineConfig
    │       │   ├── presets.ts              recommended preset
    │       │   ├── load.ts                 native TS loading + oxc-transform fallback
    │       │   └── resolve.ts              layering, provenance, override buckets
    │       ├── discovery/
    │       │   ├── types.ts                FileInventory, InventoryFile, LanguageId
    │       │   ├── language.ts             language detection
    │       │   ├── workspaces.ts           workspace graph
    │       │   ├── sources.ts              GitFileSource, WalkFileSource
    │       │   └── inventory.ts            buildInventory
    │       ├── cache/
    │       │   ├── keys.ts                 cache-key derivation
    │       │   ├── stat-index.ts           size/mtime/hash index
    │       │   └── result-store.ts         content-addressed results, negative caching
    │       ├── engine/
    │       │   ├── types.ts                Engine interface, FileBatch, RawDiagnostic
    │       │   └── normalize.ts            RawDiagnostic → Diagnostic
    │       ├── planner/
    │       │   └── plan.ts                 cache-aware execution plan
    │       └── run/
    │           └── check.ts                orchestration, streams Diagnostic
    ├── engine-oxlint/            @misaon/slop-gate-engine-oxlint
    │   └── src/
    │       ├── index.ts                    the Engine implementation
    │       ├── config.ts                   materialize .oxlintrc.json
    │       └── parse.ts                    oxlint JSON → RawDiagnostic
    ├── reporters/                @misaon/slop-gate-reporters
    │   └── src/
    │       ├── index.ts                    reporter lookup
    │       ├── code-frame.ts               source excerpt rendering
    │       ├── pretty.ts                   default human output
    │       └── json.ts                     versioned machine output
    └── cli/                      @misaon/slop-gate
        └── src/
            ├── main.ts                     citty root command, exit-code mapping
            └── commands/
                ├── check.ts
                └── init.ts
```

---

## Task 1: Workspace scaffolding and CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `vitest.config.ts`, `LICENSE`, `AGENTS.md`, `.github/workflows/ci.yml`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsdown.config.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/index.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable, testable workspace. `pnpm build`, `pnpm test`, `pnpm typecheck` all succeed. Every later task adds packages that follow `packages/core`'s exact shape.

**Dependency justification:** `tsdown` builds libraries on Rolldown+oxc and generates declarations far faster than `tsc`. `turbo` caches per-package tasks. `vitest` is the test runner. `typescript` is needed for `tsc --noEmit`, since Node's type stripping does not type-check.

- [ ] **Step 1: Create the workspace root files**

`package.json`:

```json
{
  "name": "slop-gate-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.2",
  "engines": { "node": ">=24" },
  "license": "MIT",
  "scripts": {
    "build": "turbo run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "turbo run typecheck",
    "check": "pnpm typecheck && pnpm test"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsdown": "^0.15.0",
    "turbo": "^2.5.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "es2024",
    "lib": ["es2024"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "declaration": true,
    "noEmit": true
  }
}
```

`erasableSyntaxOnly` matters: it forbids enums and parameter properties, guaranteeing every file stays loadable by Node's type stripping. That keeps the config-loading story (Task 6) honest.

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
})
```

`.gitignore` — append to the existing file:

```
node_modules/
dist/
.turbo/
.slop-gate/
*.tsbuildinfo
```

- [ ] **Step 2: Create the LICENSE and AGENTS.md**

`LICENSE`: the standard MIT text, `Copyright (c) 2026 Ondřej Misák`.

`AGENTS.md`:

```markdown
# slop-gate

A code-quality gate for repositories written with AI assistance. Aggregates analysis engines behind
one interface, one config file and one diagnostic model.

## Read this first

The authoritative design is `docs/superpowers/specs/2026-07-30-slop-gate-design.md`. It records every
architectural decision and why it was made. Do not redesign a subsystem before reading its section.

## Commands

- `pnpm check` — typecheck and test. Run this before claiming anything works.
- `pnpm build` — build all packages.
- `pnpm test -- <pattern>` — run a subset of tests.

## Conventions

- ESM only. Node >= 24. No CommonJS.
- Byte offsets are the internal truth for positions; line and column are always recomputed by `core`.
- Public data structures use repo-relative POSIX paths.
- No comment that restates the code beneath it.
- `packages/core` must not depend on any engine package.
```

- [ ] **Step 3: Create the core package**

`packages/core/package.json`:

```json
{
  "name": "@misaon/slop-gate-core",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/core/tsdown.config.ts`:

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
})
```

`packages/core/src/index.ts`:

```ts
export const CORE_VERSION = '0.0.0'
```

- [ ] **Step 4: Write the failing test**

`packages/core/src/index.test.ts`:

```ts
import { expect, test } from 'vitest'
import { CORE_VERSION } from './index.ts'

test('core exposes its version', () => {
  expect(CORE_VERSION).toBe('0.0.0')
})
```

- [ ] **Step 5: Install and verify the toolchain end to end**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Expected: all four succeed, and `packages/core/dist/index.js` plus `index.d.ts` exist. If `pnpm test` reports "No test files found", the `include` glob in `vitest.config.ts` is wrong — fix it before continuing, because every later task depends on it.

- [ ] **Step 6: Create the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:

jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['24', '26']
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace, core package and CI

Node 24 minimum, ESM only, strict TS with erasableSyntaxOnly so every
file stays loadable by Node's type stripping. tsdown for builds,
turbo for task caching, vitest for tests."
```

---

## Task 2: Diagnostic model, position mapping and fingerprints

**Files:**
- Create: `packages/core/src/diagnostics/types.ts`, `packages/core/src/diagnostics/position.ts`, `packages/core/src/diagnostics/fingerprint.ts`
- Test: `packages/core/src/diagnostics/position.test.ts`, `packages/core/src/diagnostics/fingerprint.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Severity = 'error' | 'warn' | 'info'`
  - `type ByteRange = { start: number; end: number }`
  - `type Position = { startLine: number; startColumn: number; endLine: number; endColumn: number }`
  - `type Diagnostic` — the canonical shape every engine is normalized into (§10)
  - `createLineIndex(source: string): LineIndex` where `LineIndex = { positionAt(byteOffset: number): { line: number; column: number }; lineRangeOf(range: ByteRange): ByteRange }`
  - `fingerprint(input: { concept: string; file: string; source: string; range: ByteRange; occurrenceIndex: number }): string`

**Why this is first:** every engine adapter and every reporter depends on these types. Getting the byte/UTF-16 boundary right here means no later task has to think about it.

- [ ] **Step 1: Write the failing position tests**

`packages/core/src/diagnostics/position.test.ts`:

```ts
import { expect, test } from 'vitest'
import { createLineIndex } from './position.ts'

test('maps offset zero to line 1 column 1', () => {
  const index = createLineIndex('const a = 1\n')
  expect(index.positionAt(0)).toEqual({ line: 1, column: 1 })
})

test('maps an offset on a later line', () => {
  const index = createLineIndex('a\nbb\nccc\n')
  expect(index.positionAt(5)).toEqual({ line: 3, column: 1 })
})

test('counts columns in UTF-16 code units, not bytes', () => {
  // 'č' is 2 bytes in UTF-8 but 1 UTF-16 code unit.
  const source = 'čč x'
  const byteOffsetOfX = new TextEncoder().encode('čč ').length
  expect(byteOffsetOfX).toBe(5)
  expect(createLineIndex(source).positionAt(byteOffsetOfX)).toEqual({ line: 1, column: 4 })
})

test('counts an astral-plane character as two UTF-16 code units', () => {
  const source = '😀x'
  const byteOffsetOfX = new TextEncoder().encode('😀').length
  expect(byteOffsetOfX).toBe(4)
  expect(createLineIndex(source).positionAt(byteOffsetOfX)).toEqual({ line: 1, column: 3 })
})

test('treats CRLF as a single line break', () => {
  const index = createLineIndex('a\r\nb')
  expect(index.positionAt(3)).toEqual({ line: 2, column: 1 })
})

test('clamps an offset past the end of the source', () => {
  const index = createLineIndex('ab')
  expect(index.positionAt(999)).toEqual({ line: 1, column: 3 })
})

test('expands a range to whole lines', () => {
  const index = createLineIndex('aaa\nbbb\nccc\n')
  expect(index.lineRangeOf({ start: 5, end: 6 })).toEqual({ start: 4, end: 7 })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- position`
Expected: FAIL, cannot resolve `./position.ts`.

- [ ] **Step 3: Implement the position index**

`packages/core/src/diagnostics/position.ts`:

```ts
import type { ByteRange } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type LineIndex = {
  positionAt(byteOffset: number): { line: number; column: number }
  lineRangeOf(range: ByteRange): ByteRange
  sliceBytes(range: ByteRange): string
}

export function createLineIndex(source: string): LineIndex {
  const bytes = encoder.encode(source)
  const lineStarts = [0]
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0a) lineStarts.push(i + 1)
  }

  const lineIndexAt = (byteOffset: number): number => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (lineStarts[mid]! <= byteOffset) low = mid
      else high = mid - 1
    }
    return low
  }

  return {
    positionAt(byteOffset) {
      const clamped = Math.max(0, Math.min(byteOffset, bytes.length))
      const line = lineIndexAt(clamped)
      const prefix = decoder.decode(bytes.subarray(lineStarts[line]!, clamped))
      return { line: line + 1, column: prefix.length + 1 }
    },
    lineRangeOf(range) {
      const startLine = lineIndexAt(Math.max(0, Math.min(range.start, bytes.length)))
      const endLine = lineIndexAt(Math.max(0, Math.min(range.end, bytes.length)))
      const nextLineStart = lineStarts[endLine + 1]
      return {
        start: lineStarts[startLine]!,
        end: nextLineStart === undefined ? bytes.length : nextLineStart - 1,
      }
    },
    sliceBytes(range) {
      const start = Math.max(0, Math.min(range.start, bytes.length))
      const end = Math.max(start, Math.min(range.end, bytes.length))
      return decoder.decode(bytes.subarray(start, end))
    },
  }
}
```

The CRLF test passes because only `\n` starts a new line, so `\r` stays part of the preceding line — the same convention editors and LSP use.

- [ ] **Step 4: Create the diagnostic types**

`packages/core/src/diagnostics/types.ts`:

```ts
export type Severity = 'error' | 'warn' | 'info'

export type ByteRange = { start: number; end: number }

export type Position = {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type FixKind = 'safe' | 'suggested' | 'unsafe'

export type Edit = { range: ByteRange; replacement: string }

export type Fix = { kind: FixKind; description: string; edits: Edit[] }

export type RelatedLocation = { file: string; range: ByteRange; message: string }

export type Diagnostic = {
  concept: string
  ruleId: string
  engine: string
  severity: Severity
  message: string
  file: string
  range: ByteRange
  position: Position
  related?: RelatedLocation[]
  fix?: Fix
  help?: string
  docsUrl?: string
  fingerprint: string
}
```

`concept` is typed as `string` here and narrowed to `ConceptId` at the module boundary in Task 3. Typing it as `ConceptId` now would make `diagnostics` depend on `concepts`, and the dependency runs the other way.

- [ ] **Step 5: Write the failing fingerprint tests**

`packages/core/src/diagnostics/fingerprint.test.ts`:

```ts
import { expect, test } from 'vitest'
import { fingerprint } from './fingerprint.ts'

const base = {
  concept: 'dead-code.unused-import',
  file: 'src/a.ts',
  source: 'import { x } from "y"\nconst a = 1\n',
  range: { start: 0, end: 21 },
  occurrenceIndex: 0,
}

test('is stable across calls', () => {
  expect(fingerprint(base)).toBe(fingerprint(base))
})

test('survives reindentation of the finding', () => {
  const reindented = { ...base, source: '  import   {  x  }  from "y"\nconst a = 1\n' }
  const shifted = { ...reindented, range: { start: 0, end: 28 } }
  expect(fingerprint(shifted)).toBe(fingerprint(base))
})

test('survives unrelated lines being added above', () => {
  const withPreamble = {
    ...base,
    source: '// header\n// header\nimport { x } from "y"\nconst a = 1\n',
    range: { start: 20, end: 41 },
  }
  expect(fingerprint(withPreamble)).toBe(fingerprint(base))
})

test('differs when the concept differs', () => {
  expect(fingerprint({ ...base, concept: 'style.no-var' })).not.toBe(fingerprint(base))
})

test('differs when the file differs', () => {
  expect(fingerprint({ ...base, file: 'src/b.ts' })).not.toBe(fingerprint(base))
})

test('distinguishes identical windows by occurrence index', () => {
  expect(fingerprint({ ...base, occurrenceIndex: 1 })).not.toBe(fingerprint(base))
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test -- fingerprint`
Expected: FAIL, cannot resolve `./fingerprint.ts`.

- [ ] **Step 7: Implement fingerprinting**

`packages/core/src/diagnostics/fingerprint.ts`:

```ts
import { createHash } from 'node:crypto'
import type { ByteRange } from './types.ts'
import { createLineIndex } from './position.ts'

export type FingerprintInput = {
  concept: string
  file: string
  source: string
  range: ByteRange
  occurrenceIndex: number
}

export function fingerprint(input: FingerprintInput): string {
  const index = createLineIndex(input.source)
  const window = index.sliceBytes(index.lineRangeOf(input.range))
  const normalized = window.replace(/\s+/g, ' ').trim()

  return createHash('sha256')
    .update([input.concept, input.file, normalized, String(input.occurrenceIndex)].join('\0'))
    .digest('hex')
    .slice(0, 32)
}
```

Line numbers are deliberately absent from the hash — that is exactly what lets a baseline survive a reformat (§10.1).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test -- diagnostics`
Expected: PASS, 13 tests.

- [ ] **Step 9: Export from the package surface**

`packages/core/src/index.ts`:

```ts
export const CORE_VERSION = '0.0.0'

export type {
  ByteRange,
  Diagnostic,
  Edit,
  Fix,
  FixKind,
  Position,
  RelatedLocation,
  Severity,
} from './diagnostics/types.ts'
export { createLineIndex, type LineIndex } from './diagnostics/position.ts'
export { fingerprint, type FingerprintInput } from './diagnostics/fingerprint.ts'
```

- [ ] **Step 10: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): diagnostic model, position mapping and fingerprints

Byte offsets are the internal truth; columns are UTF-16 code units
recomputed by core so every engine reports positions identically.
Fingerprints exclude line numbers so baselines survive reformatting."
```

---

## Task 3: Concept taxonomy

**Files:**
- Create: `packages/core/src/concepts/catalogue.ts`, `packages/core/src/concepts/validate.ts`
- Test: `packages/core/src/concepts/catalogue.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const CONCEPTS: readonly ConceptDefinition[]`
  - `type ConceptId` — a string-literal union derived from `CONCEPTS`, so a typo in a config becomes a type error (§5.6)
  - `type ConceptDefinition = { id: string; group: ConceptGroup; title: string; description: string; deprecated?: { since: string; replacedBy?: string } }`
  - `isConceptId(value: string): value is ConceptId`
  - `conceptById(id: ConceptId): ConceptDefinition`

**Design note:** the taxonomy is data, not code (§5.1). M0 hand-authors only the concepts the oxlint rules of Task 4 need; M1 generates the rest from engine introspection. Adding a concept must never require touching logic.

- [ ] **Step 1: Write the failing invariant tests**

`packages/core/src/concepts/catalogue.test.ts`:

```ts
import { expect, test } from 'vitest'
import { CONCEPTS, conceptById, isConceptId } from './catalogue.ts'
import { validateCatalogue } from './validate.ts'

test('the catalogue satisfies its invariants', () => {
  expect(validateCatalogue(CONCEPTS)).toEqual([])
})

test('every id is dot-separated lower kebab case', () => {
  for (const concept of CONCEPTS) {
    expect(concept.id).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/)
  }
})

test('every id starts with its declared group', () => {
  for (const concept of CONCEPTS) {
    expect(concept.id.split('.')[0]).toBe(concept.group)
  }
})

test('recognises a known id and rejects an unknown one', () => {
  expect(isConceptId('dead-code.unused-import')).toBe(true)
  expect(isConceptId('dead-code.does-not-exist')).toBe(false)
})

test('looks a concept up by id', () => {
  expect(conceptById('dead-code.unused-import').group).toBe('dead-code')
})

test('reports duplicate ids', () => {
  const duplicated = [
    { id: 'style.a', group: 'style', title: 'A', description: 'a' },
    { id: 'style.a', group: 'style', title: 'A again', description: 'a' },
  ] as const
  expect(validateCatalogue(duplicated)).toContain('duplicate concept id: style.a')
})

test('reports a group that does not match the id prefix', () => {
  const mismatched = [{ id: 'style.a', group: 'perf', title: 'A', description: 'a' }] as const
  expect(validateCatalogue(mismatched)).toContain('concept style.a declares group perf')
})

test('reports a deprecated concept pointing at a missing replacement', () => {
  const dangling = [
    {
      id: 'style.a',
      group: 'style',
      title: 'A',
      description: 'a',
      deprecated: { since: '0.1.0', replacedBy: 'style.gone' },
    },
  ] as const
  expect(validateCatalogue(dangling)).toContain('style.a is replaced by unknown concept style.gone')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- concepts`
Expected: FAIL, cannot resolve `./catalogue.ts`.

- [ ] **Step 3: Implement the catalogue**

`packages/core/src/concepts/catalogue.ts`:

```ts
export const CONCEPT_GROUPS = [
  'correctness',
  'types',
  'dead-code',
  'formatting',
  'style',
  'complexity',
  'duplication',
  'security',
  'perf',
  'a11y',
  'framework',
  'config',
  'deps',
  'slop',
] as const

export type ConceptGroup = (typeof CONCEPT_GROUPS)[number]

export type ConceptDefinition = {
  readonly id: string
  readonly group: ConceptGroup
  readonly title: string
  readonly description: string
  readonly deprecated?: { readonly since: string; readonly replacedBy?: string }
}

export const CONCEPTS = [
  {
    id: 'correctness.no-debugger',
    group: 'correctness',
    title: 'Debugger statement',
    description: 'A `debugger` statement halts execution wherever it is reached.',
  },
  {
    id: 'correctness.no-duplicate-object-key',
    group: 'correctness',
    title: 'Duplicate object key',
    description: 'A repeated key silently discards the earlier value.',
  },
  {
    id: 'correctness.no-constant-condition',
    group: 'correctness',
    title: 'Constant condition',
    description: 'A condition that cannot vary makes one branch unreachable.',
  },
  {
    id: 'dead-code.unused-import',
    group: 'dead-code',
    title: 'Unused import',
    description: 'An imported binding that is never referenced.',
  },
  {
    id: 'dead-code.unused-variable',
    group: 'dead-code',
    title: 'Unused variable',
    description: 'A declared binding that is never read.',
  },
  {
    id: 'style.no-var',
    group: 'style',
    title: 'Use of var',
    description: '`var` is function-scoped and hoisted; prefer `const` or `let`.',
  },
  {
    id: 'slop.as-any-cast',
    group: 'slop',
    title: 'Explicit any',
    description:
      'An explicit `any` — whether an annotation or an `as any` cast — opts out of the type system. ' +
      'M0 detects it syntactically; the narrower `as unknown as T` pattern needs type information and arrives with the type-aware engine in M2.',
  },
  {
    id: 'config.unused-suppression',
    group: 'config',
    title: 'Unused suppression',
    description: 'A suppression comment that matches no diagnostic, left behind after a fix.',
  },
  {
    id: 'config.rule-overlap',
    group: 'config',
    title: 'Overlapping rules',
    description: 'Two enabled rules detect the same concept; one was suppressed by arbitration.',
  },
  {
    id: 'config.dead-override',
    group: 'config',
    title: 'Dead override',
    description: 'An override targeting a rule or concept that no enabled engine covers.',
  },
] as const satisfies readonly ConceptDefinition[]

export type ConceptId = (typeof CONCEPTS)[number]['id']

const byId = new Map<string, ConceptDefinition>(CONCEPTS.map((c) => [c.id, c]))

export function isConceptId(value: string): value is ConceptId {
  return byId.has(value)
}

export function conceptById(id: ConceptId): ConceptDefinition {
  const found = byId.get(id)
  if (!found) throw new Error(`unknown concept: ${id}`)
  return found
}
```

`as const satisfies readonly ConceptDefinition[]` is the load-bearing detail: `as const` preserves the literal ids so `ConceptId` is a real union, while `satisfies` still type-checks each entry against the shape.

- [ ] **Step 4: Implement the validator**

`packages/core/src/concepts/validate.ts`:

```ts
import { CONCEPT_GROUPS, type ConceptDefinition, type ConceptGroup } from './catalogue.ts'

const ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

export function validateCatalogue(concepts: readonly ConceptDefinition[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const known = new Set(concepts.map((c) => c.id))

  for (const concept of concepts) {
    if (seen.has(concept.id)) problems.push(`duplicate concept id: ${concept.id}`)
    seen.add(concept.id)

    if (!ID_PATTERN.test(concept.id)) problems.push(`malformed concept id: ${concept.id}`)

    if (!CONCEPT_GROUPS.includes(concept.group as ConceptGroup)) {
      problems.push(`concept ${concept.id} declares unknown group ${concept.group}`)
    } else if (concept.id.split('.')[0] !== concept.group) {
      problems.push(`concept ${concept.id} declares group ${concept.group}`)
    }

    if (!concept.title.trim()) problems.push(`concept ${concept.id} has no title`)
    if (!concept.description.trim()) problems.push(`concept ${concept.id} has no description`)

    const replacement = concept.deprecated?.replacedBy
    if (replacement !== undefined && !known.has(replacement)) {
      problems.push(`${concept.id} is replaced by unknown concept ${replacement}`)
    }
  }

  return problems
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- concepts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export {
  CONCEPTS,
  CONCEPT_GROUPS,
  conceptById,
  isConceptId,
  type ConceptDefinition,
  type ConceptGroup,
  type ConceptId,
} from './concepts/catalogue.ts'
export { validateCatalogue } from './concepts/validate.ts'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): concept taxonomy as validated data

Concepts are the engine-independent vocabulary users configure and the
key arbitration works over. ConceptId is derived from the catalogue, so
a typo in a config is a type error rather than a silent no-op."
```

---

## Task 4: Rule registry and deterministic arbitration

This is the mechanism the whole product rests on (§5). Read spec §5.1–§5.3 before starting.

**Files:**
- Create: `packages/core/src/languages.ts`, `packages/core/src/ordering.ts`
- Create: `packages/core/src/registry/types.ts`, `packages/core/src/registry/entries.ts`, `packages/core/src/registry/elect.ts`, `packages/core/src/registry/ownership.ts`
- Test: `packages/core/src/registry/elect.test.ts`, `packages/core/src/registry/entries.test.ts`, `packages/core/src/registry/ownership.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ConceptId`, `isConceptId` (Task 3); `Severity`, `FixKind` (Task 2).
- Produces:
  - `type LanguageId` and `const LANGUAGES` from `languages.ts`
  - `type EngineId`, `type Capability`, `type RuleEntry`, `type RuleRef = { engine: EngineId; engineRuleId: string }`, `const ENGINE_PREFERENCE: readonly EngineId[]`
  - `const RULE_ENTRIES: readonly RuleEntry[]`
  - `electOwners(input: ElectionInput): ElectionResult` where
    `ElectionResult = { owners: Map<string, RuleRef>; selection: Map<EngineId, Set<string>>; suppressed: SuppressionRecord[]; uncovered: string[] }`
  - `isOwned(owners, candidate): boolean` and `filterOwned(owners, diagnostics)`

**Design note:** arbitration is enforced twice — once when deciding which rules to configure on which engine, and again when a diagnostic arrives, because one engine rule may cover several concepts and could otherwise report on a concept it does not own. The second check is what makes double-reporting structurally impossible rather than merely unlikely (§5.3).

- [ ] **Step 1: Create the language catalogue**

`packages/core/src/languages.ts`. Registry entries and discovery both need this, so it lives above both to keep the dependency graph acyclic.

```ts
export const LANGUAGES = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'vue',
  'svelte',
  'astro',
  'css',
  'scss',
  'less',
  'html',
  'json',
  'jsonc',
  'yaml',
  'toml',
  'markdown',
  'dockerfile',
  'github-workflow',
  'unknown',
] as const

export type LanguageId = (typeof LANGUAGES)[number]

export const SCRIPT_LANGUAGES: readonly LanguageId[] = ['ts', 'tsx', 'js', 'jsx']
```

And `packages/core/src/paths.ts`. Three modules need this one-liner (`language.ts`, `workspaces.ts`,
`sources.ts`); three private copies would violate the no-duplicated-logic constraint.

```ts
/** Public data structures carry POSIX separators regardless of the host platform. */
export function toPosix(value: string): string {
  return value.replaceAll('\\', '/')
}
```

Also create `packages/core/src/ordering.ts`. Several outputs in this project are hashed or compared
byte-for-byte across machines, CI runners and three runtimes — the elected ruleset (M1's lockfile),
the engine ruleset hash that forms part of a cache key, the file inventory order, and the diagnostic
order golden reports assert on. `String.prototype.localeCompare` is unfit for all of them: it is not
total (`'abc'.localeCompare('a​bc')` is `0` for two distinct strings, leaving the winner
dependent on input order) and not locale-invariant (plain-ASCII identifiers collate differently under
`da-DK`, and a `small-icu` build collapses to root collation). Every ordering that feeds a hash or a
golden file goes through this comparator instead.

```ts
/** Code-unit ordering: total, locale-free, identical on every runtime. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
```

- [ ] **Step 2: Create the registry types**

`packages/core/src/registry/types.ts`:

```ts
import type { ConceptId } from '../concepts/catalogue.ts'
import type { FixKind, Severity } from '../diagnostics/types.ts'
import type { LanguageId } from '../languages.ts'

export type EngineId =
  | 'oxfmt'
  | 'oxlint'
  | 'tsgolint'
  | 'tsc'
  | 'biome-css'
  | 'astgrep'
  | 'schema'
  | 'actionlint'
  | 'zizmor'
  | 'hadolint'
  | 'knip'
  | 'eslint'

/**
 * Ordered fastest-capable-first. Arbitration consults this only after tier, so a
 * slower engine still wins a concept no faster engine can detect (§5.3).
 */
export const ENGINE_PREFERENCE: readonly EngineId[] = [
  'oxfmt',
  'oxlint',
  'tsgolint',
  'tsc',
  'biome-css',
  'astgrep',
  'schema',
  'actionlint',
  'zizmor',
  'hadolint',
  'knip',
  'eslint',
]

export type Capability = 'types' | 'project-graph' | 'workspace-graph'

export type FixDomain = 'imports' | 'statements' | 'expressions' | 'jsx' | 'formatting'

/** 0 = native, 1 = native with type information, 2 = JavaScript or WebAssembly. */
export type EngineTier = 0 | 1 | 2

/**
 * Attributes one finding of a multi-concept rule to a single concept.
 * `concepts` says what a rule may *claim* during arbitration; this says what an individual
 * finding *is*. Without it, a rule covering two concepts would emit two diagnostics for one
 * finding — the double reporting arbitration exists to prevent.
 */
export type ClassifyRule = {
  readonly messagePattern: string
  readonly concept: ConceptId
}

export type RuleEntry = {
  readonly engine: EngineId
  readonly engineRuleId: string
  readonly concepts: readonly ConceptId[]
  readonly classify?: readonly ClassifyRule[]
  readonly tier: EngineTier
  readonly priority: number
  readonly severityDefault: Severity
  readonly fixKind: FixKind | 'none'
  readonly fixTouches: readonly FixDomain[]
  readonly requires: readonly Capability[]
  readonly languages: readonly LanguageId[]
  readonly docsUrl: string
  readonly since: string
  readonly deprecated?: { readonly since: string; readonly replacedBy?: string }
}

export type RuleRef = { readonly engine: EngineId; readonly engineRuleId: string }

export function ruleRefKey(ref: RuleRef): string {
  return `${ref.engine}/${ref.engineRuleId}`
}
```

- [ ] **Step 3: Write the failing election tests**

`packages/core/src/registry/elect.test.ts`. The fixtures are local so these tests describe arbitration itself, independent of which rules M0 happens to ship.

```ts
import { expect, test } from 'vitest'
import { electOwners } from './elect.ts'
import type { RuleEntry } from './types.ts'

const entry = (over: Partial<RuleEntry> & Pick<RuleEntry, 'engine' | 'engineRuleId' | 'concepts'>): RuleEntry => ({
  tier: 0,
  priority: 100,
  severityDefault: 'warn',
  fixKind: 'none',
  fixTouches: [],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test',
  since: '0.1.0',
  ...over,
})

const ALL_LANGUAGES = new Set(['ts' as const])
const NO_CAPABILITIES = new Set<never>()

test('elects the single candidate and selects it for its engine', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(['correctness.no-debugger']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('correctness.no-debugger')).toEqual({ engine: 'oxlint', engineRuleId: 'no-debugger' })
  expect(result.selection.get('oxlint')).toEqual(new Set(['no-debugger']))
  expect(result.suppressed).toEqual([])
  expect(result.uncovered).toEqual([])
})

test('prefers the lower tier and records why the loser was suppressed', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'eslint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
      entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 0 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('dead-code.unused-variable')?.engine).toBe('oxlint')
  expect(result.selection.has('eslint')).toBe(false)
  expect(result.suppressed).toEqual([
    {
      concept: 'dead-code.unused-variable',
      suppressed: { engine: 'eslint', engineRuleId: 'no-unused-vars' },
      winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
      reason: 'lower-tier',
    },
  ])
})

test('breaks a tier tie by engine preference', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'astgrep', engineRuleId: 'a', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'b', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('style.no-var')?.engine).toBe('oxlint')
  expect(result.suppressed[0]?.reason).toBe('engine-preference')
})

test('breaks a same-engine tie by rule id so elections are total', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'zeta', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'alpha', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('style.no-var')?.engineRuleId).toBe('alpha')
  expect(result.suppressed[0]?.reason).toBe('rule-id-tiebreak')
})

test('is order-independent: shuffling the entries changes nothing', () => {
  const entries = [
    entry({ engine: 'eslint', engineRuleId: 'x', concepts: ['style.no-var'], tier: 2 }),
    entry({ engine: 'oxlint', engineRuleId: 'y', concepts: ['style.no-var'] }),
    entry({ engine: 'astgrep', engineRuleId: 'z', concepts: ['style.no-var'] }),
  ]
  const forward = electOwners({
    entries,
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })
  const reversed = electOwners({
    entries: [...entries].reverse(),
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(reversed.owners).toEqual(forward.owners)
  expect(reversed.suppressed).toEqual(forward.suppressed)
})

test('excludes candidates whose required capabilities are unavailable', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'tsgolint',
        engineRuleId: 'typed',
        concepts: ['slop.as-any-cast'],
        tier: 1,
        requires: ['types'],
      }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'] }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('slop.as-any-cast')?.engine).toBe('astgrep')
  expect(result.suppressed).toEqual([])
})

test('admits a capability-requiring candidate once the capability is present', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'tsgolint',
        engineRuleId: 'typed',
        concepts: ['slop.as-any-cast'],
        tier: 1,
        requires: ['types'],
      }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'], tier: 2 }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: new Set(['types'] as const),
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('slop.as-any-cast')?.engine).toBe('tsgolint')
})

test('excludes candidates whose languages are absent from the repository', () => {
  const result = electOwners({
    entries: [entry({ engine: 'biome-css', engineRuleId: 'css-rule', concepts: ['style.no-var'], languages: ['css'] })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts' as const]),
  })

  expect(result.owners.size).toBe(0)
  expect(result.uncovered).toEqual(['style.no-var'])
})

test('honours a pinned owner even when a faster candidate exists', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
      entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    pinnedOwners: { 'dead-code.unused-variable': 'knip' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('dead-code.unused-variable')?.engine).toBe('knip')
  expect(result.suppressed[0]).toEqual({
    concept: 'dead-code.unused-variable',
    suppressed: { engine: 'oxlint', engineRuleId: 'fast' },
    winner: { engine: 'knip', engineRuleId: 'slow' },
    reason: 'pinned-owner',
  })
})

test('reports a concept as uncovered when the pinned engine offers no rule', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] })],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'eslint' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
  expect(result.owners.size).toBe(0)
})

test('skips deprecated entries', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'oxlint',
        engineRuleId: 'old',
        concepts: ['style.no-var'],
        deprecated: { since: '0.2.0' },
      }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
})

test('enables a rule once even when it wins several concepts', () => {
  const multi = entry({
    engine: 'oxlint',
    engineRuleId: 'no-unused-vars',
    concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
  })
  const result = electOwners({
    entries: [multi],
    enabledConcepts: new Set(['dead-code.unused-variable', 'dead-code.unused-import']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.selection.get('oxlint')).toEqual(new Set(['no-unused-vars']))
  expect(result.owners.size).toBe(2)
})

test('ignores concepts that are not enabled', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.size).toBe(0)
  expect(result.selection.size).toBe(0)
  expect(result.uncovered).toEqual([])
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test -- elect`
Expected: FAIL, cannot resolve `./elect.ts`.

- [ ] **Step 5: Implement election**

`packages/core/src/registry/elect.ts`:

```ts
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { ENGINE_PREFERENCE, type Capability, type EngineId, type RuleEntry, type RuleRef } from './types.ts'

export type SuppressionReason = 'lower-tier' | 'engine-preference' | 'rule-id-tiebreak' | 'pinned-owner'

export type SuppressionRecord = {
  concept: string
  suppressed: RuleRef
  winner: RuleRef
  reason: SuppressionReason
}

export type ElectionInput = {
  entries: readonly RuleEntry[]
  enabledConcepts: ReadonlySet<string>
  capabilities: ReadonlySet<Capability>
  languages: ReadonlySet<LanguageId>
  pinnedOwners?: Readonly<Record<string, EngineId>>
  enginePreference?: readonly EngineId[]
}

export type ElectionResult = {
  owners: Map<string, RuleRef>
  selection: Map<EngineId, Set<string>>
  suppressed: SuppressionRecord[]
  uncovered: string[]
}

const refOf = (entry: RuleEntry): RuleRef => ({ engine: entry.engine, engineRuleId: entry.engineRuleId })

export function electOwners(input: ElectionInput): ElectionResult {
  const preference = input.enginePreference ?? ENGINE_PREFERENCE
  const rank = new Map(preference.map((engine, index) => [engine, index]))

  const owners = new Map<string, RuleRef>()
  const selection = new Map<EngineId, Set<string>>()
  const suppressed: SuppressionRecord[] = []
  const uncovered: string[] = []

  const isApplicable = (entry: RuleEntry): boolean =>
    entry.deprecated === undefined &&
    entry.requires.every((capability) => input.capabilities.has(capability)) &&
    entry.languages.some((language) => input.languages.has(language))

  const compare = (a: RuleEntry, b: RuleEntry): number =>
    a.tier - b.tier ||
    (rank.get(a.engine) ?? preference.length) - (rank.get(b.engine) ?? preference.length) ||
    compareStrings(a.engineRuleId, b.engineRuleId)

  for (const concept of [...input.enabledConcepts].sort(compareStrings)) {
    const ranked = input.entries
      .filter((e) => e.concepts.includes(concept as never) && isApplicable(e))
      .sort(compare)
    const pinned = input.pinnedOwners?.[concept]
    const eligible = pinned === undefined ? ranked : ranked.filter((e) => e.engine === pinned)

    if (eligible.length === 0) {
      uncovered.push(concept)
      continue
    }

    const winner = eligible[0]!
    owners.set(concept, refOf(winner))

    const enabled = selection.get(winner.engine) ?? new Set<string>()
    enabled.add(winner.engineRuleId)
    selection.set(winner.engine, enabled)

    const winnerKey = ruleRefKey(winner)
    for (const loser of ranked) {
      if (ruleRefKey(loser) === winnerKey) continue
      // A pin only explains a suppression for a candidate arbitration would otherwise have ranked
      // ahead of the winner. Testing `loser.engine !== pinned` instead mislabels every
      // other-engine loser as 'pinned-owner', so a pin that merely agrees with what arbitration
      // would have chosen anyway hides the real reason.
      const pinOverrode = pinned !== undefined && compare(loser, winner) < 0
      suppressed.push({
        concept,
        suppressed: refOf(loser),
        winner: refOf(winner),
        reason: reasonFor(winner, loser, pinOverrode),
      })
    }
  }

  return { owners, selection, suppressed, uncovered }
}

function reasonFor(winner: RuleEntry, loser: RuleEntry, pinOverrode: boolean): SuppressionReason {
  if (pinOverrode) return 'pinned-owner'
  if (winner.tier !== loser.tier) return 'lower-tier'
  if (winner.engine !== loser.engine) return 'engine-preference'
  return 'rule-id-tiebreak'
}
```

Three details here are load-bearing for M1's lockfile hash, and every one of them was a bug in an
earlier draft of this plan:

- Concepts are iterated in sorted order, so `suppressed` and `uncovered` do not inherit `Set`
  insertion order.
- Everything derives from the single `ranked` list, so the loser order does not inherit
  `input.entries` order either. Ranking once and filtering the ranked list is the whole trick.
- Losers sharing the winner's `ruleRefKey` are skipped, so a duplicated rule identity cannot record
  the winner as its own loser. The `entries.test.ts` uniqueness invariant should make that
  unreachable; this guard keeps the hashed output sane if it ever is not.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- elect`
Expected: PASS, 13 tests.

- [ ] **Step 7: Write the failing ownership-filter tests**

`packages/core/src/registry/ownership.test.ts`:

```ts
import { expect, test } from 'vitest'
import { filterOwned, isOwned } from './ownership.ts'
import type { RuleRef } from './types.ts'

const owners = new Map<string, RuleRef>([
  ['dead-code.unused-variable', { engine: 'oxlint', engineRuleId: 'no-unused-vars' }],
  ['dead-code.unused-import', { engine: 'knip', engineRuleId: 'unused-export' }],
])

test('accepts a diagnostic from the elected owner', () => {
  expect(isOwned(owners, { concept: 'dead-code.unused-variable', engine: 'oxlint', engineRuleId: 'no-unused-vars' })).toBe(true)
})

test('rejects a diagnostic for a concept owned by another engine', () => {
  expect(isOwned(owners, { concept: 'dead-code.unused-import', engine: 'oxlint', engineRuleId: 'no-unused-vars' })).toBe(false)
})

test('rejects a diagnostic for a concept nobody owns', () => {
  expect(isOwned(owners, { concept: 'style.no-var', engine: 'oxlint', engineRuleId: 'no-var' })).toBe(false)
})

test('filters a mixed batch down to owned diagnostics', () => {
  const batch = [
    { concept: 'dead-code.unused-variable', engine: 'oxlint' as const, engineRuleId: 'no-unused-vars', id: 'keep' },
    { concept: 'dead-code.unused-import', engine: 'oxlint' as const, engineRuleId: 'no-unused-vars', id: 'drop' },
  ]
  expect(filterOwned(owners, batch).map((d) => d.id)).toEqual(['keep'])
})
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `pnpm test -- ownership`
Expected: FAIL, cannot resolve `./ownership.ts`.

- [ ] **Step 9: Implement the ownership filter**

`packages/core/src/registry/ownership.ts`:

```ts
import type { EngineId, RuleRef } from './types.ts'

export type OwnershipCandidate = {
  concept: string
  engine: EngineId
  engineRuleId: string
}

export function isOwned(owners: ReadonlyMap<string, RuleRef>, candidate: OwnershipCandidate): boolean {
  const owner = owners.get(candidate.concept)
  return owner?.engine === candidate.engine && owner.engineRuleId === candidate.engineRuleId
}

export function filterOwned<T extends OwnershipCandidate>(
  owners: ReadonlyMap<string, RuleRef>,
  candidates: readonly T[],
): T[] {
  return candidates.filter((candidate) => isOwned(owners, candidate))
}
```

- [ ] **Step 10: Create the M0 rule entries**

`packages/core/src/registry/entries.ts`. Rule ids use oxlint's config naming, which Task 11 Step 1 verifies against the real binary before anything depends on it. The `eslint` entry exists so M0 exercises a genuine overlap rather than a hypothetical one.

```ts
import type { RuleEntry } from './types.ts'

const OXLINT_DOCS = 'https://oxc.rs/docs/guide/usage/linter/rules'

export const RULE_ENTRIES = [
  {
    engine: 'oxlint',
    engineRuleId: 'no-debugger',
    concepts: ['correctness.no-debugger'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'safe',
    fixTouches: ['statements'],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: `${OXLINT_DOCS}/eslint/no-debugger.html`,
    since: '0.1.0',
  },
  {
    engine: 'oxlint',
    engineRuleId: 'no-dupe-keys',
    concepts: ['correctness.no-duplicate-object-key'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: `${OXLINT_DOCS}/eslint/no-dupe-keys.html`,
    since: '0.1.0',
  },
  {
    engine: 'oxlint',
    engineRuleId: 'no-constant-condition',
    concepts: ['correctness.no-constant-condition'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: `${OXLINT_DOCS}/eslint/no-constant-condition.html`,
    since: '0.1.0',
  },
  {
    engine: 'oxlint',
    engineRuleId: 'no-unused-vars',
    concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
    classify: [{ messagePattern: '\\bimport(ed)?\\b', concept: 'dead-code.unused-import' }],
    tier: 0,
    priority: 90,
    severityDefault: 'warn',
    fixKind: 'suggested',
    fixTouches: ['imports', 'statements'],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: `${OXLINT_DOCS}/eslint/no-unused-vars.html`,
    since: '0.1.0',
  },
  {
    engine: 'oxlint',
    engineRuleId: 'no-var',
    concepts: ['style.no-var'],
    tier: 0,
    priority: 80,
    severityDefault: 'warn',
    fixKind: 'safe',
    fixTouches: ['statements'],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: `${OXLINT_DOCS}/eslint/no-var.html`,
    since: '0.1.0',
  },
  {
    engine: 'oxlint',
    engineRuleId: 'typescript/no-explicit-any',
    concepts: ['slop.as-any-cast'],
    tier: 0,
    priority: 85,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'vue', 'svelte', 'astro'],
    docsUrl: `${OXLINT_DOCS}/typescript/no-explicit-any.html`,
    since: '0.1.0',
  },
  {
    engine: 'eslint',
    engineRuleId: '@typescript-eslint/no-unused-vars',
    concepts: ['dead-code.unused-variable'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'suggested',
    fixTouches: ['imports', 'statements'],
    requires: [],
    languages: ['ts', 'tsx'],
    docsUrl: 'https://typescript-eslint.io/rules/no-unused-vars/',
    since: '0.1.0',
  },
] as const satisfies readonly RuleEntry[]
```

- [ ] **Step 11: Write the failing registry invariant tests**

`packages/core/src/registry/entries.test.ts`. These are the guard rails that keep the registry trustworthy as it grows to hundreds of entries.

```ts
import { expect, test } from 'vitest'
import { isConceptId } from '../concepts/catalogue.ts'
import { LANGUAGES } from '../languages.ts'
import { electOwners } from './elect.ts'
import { RULE_ENTRIES } from './entries.ts'
import { ENGINE_PREFERENCE, ruleRefKey } from './types.ts'

test('every referenced concept exists in the catalogue', () => {
  const unknown = RULE_ENTRIES.flatMap((e) => e.concepts.filter((c) => !isConceptId(c)))
  expect(unknown).toEqual([])
})

test('every entry declares at least one concept and one language', () => {
  for (const entry of RULE_ENTRIES) {
    expect(entry.concepts.length, ruleRefKey(entry)).toBeGreaterThan(0)
    expect(entry.languages.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('every declared language is known', () => {
  const unknown = RULE_ENTRIES.flatMap((e) => e.languages.filter((l) => !LANGUAGES.includes(l)))
  expect(unknown).toEqual([])
})

test('every entry has an absolute documentation url', () => {
  for (const entry of RULE_ENTRIES) {
    expect(entry.docsUrl, ruleRefKey(entry)).toMatch(/^https:\/\//)
  }
})

test('every engine is listed in the preference order', () => {
  const missing = RULE_ENTRIES.map((e) => e.engine).filter((e) => !ENGINE_PREFERENCE.includes(e))
  expect(missing).toEqual([])
})

test('an entry that declares a fix also declares what the fix touches', () => {
  for (const entry of RULE_ENTRIES) {
    if (entry.fixKind === 'none') expect(entry.fixTouches, ruleRefKey(entry)).toEqual([])
    else expect(entry.fixTouches.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('no rule entry claims a formatting concept', () => {
  // The formatter is the permanent owner of `formatting.*` (spec 5.3).
  const offenders = RULE_ENTRIES.filter(
    (e) => e.engine !== 'oxfmt' && e.concepts.some((c) => c.startsWith('formatting.')),
  )
  expect(offenders.map(ruleRefKey)).toEqual([])
})

test('every rule covering more than one concept can attribute a finding to one of them', () => {
  for (const entry of RULE_ENTRIES) {
    if (entry.concepts.length > 1) {
      expect(entry.classify, ruleRefKey(entry)).toBeDefined()
      expect(entry.classify!.length, ruleRefKey(entry)).toBeGreaterThan(0)
    }
  }
})

test('every classify target is one of the concepts the rule claims', () => {
  for (const entry of RULE_ENTRIES) {
    for (const rule of entry.classify ?? []) {
      expect(entry.concepts as readonly string[], ruleRefKey(entry)).toContain(rule.concept)
    }
  }
})

test('every classify pattern is a valid regular expression', () => {
  for (const entry of RULE_ENTRIES) {
    for (const rule of entry.classify ?? []) {
      expect(() => new RegExp(rule.messagePattern), `${ruleRefKey(entry)}: ${rule.messagePattern}`).not.toThrow()
    }
  }
})

test('the shipped registry contains a real overlap and resolves it to oxlint', () => {
  const result = electOwners({
    entries: RULE_ENTRIES,
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: new Set(),
    languages: new Set(['ts']),
  })

  expect(result.suppressed).toHaveLength(1)
  expect(result.owners.get('dead-code.unused-variable')?.engine).toBe('oxlint')
  expect(result.suppressed[0]?.reason).toBe('lower-tier')
})
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm test -- registry`
Expected: PASS, 28 tests across the three registry test files (13 election, 4 ownership, 11 entries). If the overlap test fails, the `eslint` entry's `tier` is wrong — it must be `2`.

- [ ] **Step 13: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export { LANGUAGES, SCRIPT_LANGUAGES, type LanguageId } from './languages.ts'
export { compareStrings } from './ordering.ts'
export {
  ENGINE_PREFERENCE,
  ruleRefKey,
  type Capability,
  type ClassifyRule,
  type EngineId,
  type EngineTier,
  type FixDomain,
  type RuleEntry,
  type RuleRef,
} from './registry/types.ts'
export { RULE_ENTRIES } from './registry/entries.ts'
export {
  electOwners,
  type ElectionInput,
  type ElectionResult,
  type SuppressionReason,
  type SuppressionRecord,
} from './registry/elect.ts'
export { filterOwned, isOwned, type OwnershipCandidate } from './registry/ownership.ts'
```

- [ ] **Step 14: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): rule registry with deterministic concept arbitration

Each concept gets exactly one owner, elected by tier then engine
preference then rule id, so the outcome is total and order-independent.
Ownership is enforced again at diagnostic level because one engine rule
may cover several concepts. Formatting concepts are reserved for the
formatter, which dissolves the eslint-config-prettier class of conflict."
```

---

## Task 5: Config types, defineConfig and presets

**Files:**
- Create: `packages/core/src/config/types.ts`, `packages/core/src/config/define.ts`, `packages/core/src/config/presets.ts`
- Test: `packages/core/src/config/presets.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ConceptId`, `isConceptId` (Task 3); `EngineId`, `RULE_ENTRIES` (Task 4).
- Produces:
  - `type RuleLevel = 'off' | 'info' | 'warn' | 'error'`
  - `type RuleSetting = RuleLevel | readonly [RuleLevel, Record<string, unknown>]`
  - `type RuleKey = ConceptId | \`${EngineId}/${string}\``
  - `type RuleMap = Partial<Record<RuleKey, RuleSetting>>`
  - `type OverrideBlock = { files: readonly string[]; rules: RuleMap }`
  - `type SlopGateConfig`, `type PresetName = 'recommended' | 'strict' | 'slop'`
  - `defineConfig(config: SlopGateConfig): SlopGateConfig`
  - `const PRESETS: Readonly<Record<PresetName, RuleMap>>`
  - `isRuleLevel(value: unknown): value is RuleLevel`, `splitRuleSetting(setting: RuleSetting): { level: RuleLevel; options: Record<string, unknown> }`

**Design note on `RuleKey`:** the canonical key is a concept id, and engine rule ids are the escape hatch (§6.1). Typing the map as `Partial<Record<ConceptId | \`${EngineId}/${string}\`, RuleSetting>>` keeps both usable while still rejecting `'dead-code.unused-imprt'` at compile time — a bare typo has no slash, so it matches neither arm of the union. That is the type-safety payoff described in §5.6, available before the generated types of M1 exist.

- [ ] **Step 1: Create the config types**

`packages/core/src/config/types.ts`:

```ts
import type { ConceptId } from '../concepts/catalogue.ts'
import type { EngineId } from '../registry/types.ts'

export type RuleLevel = 'off' | 'info' | 'warn' | 'error'

export type RuleSetting = RuleLevel | readonly [RuleLevel, Record<string, unknown>]

export type EngineRuleKey = `${EngineId}/${string}`

export type RuleKey = ConceptId | EngineRuleKey

export type RuleMap = Partial<Record<RuleKey, RuleSetting>>

export type OverrideBlock = {
  readonly files: readonly string[]
  readonly rules: RuleMap
}

export type PresetName = 'recommended' | 'strict' | 'slop'

export type EngineOptions = { readonly enabled?: boolean | 'auto' }

export type SlopGateConfig = {
  readonly extends?: readonly PresetName[]
  readonly workspaces?: 'auto' | readonly string[]
  readonly rules?: RuleMap
  readonly overrides?: readonly OverrideBlock[]
  readonly owners?: Partial<Record<ConceptId, EngineId>>
  readonly engines?: Partial<Record<EngineId, EngineOptions>>
  readonly ignore?: readonly string[]
}

const RULE_LEVELS: readonly RuleLevel[] = ['off', 'info', 'warn', 'error']

export function isRuleLevel(value: unknown): value is RuleLevel {
  return typeof value === 'string' && RULE_LEVELS.includes(value as RuleLevel)
}

/**
 * Narrows on `typeof === 'string'`, not `Array.isArray`. A `readonly` tuple is not assignable to
 * `Array.isArray`'s `any[]` predicate, so that form narrows in neither direction: the tuple branch
 * degrades to `any` and the string branch still needs a cast. Both sides then escape strict
 * checking entirely, which is exactly what this function exists to provide.
 */
export function splitRuleSetting(setting: RuleSetting): {
  level: RuleLevel
  options: Record<string, unknown>
} {
  return typeof setting === 'string'
    ? { level: setting, options: {} }
    : { level: setting[0], options: setting[1] }
}
```

- [ ] **Step 2: Create defineConfig**

`packages/core/src/config/define.ts`:

```ts
import type { SlopGateConfig } from './types.ts'

/**
 * Identity at runtime. Its only job is to give config files full inference and
 * autocompletion without the author writing a type annotation.
 */
export function defineConfig(config: SlopGateConfig): SlopGateConfig {
  return config
}
```

- [ ] **Step 3: Create the presets**

`packages/core/src/config/presets.ts`:

```ts
import type { PresetName, RuleMap } from './types.ts'

const recommended: RuleMap = {
  'correctness.no-debugger': 'error',
  'correctness.no-duplicate-object-key': 'error',
  'correctness.no-constant-condition': 'error',
  'dead-code.unused-import': 'warn',
  'dead-code.unused-variable': 'warn',
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
}

const strict: RuleMap = {
  ...recommended,
  'dead-code.unused-import': 'error',
  'dead-code.unused-variable': 'error',
  'style.no-var': 'error',
  'config.rule-overlap': 'warn',
}

const slop: RuleMap = {
  'slop.as-any-cast': 'warn',
}

export const PRESETS: Readonly<Record<PresetName, RuleMap>> = { recommended, strict, slop }
```

- [ ] **Step 4: Write the failing preset tests**

`packages/core/src/config/presets.test.ts`:

```ts
import { expect, test } from 'vitest'
import { isConceptId } from '../concepts/catalogue.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { PRESETS } from './presets.ts'
import { isRuleLevel, splitRuleSetting, type RuleKey } from './types.ts'

const allKeys = Object.values(PRESETS).flatMap((map) => Object.keys(map) as RuleKey[])

test('every preset key is a known concept', () => {
  expect(allKeys.filter((key) => !isConceptId(key))).toEqual([])
})

test('every preset level is valid', () => {
  for (const [name, map] of Object.entries(PRESETS)) {
    for (const [key, setting] of Object.entries(map)) {
      expect(isRuleLevel(splitRuleSetting(setting!).level), `${name}/${key}`).toBe(true)
    }
  }
})

test('no preset enables a concept no shipped rule can detect', () => {
  const detectable = new Set(RULE_ENTRIES.flatMap((entry) => entry.concepts as readonly string[]))
  const configOnly = new Set(['config.rule-overlap', 'config.dead-override', 'config.unused-suppression'])
  const orphaned = allKeys.filter((key) => !detectable.has(key) && !configOnly.has(key))
  expect(orphaned).toEqual([])
})

test('strict is at least as strict as recommended', () => {
  const rank = { off: 0, info: 1, warn: 2, error: 3 } as const
  for (const [key, setting] of Object.entries(PRESETS.recommended)) {
    const strictSetting = PRESETS.strict[key as RuleKey]
    expect(strictSetting, key).toBeDefined()
    const before = rank[splitRuleSetting(setting!).level]
    const after = rank[splitRuleSetting(strictSetting!).level]
    expect(after, key).toBeGreaterThanOrEqual(before)
  }
})

test('splitRuleSetting normalises both shapes', () => {
  expect(splitRuleSetting('warn')).toEqual({ level: 'warn', options: {} })
  expect(splitRuleSetting(['error', { max: 80 }])).toEqual({ level: 'error', options: { max: 80 } })
})

test('splitRuleSetting reads level and options from the tuple in order', () => {
  const setting: RuleSetting = ['error', { max: 80, allow: ['a'] }]
  const { level, options } = splitRuleSetting(setting)

  expect(level).toBe('error')
  expect(options).toEqual({ max: 80, allow: ['a'] })
})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- presets`
Expected: PASS, 5 tests. The `configOnly` allowance in the third test is deliberate: those three concepts are emitted by the orchestrator itself, not by an engine rule, so no registry entry covers them.

- [ ] **Step 6: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export {
  isRuleLevel,
  splitRuleSetting,
  type EngineOptions,
  type EngineRuleKey,
  type OverrideBlock,
  type PresetName,
  type RuleKey,
  type RuleLevel,
  type RuleMap,
  type RuleSetting,
  type SlopGateConfig,
} from './config/types.ts'
export { defineConfig } from './config/define.ts'
export { PRESETS } from './config/presets.ts'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): config types, defineConfig and presets

Config keys are concepts by default with engine rule ids as an escape
hatch, expressed as a union so a bare typo fails to type-check. Presets
are validated against the catalogue and the shipped rule entries, so a
preset can never enable something nothing can detect."
```

---

## Task 6: Config loading

**Files:**
- Create: `packages/core/src/config/load.ts`, `packages/core/src/errors.ts`
- Test: `packages/core/src/config/load.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json`

**Interfaces:**
- Consumes: `SlopGateConfig` (Task 5).
- Produces:
  - `class ConfigError extends Error` with `readonly code: 'config'` — the CLI maps this to exit code 2
  - `findConfigFile(cwd: string): Promise<string | null>`
  - `loadConfig(cwd: string): Promise<{ config: SlopGateConfig; file: string } | null>`

**Dependency justification:** `oxc-transform` is oxlint's own transformer, already inside the oxc toolchain we depend on. It is the fallback path for config files Node's type stripping cannot handle (§6.4) and for runtimes without type stripping.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @misaon/slop-gate-core add oxc-transform
```

- [ ] **Step 2: Create the typed error**

`packages/core/src/errors.ts`:

```ts
export class ConfigError extends Error {
  readonly code = 'config' as const

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConfigError'
  }
}

export class EngineError extends Error {
  readonly code = 'engine' as const
  readonly engine: string

  constructor(engine: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'EngineError'
    this.engine = engine
  }
}
```

- [ ] **Step 3: Write the failing loader tests**

`packages/core/src/config/load.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ConfigError } from '../errors.ts'
import { findConfigFile, loadConfig } from './load.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-config-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('returns null when no config file exists', async () => {
  expect(await findConfigFile(dir)).toBeNull()
  expect(await loadConfig(dir)).toBeNull()
})

test('loads a TypeScript config with type annotations', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `type Level = 'warn' | 'error'
     const level: Level = 'error'
     export default { extends: ['recommended'], rules: { 'style.no-var': level } }
    `,
  )

  const loaded = await loadConfig(dir)
  expect(loaded?.config.extends).toEqual(['recommended'])
  expect(loaded?.config.rules?.['style.no-var']).toBe('error')
})

test('loads a plain JavaScript config', async () => {
  await writeFile(join(dir, 'slop-gate.config.js'), `export default { ignore: ['dist/**'] }`)
  expect((await loadConfig(dir))?.config.ignore).toEqual(['dist/**'])
})

test('finds a config in a parent directory', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default {}`)
  const nested = join(dir, 'packages', 'app')
  await import('node:fs/promises').then((fs) => fs.mkdir(nested, { recursive: true }))
  expect(await findConfigFile(nested)).toBe(join(dir, 'slop-gate.config.ts'))
})

test('rejects a config without a default export', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export const config = {}`)
  await expect(loadConfig(dir)).rejects.toThrow(ConfigError)
})

test('rejects a default export that is not an object', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default 42`)
  await expect(loadConfig(dir)).rejects.toThrow(/must export a configuration object/)
})

test('reports a syntax error with the real parse diagnostic, not a misleading one', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { rules: `)

  // Asserting only on the filename would pass even when the "no default export" branch fires,
  // which is what an earlier version of this code actually did.
  await expect(loadConfig(dir)).rejects.toThrow(/could not be parsed/)
  await expect(loadConfig(dir)).rejects.toThrow(/slop-gate\.config\.ts/)
  await expect(loadConfig(dir)).rejects.not.toThrow(/default export/)
})

test('explains path aliases when an import cannot be resolved', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    `import { x } from '@app/shared'
     export default { ignore: [x] }
    `,
  )
  await expect(loadConfig(dir)).rejects.toThrow(/tsconfig path aliases/)
})

test('prefers .ts over .js when both exist', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), `export default { ignore: ['from-ts'] }`)
  await writeFile(join(dir, 'slop-gate.config.js'), `export default { ignore: ['from-js'] }`)
  expect((await loadConfig(dir))?.config.ignore).toEqual(['from-ts'])
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test -- config/load`
Expected: FAIL, cannot resolve `./load.ts`.

- [ ] **Step 5: Implement the loader**

`packages/core/src/config/load.ts`:

```ts
import { createHash } from 'node:crypto'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, parse as parsePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ConfigError } from '../errors.ts'
import type { SlopGateConfig } from './types.ts'

const CONFIG_BASENAMES = [
  'slop-gate.config.ts',
  'slop-gate.config.mts',
  'slop-gate.config.js',
  'slop-gate.config.mjs',
] as const

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

export async function findConfigFile(cwd: string): Promise<string | null> {
  let current = cwd
  for (;;) {
    for (const basename of CONFIG_BASENAMES) {
      const candidate = join(current, basename)
      if (await exists(candidate)) return candidate
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function loadConfig(
  cwd: string,
): Promise<{ config: SlopGateConfig; file: string } | null> {
  const file = await findConfigFile(cwd)
  if (file === null) return null

  const module = await importModule(file)
  const exported = (module as { default?: unknown }).default

  if (exported === undefined) {
    throw new ConfigError(`${file} has no default export. Use \`export default defineConfig({ ... })\`.`)
  }
  if (typeof exported !== 'object' || exported === null || Array.isArray(exported)) {
    throw new ConfigError(`${file} must export a configuration object, received ${typeof exported}.`)
  }

  return { config: exported as SlopGateConfig, file }
}

async function importModule(file: string): Promise<unknown> {
  try {
    return await import(pathToFileURL(file).href)
  } catch (cause) {
    if (isModuleNotFound(cause)) {
      throw new ConfigError(
        `${file} imports a module that could not be resolved. Config files are loaded by the ` +
          `runtime directly, so tsconfig path aliases are not available — use a relative path or a ` +
          `package.json "imports" subpath instead.`,
        { cause },
      )
    }
    return await importTransformed(file, cause)
  }
}

/**
 * Fallback for syntax the runtime cannot strip on its own. The transformed file is written next to
 * the original rather than to a temp directory so relative imports inside the config still resolve.
 */
async function importTransformed(file: string, originalCause: unknown): Promise<unknown> {
  const { dir, name } = parsePath(file)
  let scratch: string | undefined

  try {
    const source = await readFile(file, 'utf8')
    const { transform } = await import('oxc-transform')
    const result = await transform(file, source, { sourcemap: false })

    // oxc-transform is error-tolerant: a total parse failure yields `code: ''` plus a populated
    // `errors`, and an empty module imports perfectly well. Without this check the caller reaches
    // the "no default export" branch and the user is told to add an export when their real problem
    // is an unclosed brace — while oxc's own precise diagnostic is thrown away.
    const [firstError] = result.errors
    if (firstError !== undefined) {
      // `codeframe` carries the exact source location; `message` alone loses it.
      throw new ConfigError(`${file} could not be parsed: ${firstError.codeframe ?? firstError.message}`)
    }

    const token = createHash('sha256').update(source).digest('hex').slice(0, 8)
    scratch = join(dir, `${name}.${token}.sgate.mjs`)
    await writeFile(scratch, result.code, 'utf8')
    return await import(pathToFileURL(scratch).href)
  } catch (cause) {
    if (cause instanceof ConfigError) throw cause
    throw new ConfigError(
      `failed to load ${file}: ${describe(originalCause)} (fallback also failed: ${describe(cause)})`,
      { cause },
    )
  } finally {
    if (scratch !== undefined) await rm(scratch, { force: true })
  }
}

function isModuleNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_MODULE_NOT_FOUND'
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- config/load`
Expected: PASS, 9 tests.

`oxc-transform` is error-tolerant by design: on a total parse failure it does not throw, it returns
`code: ''` with a populated `errors` array. An empty `.mjs` is valid ESM, so it imports cleanly and
the failure never reaches the fallback's own `catch`. That is why the implementation inspects
`result.errors` explicitly rather than relying on an exception, and why the test asserts on the parse
message rather than only on the filename — the filename appears in the misleading message too.

- [ ] **Step 7: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export { ConfigError, EngineError } from './errors.ts'
export { findConfigFile, loadConfig } from './config/load.ts'
```

- [ ] **Step 8: Commit**

```bash
git add packages/core packages/core/package.json
git commit -m "feat(core): load slop-gate.config.ts natively with a transform fallback

Node 24 strips types itself, so the common path is a plain dynamic
import. Non-erasable syntax falls back to oxc-transform, writing the
scratch file beside the original so relative imports still resolve.
Unresolved imports produce an explicit message about path aliases,
which are the predictable first thing people try."
```

---

## Task 7: Config resolution, provenance and override buckets

**Files:**
- Create: `packages/core/src/config/resolve.ts`
- Test: `packages/core/src/config/resolve.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json`

**Interfaces:**
- Consumes: `SlopGateConfig`, `RuleKey`, `RuleLevel`, `RuleSetting`, `splitRuleSetting`, `PRESETS` (Task 5); `isConceptId` (Task 3); `RULE_ENTRIES`, `EngineId`, `ruleRefKey` (Task 4).
- Produces:
  - `type ProvenanceLayer = 'preset' | 'root-config' | 'workspace-config' | 'override'`
  - `type ProvenanceStep = { layer: ProvenanceLayer; source: string; setting: RuleSetting }`
  - `type RuleResolution = { key: RuleKey; level: RuleLevel; options: Record<string, unknown>; provenance: ProvenanceStep[] }`
  - `type ResolvedRuleSet = { rules: ReadonlyMap<RuleKey, RuleResolution>; enabledConcepts: ReadonlySet<string>; pinnedOwners: Readonly<Record<string, EngineId>>; unknownKeys: readonly string[] }`
  - `createRuleSetResolver(input: ResolveInput): RuleSetResolver` where `RuleSetResolver = { base: ResolvedRuleSet; forFile(relativePath: string): ResolvedRuleSet; bucketCount(): number }`

**Design notes:**
- Path-scoped overrides make the effective ruleset a function of the file, but resolving every rule for every file would be quadratic. Files whose *set of matching overrides* is identical share one resolved ruleset, memoized by the matching override indices. On a real monorepo the bucket count is a handful even with thousands of files.
- Options **replace** rather than deep-merge. Deep merging array-valued options is ambiguous and produces settings nobody wrote; replacement is what `provenance` can honestly explain.
- Ownership-driven dead-override detection (an override targeting a rule that lost arbitration) requires the election result and lands with `sgate rules conflicts` in M1. This task detects only keys that name nothing at all.

**Dependency justification:** `picomatch` compiles a glob once into a reusable matcher. `path.matchesGlob` recompiles on every call and does not cover the full extglob and negation syntax users expect from `files` patterns.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @misaon/slop-gate-core add picomatch
pnpm --filter @misaon/slop-gate-core add -D @types/picomatch
```

- [ ] **Step 2: Write the failing resolution tests**

`packages/core/src/config/resolve.test.ts`:

```ts
import { expect, test } from 'vitest'
import { createRuleSetResolver } from './resolve.ts'

test('applies a preset', () => {
  const { base } = createRuleSetResolver({ config: { extends: ['recommended'] } })
  expect(base.rules.get('correctness.no-debugger')?.level).toBe('error')
  expect(base.enabledConcepts.has('correctness.no-debugger')).toBe(true)
})

test('later presets win over earlier ones', () => {
  const { base } = createRuleSetResolver({ config: { extends: ['recommended', 'strict'] } })
  expect(base.rules.get('dead-code.unused-variable')?.level).toBe('error')
})

test('root rules win over presets and the provenance shows both steps', () => {
  const { base } = createRuleSetResolver({
    config: { extends: ['recommended'], rules: { 'correctness.no-debugger': 'warn' } },
  })
  const resolution = base.rules.get('correctness.no-debugger')
  expect(resolution?.level).toBe('warn')
  expect(resolution?.provenance).toEqual([
    { layer: 'preset', source: 'recommended', setting: 'error' },
    { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'warn' },
  ])
})

test('a workspace config wins over the root config', () => {
  const { base } = createRuleSetResolver({
    config: { rules: { 'style.no-var': 'warn' } },
    workspaceConfig: { file: 'packages/app/slop-gate.config.ts', config: { rules: { 'style.no-var': 'error' } } },
  })
  expect(base.rules.get('style.no-var')?.level).toBe('error')
  expect(base.rules.get('style.no-var')?.provenance.at(-1)?.layer).toBe('workspace-config')
})

test('a rule set to off is retained but not enabled', () => {
  const { base } = createRuleSetResolver({
    config: { extends: ['recommended'], rules: { 'correctness.no-debugger': 'off' } },
  })
  expect(base.rules.get('correctness.no-debugger')?.level).toBe('off')
  expect(base.enabledConcepts.has('correctness.no-debugger')).toBe(false)
})

test('options replace rather than merge', () => {
  const { base } = createRuleSetResolver({
    config: {
      rules: { 'style.no-var': ['warn', { a: 1, b: 2 }] },
      overrides: [{ files: ['**/*.ts'], rules: { 'style.no-var': ['warn', { b: 3 }] } }],
    },
  })
  expect(base.rules.get('style.no-var')?.options).toEqual({ a: 1, b: 2 })
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'style.no-var': ['warn', { a: 1, b: 2 }] },
      overrides: [{ files: ['**/*.ts'], rules: { 'style.no-var': ['warn', { b: 3 }] } }],
    },
  })
  expect(resolver.forFile('src/a.ts').rules.get('style.no-var')?.options).toEqual({ b: 3 })
})

test('an override applies only to matching files', () => {
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'style.no-var': 'error' },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }],
    },
  })
  expect(resolver.forFile('src/a.test.ts').rules.get('style.no-var')?.level).toBe('off')
  expect(resolver.forFile('src/a.ts').rules.get('style.no-var')?.level).toBe('error')
})

test('overrides apply in declaration order', () => {
  const resolver = createRuleSetResolver({
    config: {
      overrides: [
        { files: ['src/**'], rules: { 'style.no-var': 'warn' } },
        { files: ['src/legacy/**'], rules: { 'style.no-var': 'off' } },
      ],
    },
  })
  expect(resolver.forFile('src/legacy/a.ts').rules.get('style.no-var')?.level).toBe('off')
  expect(resolver.forFile('src/new/a.ts').rules.get('style.no-var')?.level).toBe('warn')
})

test('files matching the same overrides share one resolved bucket', () => {
  const resolver = createRuleSetResolver({
    config: { overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }] },
  })
  const first = resolver.forFile('a/b.test.ts')
  const second = resolver.forFile('c/d.test.ts')
  expect(second).toBe(first)
  expect(resolver.forFile('a/b.ts')).not.toBe(first)
  expect(resolver.bucketCount()).toBe(2)
})

test('records the provenance of an override', () => {
  const resolver = createRuleSetResolver({
    config: {
      rules: { 'style.no-var': 'error' },
      overrides: [{ files: ['**/*.test.ts'], rules: { 'style.no-var': 'off' } }],
    },
  })
  expect(resolver.forFile('a.test.ts').rules.get('style.no-var')?.provenance).toEqual([
    { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'error' },
    { layer: 'override', source: 'overrides[0] (**/*.test.ts)', setting: 'off' },
  ])
})

test('accepts an engine rule id as an escape hatch', () => {
  const { base } = createRuleSetResolver({ config: { rules: { 'oxlint/no-debugger': 'error' } } })
  expect(base.rules.get('oxlint/no-debugger')?.level).toBe('error')
  expect(base.unknownKeys).toEqual([])
})

test('reports a key that names neither a concept nor a shipped rule', () => {
  const { base } = createRuleSetResolver({
    config: { rules: { 'oxlint/no-such-rule': 'error' } as never },
  })
  expect(base.unknownKeys).toEqual(['oxlint/no-such-rule'])
})

test('passes pinned owners through', () => {
  const { base } = createRuleSetResolver({
    config: { owners: { 'dead-code.unused-variable': 'knip' } },
  })
  expect(base.pinnedOwners['dead-code.unused-variable']).toBe('knip')
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- config/resolve`
Expected: FAIL, cannot resolve `./resolve.ts`.

- [ ] **Step 4: Implement resolution**

`packages/core/src/config/resolve.ts`:

```ts
import picomatch from 'picomatch'
import { isConceptId } from '../concepts/catalogue.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { ruleRefKey, type EngineId } from '../registry/types.ts'
import { PRESETS } from './presets.ts'
import { splitRuleSetting, type RuleKey, type RuleLevel, type RuleMap, type RuleSetting, type SlopGateConfig } from './types.ts'

export type ProvenanceLayer = 'preset' | 'root-config' | 'workspace-config' | 'override'

export type ProvenanceStep = {
  layer: ProvenanceLayer
  source: string
  setting: RuleSetting
}

export type RuleResolution = {
  key: RuleKey
  level: RuleLevel
  options: Record<string, unknown>
  provenance: ProvenanceStep[]
}

export type ResolvedRuleSet = {
  rules: ReadonlyMap<RuleKey, RuleResolution>
  enabledConcepts: ReadonlySet<string>
  pinnedOwners: Readonly<Record<string, EngineId>>
  unknownKeys: readonly string[]
}

export type ResolveInput = {
  config: SlopGateConfig
  configFile?: string
  workspaceConfig?: { file: string; config: SlopGateConfig }
}

export type RuleSetResolver = {
  base: ResolvedRuleSet
  forFile(relativePath: string): ResolvedRuleSet
  bucketCount(): number
}

const SHIPPED_RULE_KEYS = new Set(RULE_ENTRIES.map(ruleRefKey))

export function createRuleSetResolver(input: ResolveInput): RuleSetResolver {
  const rootSource = input.configFile ?? 'slop-gate.config.ts'
  const baseLayers: Array<{ layer: ProvenanceLayer; source: string; rules: RuleMap }> = []

  for (const preset of input.config.extends ?? []) {
    baseLayers.push({ layer: 'preset', source: preset, rules: PRESETS[preset] })
  }
  if (input.config.rules) {
    baseLayers.push({ layer: 'root-config', source: rootSource, rules: input.config.rules })
  }
  if (input.workspaceConfig?.config.rules) {
    baseLayers.push({
      layer: 'workspace-config',
      source: input.workspaceConfig.file,
      rules: input.workspaceConfig.config.rules,
    })
  }

  const overrides = [...(input.config.overrides ?? []), ...(input.workspaceConfig?.config.overrides ?? [])].map(
    (block, index) => ({
      source: `overrides[${index}] (${block.files.join(', ')})`,
      rules: block.rules,
      isMatch: picomatch(block.files as string[], { dot: true }),
    }),
  )

  const pinnedOwners = { ...input.config.owners, ...input.workspaceConfig?.config.owners } as Record<string, EngineId>

  const base = materialize(baseLayers, pinnedOwners)
  const buckets = new Map<string, ResolvedRuleSet>([['', base]])

  return {
    base,
    forFile(relativePath) {
      const matched = overrides.filter((override) => override.isMatch(relativePath))
      const key = matched.map((override) => override.source).join('|')

      const cached = buckets.get(key)
      if (cached) return cached

      const resolved = materialize(
        [...baseLayers, ...matched.map((m) => ({ layer: 'override' as const, source: m.source, rules: m.rules }))],
        pinnedOwners,
      )
      buckets.set(key, resolved)
      return resolved
    },
    bucketCount() {
      return buckets.size
    },
  }
}

function materialize(
  layers: ReadonlyArray<{ layer: ProvenanceLayer; source: string; rules: RuleMap }>,
  pinnedOwners: Record<string, EngineId>,
): ResolvedRuleSet {
  const rules = new Map<RuleKey, RuleResolution>()

  for (const { layer, source, rules: map } of layers) {
    for (const [rawKey, setting] of Object.entries(map)) {
      if (setting === undefined) continue
      const key = rawKey as RuleKey
      const { level, options } = splitRuleSetting(setting)
      const existing = rules.get(key)
      rules.set(key, {
        key,
        level,
        options,
        provenance: [...(existing?.provenance ?? []), { layer, source, setting }],
      })
    }
  }

  const enabledConcepts = new Set<string>()
  const unknownKeys: string[] = []

  for (const [key, resolution] of rules) {
    if (isConceptId(key)) {
      if (resolution.level !== 'off') enabledConcepts.add(key)
    } else if (!SHIPPED_RULE_KEYS.has(key)) {
      unknownKeys.push(key)
    }
  }

  return { rules, enabledConcepts, pinnedOwners, unknownKeys }
}
```

The bucket key is built from override *sources* rather than array indices so that root and workspace overrides sharing an index cannot collide.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- config/resolve`
Expected: PASS, 13 tests.

- [ ] **Step 6: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export {
  createRuleSetResolver,
  type ProvenanceLayer,
  type ProvenanceStep,
  type ResolveInput,
  type ResolvedRuleSet,
  type RuleResolution,
  type RuleSetResolver,
} from './config/resolve.ts'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): resolve rules through layers with recorded provenance

Every layer application is retained so M1 can answer 'why is this rule
on'. Files matching the same set of overrides share one memoized
ruleset, keeping per-file resolution cheap on large monorepos. Options
replace instead of deep-merging, because provenance can only honestly
explain a setting somebody actually wrote."
```

---

## Task 8: Language detection and the workspace graph

**Files:**
- Create: `packages/core/src/discovery/types.ts`, `packages/core/src/discovery/language.ts`, `packages/core/src/discovery/workspaces.ts`
- Test: `packages/core/src/discovery/language.test.ts`, `packages/core/src/discovery/workspaces.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json`

**Interfaces:**
- Consumes: `LanguageId` (Task 4).
- Produces:
  - `type WorkspaceNode = { name: string; dir: string }` — `dir` is repo-relative POSIX, `''` for the root
  - `type WorkspaceGraph = { nodes: readonly WorkspaceNode[]; attribute(relativePath: string): WorkspaceNode }`
  - `buildWorkspaceGraph(rootDir: string): Promise<WorkspaceGraph>`
  - `type InventoryFile = { path: string; language: LanguageId; workspace: string; size: number; mtimeMs: number }`
  - `type FileInventory = { root: string; files: readonly InventoryFile[]; languages: ReadonlySet<LanguageId>; workspaces: readonly WorkspaceNode[] }`
  - `detectLanguage(relativePath: string): LanguageId`

**Dependency justification:** `yaml` parses `pnpm-workspace.yaml`. Node has no YAML parser, and pnpm workspaces are the most common monorepo layout we must support.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @misaon/slop-gate-core add yaml
```

- [ ] **Step 2: Create the discovery types**

`packages/core/src/discovery/types.ts`:

```ts
import type { LanguageId } from '../languages.ts'
import type { WorkspaceNode } from './workspaces.ts'

export type InventoryFile = {
  /** Repo-relative, POSIX separators. */
  readonly path: string
  readonly language: LanguageId
  /** Repo-relative POSIX directory of the owning workspace; empty string for the root. */
  readonly workspace: string
  readonly size: number
  readonly mtimeMs: number
}

export type FileInventory = {
  /** Absolute path of the repository root. The only absolute path in the model. */
  readonly root: string
  readonly files: readonly InventoryFile[]
  readonly languages: ReadonlySet<LanguageId>
  readonly workspaces: readonly WorkspaceNode[]
}
```

- [ ] **Step 3: Write the failing language tests**

`packages/core/src/discovery/language.test.ts`:

```ts
import { expect, test } from 'vitest'
import { detectLanguage } from './language.ts'

test.each([
  ['src/a.ts', 'ts'],
  ['src/a.mts', 'ts'],
  ['src/a.cts', 'ts'],
  ['src/a.tsx', 'tsx'],
  ['src/a.js', 'js'],
  ['src/a.mjs', 'js'],
  ['src/a.jsx', 'jsx'],
  ['src/App.vue', 'vue'],
  ['src/App.svelte', 'svelte'],
  ['src/page.astro', 'astro'],
  ['styles/a.css', 'css'],
  ['styles/a.scss', 'scss'],
  ['styles/a.less', 'less'],
  ['index.html', 'html'],
  ['package.json', 'json'],
  ['tsconfig.json', 'jsonc'],
  ['tsconfig.build.json', 'jsonc'],
  ['packages/app/tsconfig.node.json', 'jsonc'],
  ['jsconfig.app.json', 'jsonc'],
  ['.oxlintrc.json', 'jsonc'],
  ['config.yaml', 'yaml'],
  ['config.yml', 'yaml'],
  ['Cargo.toml', 'toml'],
  ['README.md', 'markdown'],
  ['LICENSE', 'unknown'],
])('detects %s as %s', (path, expected) => {
  expect(detectLanguage(path)).toBe(expected)
})

test.each([
  ['Dockerfile', 'dockerfile'],
  ['Dockerfile.prod', 'dockerfile'],
  ['docker/api.dockerfile', 'dockerfile'],
  ['apps/web/Dockerfile', 'dockerfile'],
])('detects %s as a dockerfile', (path) => {
  expect(detectLanguage(path)).toBe('dockerfile')
})

test.each([
  ['.github/workflows/ci.yml', 'github-workflow'],
  ['.github/workflows/release.yaml', 'github-workflow'],
])('detects %s as a github workflow', (path) => {
  expect(detectLanguage(path)).toBe('github-workflow')
})

test('does not treat other .github yaml as a workflow', () => {
  expect(detectLanguage('.github/dependabot.yml')).toBe('yaml')
})

test('is case-insensitive about extensions', () => {
  expect(detectLanguage('src/A.TS')).toBe('ts')
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test -- discovery/language`
Expected: FAIL, cannot resolve `./language.ts`.

- [ ] **Step 5: Implement language detection**

`packages/core/src/discovery/language.ts`:

```ts
import type { LanguageId } from '../languages.ts'

const BY_EXTENSION: Readonly<Record<string, LanguageId>> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  mdx: 'markdown',
  dockerfile: 'dockerfile',
}

/** Files whose name, not extension, decides the language. */
const JSONC_BASENAMES = new Set(['tsconfig.json', 'jsconfig.json', '.oxlintrc.json', 'biome.json'])

/** `tsconfig.build.json`, `jsconfig.app.json` — the project-references naming convention. */
const JSONC_PATTERN = /^(?:tsconfig|jsconfig)\..+\.json$/

const WORKFLOW_PATTERN = /^\.github\/workflows\/[^/]+\.ya?ml$/

export function detectLanguage(relativePath: string): LanguageId {
  const normalized = relativePath.replaceAll('\\', '/')
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
  const lower = basename.toLowerCase()

  if (WORKFLOW_PATTERN.test(normalized)) return 'github-workflow'
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (JSONC_BASENAMES.has(lower) || JSONC_PATTERN.test(lower) || lower.endsWith('.tsconfig.json')) return 'jsonc'

  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return 'unknown'
  return BY_EXTENSION[lower.slice(dot + 1)] ?? 'unknown'
}
```

`dot <= 0` rather than `dot < 0` is deliberate: it leaves dotfiles such as `.gitignore` as `unknown` instead of reading `gitignore` as an extension.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- discovery/language`
Expected: PASS, 33 assertions across 5 test blocks.

- [ ] **Step 7: Write the failing workspace tests**

`packages/core/src/discovery/workspaces.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildWorkspaceGraph } from './workspaces.ts'

let dir: string

const writePackage = async (relative: string, name: string): Promise<void> => {
  const target = join(dir, relative)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({ name }))
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-ws-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('a repo with no workspaces has only the root', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'solo' }))
  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes).toEqual([{ name: 'solo', dir: '' }])
})

test('reads pnpm-workspace.yaml', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await writePackage('packages/app', '@x/app')
  await writePackage('packages/ui', '@x/ui')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'packages/app', 'packages/ui'])
})

test('honours a negated pnpm pattern', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - "!packages/private"\n')
  await writePackage('packages/app', '@x/app')
  await writePackage('packages/private', '@x/private')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'packages/app'])
})

test('reads package.json workspaces', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['apps/*'] }))
  await writePackage('apps/web', '@x/web')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'apps/web'])
})

test('attributes a file to the longest matching workspace', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*', 'packages/app/plugins/*'] }))
  await writePackage('packages/app', '@x/app')
  await writePackage('packages/app/plugins/auth', '@x/auth')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.attribute('packages/app/plugins/auth/src/a.ts').dir).toBe('packages/app/plugins/auth')
  expect(graph.attribute('packages/app/src/a.ts').dir).toBe('packages/app')
  expect(graph.attribute('scripts/build.ts').dir).toBe('')
})

test('does not attribute a file to a workspace it merely shares a name prefix with', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }))
  await writePackage('packages/app', '@x/app')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.attribute('packages/app-legacy/src/a.ts').dir).toBe('')
})

test('rejects a malformed pnpm-workspace.yaml instead of silently finding no workspaces', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "unclosed\n   bad: [')

  await expect(buildWorkspaceGraph(dir)).rejects.toThrow(/pnpm-workspace\.yaml/)
})

test('accepts a pnpm-workspace.yaml that parses but declares no packages', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies:\n  - esbuild\n')

  expect((await buildWorkspaceGraph(dir)).nodes).toEqual([{ name: 'root', dir: '' }])
})

test('rejects a workspace pattern that escapes the repository root', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "../outside/*"\n')
  await writePackage('../outside/leaked', '@x/leaked')

  await expect(buildWorkspaceGraph(dir)).rejects.toThrow(/outside the repository root/)
})

test('reads the object form of package.json workspaces', async () => {
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'root', workspaces: { packages: ['apps/*'] } }),
  )
  await writePackage('apps/web', '@x/web')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'apps/web'])
})

test('falls back to the directory name when a package has no name', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
  const target = join(dir, 'packages', 'anon')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), '{}')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.find((n) => n.dir === 'packages/anon')?.name).toBe('anon')
})
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `pnpm test -- discovery/workspaces`
Expected: FAIL, cannot resolve `./workspaces.ts`.

- [ ] **Step 9: Implement the workspace graph**

`packages/core/src/discovery/workspaces.ts`:

```ts
import { glob, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { ConfigError } from '../errors.ts'

export type WorkspaceNode = {
  readonly name: string
  /** Repo-relative POSIX directory; empty string for the root. */
  readonly dir: string
}

export type WorkspaceGraph = {
  readonly nodes: readonly WorkspaceNode[]
  attribute(relativePath: string): WorkspaceNode
}

const toPosix = (value: string): string => value.replaceAll('\\', '/')

const readJson = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readPatterns(rootDir: string): Promise<string[]> {
  const pnpmFile = join(rootDir, 'pnpm-workspace.yaml')
  const pnpmSource = await readFile(pnpmFile, 'utf8').catch(() => null)

  // A missing file legitimately means "not a pnpm workspace". A malformed one does not: swallowing
  // it would silently produce a root-only graph, so every file attributes to the root and any
  // per-workspace config is ignored without explanation.
  if (pnpmSource !== null) {
    let parsed: { packages?: unknown }
    try {
      parsed = parseYaml(pnpmSource) as { packages?: unknown }
    } catch (cause) {
      throw new ConfigError(`${pnpmFile} is not valid YAML`, { cause })
    }
    if (Array.isArray(parsed?.packages)) return parsed.packages.filter((p): p is string => typeof p === 'string')
  }

  const rootPackage = await readJson(join(rootDir, 'package.json'))
  const workspaces = rootPackage?.['workspaces']
  if (Array.isArray(workspaces)) return workspaces.filter((p): p is string => typeof p === 'string')
  if (typeof workspaces === 'object' && workspaces !== null) {
    const nested = (workspaces as { packages?: unknown }).packages
    if (Array.isArray(nested)) return nested.filter((p): p is string => typeof p === 'string')
  }
  return []
}

export async function buildWorkspaceGraph(rootDir: string): Promise<WorkspaceGraph> {
  const rootPackage = await readJson(join(rootDir, 'package.json'))
  const rootNode: WorkspaceNode = {
    name: typeof rootPackage?.['name'] === 'string' ? rootPackage['name'] : 'root',
    dir: '',
  }

  const patterns = await readPatterns(rootDir)
  const positive = patterns.filter((p) => !p.startsWith('!'))
  const negated = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1))
  const isExcluded = negated.length > 0 ? picomatch(negated) : () => false

  const found = new Map<string, WorkspaceNode>()
  for (const pattern of positive) {
    for await (const match of glob(`${pattern}/package.json`, { cwd: rootDir })) {
      // Resolve then re-relativise so `..` is collapsed wherever it appears, not just at the
      // start. `WorkspaceNode.dir` is contractually repo-relative and downstream code joins it
      // onto the root, so a pattern like `../shared/*` or `packages/../../shared/*` must not
      // produce a node at all.
      const dir = toPosix(relative(rootDir, resolve(rootDir, dirname(match))))
      if (dir === '..' || dir.startsWith('../')) {
        throw new ConfigError(`workspace pattern "${pattern}" resolves outside the repository root`)
      }
      if (dir === '' || isExcluded(dir) || found.has(dir)) continue
      const manifest = await readJson(join(rootDir, match))
      const name = typeof manifest?.['name'] === 'string' ? manifest['name'] : dir.slice(dir.lastIndexOf('/') + 1)
      found.set(dir, { name, dir })
    }
  }

  const nodes = [rootNode, ...found.values()]
  const byDepth = [...found.values()].sort((a, b) => b.dir.length - a.dir.length)

  return {
    nodes,
    attribute(relativePath) {
      const path = toPosix(relativePath)
      return byDepth.find((node) => path.startsWith(`${node.dir}/`)) ?? rootNode
    },
  }
}

export function relativePosix(root: string, absolute: string): string {
  return toPosix(relative(root, absolute))
}
```

`path.startsWith(\`${node.dir}/\`)` with the trailing slash is what makes the "name prefix" test pass — without it, `packages/app-legacy/...` would be attributed to `packages/app`.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm test -- discovery`
Expected: PASS, 12 test blocks.

- [ ] **Step 11: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export type { FileInventory, InventoryFile } from './discovery/types.ts'
export { detectLanguage } from './discovery/language.ts'
export {
  buildWorkspaceGraph,
  relativePosix,
  type WorkspaceGraph,
  type WorkspaceNode,
} from './discovery/workspaces.ts'
```

- [ ] **Step 12: Commit**

```bash
git add packages/core
git commit -m "feat(core): language detection and workspace graph

Language is decided by filename before extension so Dockerfiles and
GitHub workflows are recognised. Workspaces come from pnpm-workspace.yaml
or package.json, with negated patterns honoured, and files are attributed
to the deepest containing workspace."
```

---

## Task 9: File sources and the inventory

**Files:**
- Create: `packages/core/src/discovery/sources.ts`, `packages/core/src/discovery/inventory.ts`
- Test: `packages/core/src/discovery/inventory.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `detectLanguage`, `buildWorkspaceGraph`, `InventoryFile`, `FileInventory` (Task 8); `LanguageId` (Task 4).
- Produces:
  - `type FileSource = { list(rootDir: string, signal: AbortSignal): Promise<string[]> }`
  - `createGitFileSource(): FileSource`, `createWalkFileSource(): FileSource`, `selectFileSource(rootDir: string): Promise<FileSource>`
  - `buildInventory(options: { rootDir: string; ignore?: readonly string[]; source?: FileSource; signal?: AbortSignal }): Promise<FileInventory>`

**Design note:** in a git repository we ask git for the file list (§7). `git ls-files -co --exclude-standard -z --deduplicate` returns exactly the tracked plus non-ignored untracked files, and it is both faster and more correct than reimplementing ignore-file semantics. The walker exists for repositories without git and for tarball checkouts.

- [ ] **Step 1: Write the failing inventory tests**

`packages/core/src/discovery/inventory.test.ts`:

```ts
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildInventory, createGitFileSource, createWalkFileSource, selectFileSource } from './inventory.ts'

const run = promisify(execFile)
let dir: string

const write = async (relative: string, content = 'export const a = 1\n'): Promise<void> => {
  const target = join(dir, relative)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-inv-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('collects files with language and workspace attribution', async () => {
  await write('src/a.ts')
  await write('src/b.css', 'a{}')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path).sort()

  expect(paths).toContain('src/a.ts')
  expect(inventory.files.find((f) => f.path === 'src/a.ts')?.language).toBe('ts')
  expect(inventory.files.find((f) => f.path === 'src/b.css')?.language).toBe('css')
  expect(inventory.files.every((f) => f.workspace === '')).toBe(true)
})

test('reports the set of languages present', async () => {
  await write('src/a.ts')
  await write('src/a.vue', '<template />')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.languages.has('ts')).toBe(true)
  expect(inventory.languages.has('vue')).toBe(true)
  expect(inventory.languages.has('scss')).toBe(false)
})

test('records size and mtime for the cache pre-check', async () => {
  await write('src/a.ts', 'const a = 1\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const file = inventory.files.find((f) => f.path === 'src/a.ts')
  expect(file?.size).toBe(12)
  expect(file?.mtimeMs).toBeGreaterThan(0)
})

test('applies ignore patterns', async () => {
  await write('src/a.ts')
  await write('generated/b.ts')

  const inventory = await buildInventory({
    rootDir: dir,
    source: createWalkFileSource(),
    ignore: ['generated/**'],
  })
  expect(inventory.files.map((f) => f.path)).not.toContain('generated/b.ts')
  expect(inventory.files.map((f) => f.path)).toContain('src/a.ts')
})

test('the walker skips node_modules and .git without being told to', async () => {
  await write('node_modules/dep/index.js')
  await write('src/a.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.files.some((f) => f.path.startsWith('node_modules/'))).toBe(false)
})

test('always emits repo-relative POSIX paths', async () => {
  await write('src/nested/deep/a.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.files.map((f) => f.path)).toContain('src/nested/deep/a.ts')
  expect(inventory.files.every((f) => !f.path.includes('\\'))).toBe(true)
  expect(inventory.files.every((f) => !f.path.startsWith('/'))).toBe(true)
})

test('the git source respects .gitignore and includes untracked files', async () => {
  await run('git', ['init', '-q'], { cwd: dir })
  await run('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  await run('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await write('.gitignore', 'ignored/\n')
  await write('src/tracked.ts')
  await run('git', ['add', '.'], { cwd: dir })
  await run('git', ['commit', '-qm', 'init'], { cwd: dir })
  await write('src/untracked.ts')
  await write('ignored/hidden.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createGitFileSource() })
  const paths = inventory.files.map((f) => f.path)

  expect(paths).toContain('src/tracked.ts')
  expect(paths).toContain('src/untracked.ts')
  expect(paths).not.toContain('ignored/hidden.ts')
})

test('selects the git source inside a repository and the walker outside one', async () => {
  expect((await selectFileSource(dir)).id).toBe('walk')
  await run('git', ['init', '-q'], { cwd: dir })
  expect((await selectFileSource(dir)).id).toBe('git')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- discovery/inventory`
Expected: FAIL, cannot resolve `./inventory.ts`.

- [ ] **Step 3: Implement the file sources**

`packages/core/src/discovery/sources.ts`:

```ts
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { toPosix } from '../paths.ts'

const run = promisify(execFile)

export type FileSource = {
  readonly id: 'git' | 'walk'
  list(rootDir: string, signal: AbortSignal): Promise<string[]>
}

const ALWAYS_SKIPPED = new Set(['.git', 'node_modules', '.turbo', 'dist', '.slop-gate'])

export function createGitFileSource(): FileSource {
  return {
    id: 'git',
    async list(rootDir, signal) {
      const { stdout } = await run(
        'git',
        ['ls-files', '-co', '--exclude-standard', '-z', '--deduplicate'],
        { cwd: rootDir, signal, maxBuffer: 1024 * 1024 * 256, encoding: 'utf8' },
      )
      return stdout.split('\0').filter((entry) => entry.length > 0)
    },
  }
}

export function createWalkFileSource(): FileSource {
  return {
    id: 'walk',
    async list(rootDir, signal) {
      const found: string[] = []

      const visit = async (relativeDir: string): Promise<void> => {
        signal.throwIfAborted()
        const entries = await readdir(join(rootDir, relativeDir), { withFileTypes: true })
        await Promise.all(
          entries.map(async (entry) => {
            if (ALWAYS_SKIPPED.has(entry.name)) return
            const child = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
            if (entry.isDirectory()) return visit(child)
            if (entry.isFile()) found.push(child)
          }),
        )
      }

      await visit('')
      return found.map(toPosix)
    },
  }
}

/**
 * Asks git whether this directory is inside a work tree, rather than looking for a literal `.git`.
 * A `.git` probe only ever finds the repository root, so running from `packages/app/` would fall
 * back to the walker — which has no gitignore support at all — precisely in the monorepo case the
 * git source exists to serve. Git resolves both its implicit pathspec and its relative output
 * against `cwd`, so the subtree scoping is correct without extra flags.
 */
export async function selectFileSource(rootDir: string): Promise<FileSource> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: rootDir,
      encoding: 'utf8',
    })
    return stdout.trim() === 'true' ? createGitFileSource() : createWalkFileSource()
  } catch {
    return createWalkFileSource()
  }
}
```

- [ ] **Step 4: Implement the inventory builder**

`packages/core/src/discovery/inventory.ts`:

```ts
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import picomatch from 'picomatch'
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { detectLanguage } from './language.ts'
import { createGitFileSource, createWalkFileSource, selectFileSource, type FileSource } from './sources.ts'
import type { FileInventory, InventoryFile } from './types.ts'
import { buildWorkspaceGraph } from './workspaces.ts'

export { createGitFileSource, createWalkFileSource, selectFileSource, type FileSource }

export type BuildInventoryOptions = {
  rootDir: string
  ignore?: readonly string[]
  source?: FileSource
  signal?: AbortSignal
}

export async function buildInventory(options: BuildInventoryOptions): Promise<FileInventory> {
  const signal = options.signal ?? new AbortController().signal
  const source = options.source ?? (await selectFileSource(options.rootDir))
  const [paths, workspaces] = await Promise.all([
    source.list(options.rootDir, signal),
    buildWorkspaceGraph(options.rootDir),
  ])

  const isIgnored = options.ignore?.length ? picomatch(options.ignore as string[], { dot: true }) : () => false
  const languages = new Set<LanguageId>()
  const files: InventoryFile[] = []

  await Promise.all(
    paths.map(async (path) => {
      if (isIgnored(path)) return
      signal.throwIfAborted()

      // A file vanishing mid-run is a benign race. A permission error is not: swallowing it would
      // quietly shrink the inventory, and every later stage would report a clean result for files
      // it never saw.
      const stats = await stat(join(options.rootDir, path)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (stats === null || !stats.isFile()) return

      const language = detectLanguage(path)
      languages.add(language)
      files.push({
        path,
        language,
        workspace: workspaces.attribute(path).dir,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      })
    }),
  )

  files.sort((a, b) => compareStrings(a.path, b.path))
  return { root: options.rootDir, files, languages, workspaces: workspaces.nodes }
}
```

The `stat` per file is unavoidable — the cache pre-check needs size and mtime (§7, §9) — but it is the only per-file syscall the orchestrator makes, and it replaces a content read. Sorting the result makes runs reproducible, which matters for cache keys and golden reports.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- discovery/inventory`
Expected: PASS, 8 tests. The git tests need `git` on PATH; they are part of the suite because the git source is the default path in real use and must not be exercised only in production.

- [ ] **Step 6: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export {
  buildInventory,
  createGitFileSource,
  createWalkFileSource,
  selectFileSource,
  type BuildInventoryOptions,
  type FileSource,
} from './discovery/inventory.ts'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): shared file inventory from git or a walker

One discovery pass feeds every engine. In a git repo the file list comes
from git ls-files, which is faster and more correct than reimplementing
ignore semantics; the walker covers non-git checkouts. Size and mtime are
captured here so the cache can skip hashing unchanged files."
```

---

## Task 10: Cache keys, stat index and result store

**Files:**
- Create: `packages/core/src/cache/keys.ts`, `packages/core/src/cache/stat-index.ts`, `packages/core/src/cache/result-store.ts`
- Test: `packages/core/src/cache/keys.test.ts`, `packages/core/src/cache/stat-index.test.ts`, `packages/core/src/cache/result-store.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `InventoryFile` (Task 8); `Diagnostic` (Task 2); `EngineId` (Task 4).
- Produces:
  - `const RESULT_SCHEMA_VERSION = 1`
  - `hashContent(content: string | Buffer): string`, `stableStringify(value: unknown): string`, `hashJson(value: unknown): string`
  - `hashRuleSelection(ruleIds: Iterable<string>): string`
  - `deriveResultKey(input: ResultKeyInput): string`
  - `openStatIndex(cacheDir: string): Promise<StatIndex>` where `StatIndex = { hashOf(rootDir: string, file: InventoryFile): Promise<string>; persist(): Promise<void>; rehashCount(): number }`
  - `openResultStore(cacheDir: string): ResultStore` where `ResultStore = { get(key: string): Promise<Diagnostic[] | null>; set(key: string, diagnostics: readonly Diagnostic[]): Promise<void> }`

**Design notes:**
- A clean file stores an **empty array**, and `get` distinguishes that from a miss by returning `[]` rather than `null` (§9). Without this the majority of files in a healthy repo are re-analysed on every run — the classic meta-linter caching bug.
- `deriveResultKey` folds every component into a single hash, but the components are also written into the stored entry so a stale or surprising cache hit can be explained rather than guessed at.
- The stat index is the reason a warm run is fast: content is hashed only when size or mtime moved.

- [ ] **Step 1: Write the failing key tests**

`packages/core/src/cache/keys.test.ts`:

```ts
import { expect, test } from 'vitest'
import { deriveResultKey, hashContent, hashJson, hashRuleSelection, stableStringify } from './keys.ts'

const base = {
  engineId: 'oxlint',
  engineVersion: '1.75.0',
  engineRulesetHash: 'abc',
  fileHash: 'def',
  configHash: 'ghi',
}

test('hashes content deterministically', () => {
  expect(hashContent('a')).toBe(hashContent('a'))
  expect(hashContent('a')).not.toBe(hashContent('b'))
})

test('hashes a string and its utf-8 bytes identically', () => {
  expect(hashContent('abc')).toBe(hashContent(new TextEncoder().encode('abc')))
})

test('stringifies objects with sorted keys so key order cannot change a hash', () => {
  expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  expect(hashJson({ b: 1, a: 2 })).toBe(hashJson({ a: 2, b: 1 }))
})

test('preserves array order when stringifying', () => {
  expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
})

test('hashes a rule selection independently of iteration order', () => {
  expect(hashRuleSelection(['b', 'a'])).toBe(hashRuleSelection(['a', 'b']))
  expect(hashRuleSelection(['a'])).not.toBe(hashRuleSelection(['a', 'b']))
})

test.each([
  ['engineId', { engineId: 'oxfmt' }],
  ['engineVersion', { engineVersion: '1.76.0' }],
  ['engineRulesetHash', { engineRulesetHash: 'changed' }],
  ['fileHash', { fileHash: 'changed' }],
  ['configHash', { configHash: 'changed' }],
])('a different %s produces a different key', (_label, patch) => {
  expect(deriveResultKey({ ...base, ...patch })).not.toBe(deriveResultKey(base))
})

test('the same inputs produce the same key', () => {
  expect(deriveResultKey(base)).toBe(deriveResultKey({ ...base }))
})

test('keys are filesystem-safe hex', () => {
  expect(deriveResultKey(base)).toMatch(/^[0-9a-f]{64}$/)
})

test('cannot be collided by shifting content across a component boundary', () => {
  // The separator itself must be the shifted character. Using an ordinary space here would pass
  // against a naive `\0`-join too, so the test would prove nothing.
  const a = { ...base, engineId: 'a', engineVersion: 'b\u0000c' }
  const b = { ...base, engineId: 'a\u0000b', engineVersion: 'c' }

  expect(deriveResultKey(a)).not.toBe(deriveResultKey(b))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- cache/keys`
Expected: FAIL, cannot resolve `./keys.ts`.

- [ ] **Step 3: Implement the key helpers**

`packages/core/src/cache/keys.ts`:

```ts
import { createHash } from 'node:crypto'
import { compareStrings } from '../ordering.ts'

export const RESULT_SCHEMA_VERSION = 1

export function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)

  return `{${entries.join(',')}}`
}

export function hashJson(value: unknown): string {
  return hashContent(stableStringify(value))
}

export function hashRuleSelection(ruleIds: Iterable<string>): string {
  return hashJson([...ruleIds].sort(compareStrings))
}

export type ResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  fileHash: string
  configHash: string
}

/**
 * Hashes the structured input rather than joining components with a separator. A `\0` join is not
 * injective over untyped strings: `{engineId: 'a', engineVersion: 'b\0c'}` and
 * `{engineId: 'a\0b', engineVersion: 'c'}` produce the same joined string and therefore the same
 * cache key. JSON escaping removes that whole class of boundary-shift collision.
 */
export function deriveResultKey(input: ResultKeyInput): string {
  return hashJson({ schema: RESULT_SCHEMA_VERSION, ...input })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- cache/keys`
Expected: PASS, 11 assertions across 7 test blocks.

- [ ] **Step 5: Write the failing stat index tests**

`packages/core/src/cache/stat-index.test.ts`:

```ts
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { InventoryFile } from '../discovery/types.ts'
import { openStatIndex } from './stat-index.ts'

let dir: string
let cacheDir: string

const fileEntry = async (relative: string): Promise<InventoryFile> => {
  const stats = await stat(join(dir, relative))
  return { path: relative, language: 'ts', workspace: '', size: stats.size, mtimeMs: stats.mtimeMs }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-stat-'))
  cacheDir = join(dir, '.slop-gate', 'cache')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('hashes a file on first sight', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const index = await openStatIndex(cacheDir)
  const hash = await index.hashOf(dir, await fileEntry('a.ts'))

  expect(hash).toMatch(/^[0-9a-f]{64}$/)
  expect(index.rehashCount()).toBe(1)
})

test('reuses the stored hash when size and mtime are unchanged', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const first = await openStatIndex(cacheDir)
  const entry = await fileEntry('a.ts')
  const hash = await first.hashOf(dir, entry)
  await first.persist()

  const second = await openStatIndex(cacheDir)
  expect(await second.hashOf(dir, entry)).toBe(hash)
  expect(second.rehashCount()).toBe(0)
})

test('rehashes when the content changes', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const index = await openStatIndex(cacheDir)
  const before = await index.hashOf(dir, await fileEntry('a.ts'))

  await writeFile(join(dir, 'a.ts'), 'const a = 2\n')
  const after = await index.hashOf(dir, await fileEntry('a.ts'))

  expect(after).not.toBe(before)
  expect(index.rehashCount()).toBe(2)
})

test('rehashes when size matches but mtime moved', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const index = await openStatIndex(cacheDir)
  const entry = await fileEntry('a.ts')
  await index.hashOf(dir, entry)

  await index.hashOf(dir, { ...entry, mtimeMs: entry.mtimeMs + 1000 })
  expect(index.rehashCount()).toBe(2)
})

test('starts empty when the cache directory does not exist', async () => {
  const index = await openStatIndex(join(dir, 'missing', 'cache'))
  await writeFile(join(dir, 'a.ts'), 'x')
  expect(await index.hashOf(dir, await fileEntry('a.ts'))).toMatch(/^[0-9a-f]{64}$/)
})

test('survives a corrupt index file', async () => {
  await writeFile(join(dir, 'a.ts'), 'x')
  const index = await openStatIndex(cacheDir)
  await index.hashOf(dir, await fileEntry('a.ts'))
  await index.persist()
  await writeFile(join(cacheDir, 'stat-index.json'), '{ not json')

  const reopened = await openStatIndex(cacheDir)
  expect(await reopened.hashOf(dir, await fileEntry('a.ts'))).toMatch(/^[0-9a-f]{64}$/)
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test -- stat-index`
Expected: FAIL, cannot resolve `./stat-index.ts`.

- [ ] **Step 7: Implement the stat index**

`packages/core/src/cache/stat-index.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InventoryFile } from '../discovery/types.ts'
import { hashContent } from './keys.ts'

type StatEntry = { size: number; mtimeMs: number; hash: string }

export type StatIndex = {
  hashOf(rootDir: string, file: InventoryFile): Promise<string>
  persist(): Promise<void>
  rehashCount(): number
}

const INDEX_FILE = 'stat-index.json'

export async function openStatIndex(cacheDir: string): Promise<StatIndex> {
  const entries = new Map<string, StatEntry>(Object.entries(await readIndex(cacheDir)))
  let rehashes = 0
  let dirty = false

  return {
    async hashOf(rootDir, file) {
      const cached = entries.get(file.path)
      if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs) return cached.hash

      const hash = hashContent(await readFile(join(rootDir, file.path)))
      entries.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, hash })
      rehashes += 1
      dirty = true
      return hash
    },

    async persist() {
      if (!dirty) return
      await mkdir(cacheDir, { recursive: true })
      const target = join(cacheDir, INDEX_FILE)
      const scratch = `${target}.${randomUUID()}.tmp`
      await writeFile(scratch, JSON.stringify(Object.fromEntries(entries)), 'utf8')
      await rename(scratch, target)
      dirty = false
    },

    rehashCount() {
      return rehashes
    },
  }
}

async function readIndex(cacheDir: string): Promise<Record<string, StatEntry>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(cacheDir, INDEX_FILE), 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, StatEntry>) : {}
  } catch {
    return {}
  }
}
```

A corrupt or absent index degrades to a cold run rather than an error. Writing through a scratch file and renaming keeps a killed process from leaving a half-written index that would poison the next run.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test -- stat-index`
Expected: PASS, 6 tests.

- [ ] **Step 9: Write the failing result store tests**

`packages/core/src/cache/result-store.test.ts`:

```ts
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import { openResultStore } from './result-store.ts'

let cacheDir: string

const diagnostic: Diagnostic = {
  concept: 'correctness.no-debugger',
  ruleId: 'oxlint/no-debugger',
  engine: 'oxlint',
  severity: 'error',
  message: '`debugger` statement is not allowed',
  file: 'src/a.ts',
  range: { start: 10, end: 19 },
  position: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 10 },
  fingerprint: 'deadbeef',
  docsUrl: 'https://example.test',
}

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'sgate-results-'))
})

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

test('returns null for an unknown key', async () => {
  expect(await openResultStore(cacheDir).get('a'.repeat(64))).toBeNull()
})

test('round-trips diagnostics', async () => {
  const store = openResultStore(cacheDir)
  await store.set('b'.repeat(64), [diagnostic])
  expect(await store.get('b'.repeat(64))).toEqual([diagnostic])
})

test('distinguishes a cached clean result from a miss', async () => {
  const store = openResultStore(cacheDir)
  const key = 'c'.repeat(64)
  await store.set(key, [])

  expect(await store.get(key)).toEqual([])
  expect(await store.get('d'.repeat(64))).toBeNull()
})

test('treats a corrupt entry as a miss', async () => {
  const store = openResultStore(cacheDir)
  const key = 'e'.repeat(64)
  await store.set(key, [diagnostic])
  await mkdir(join(cacheDir, 'results', key.slice(0, 2)), { recursive: true })
  await writeFile(join(cacheDir, 'results', key.slice(0, 2), `${key}.json`), '{ not json')

  expect(await store.get(key)).toBeNull()
})

test('shards entries by key prefix to keep directories small', async () => {
  const store = openResultStore(cacheDir)
  const key = 'f0'.padEnd(64, '0')
  await store.set(key, [])
  const { access } = await import('node:fs/promises')
  await expect(access(join(cacheDir, 'results', 'f0', `${key}.json`))).resolves.toBeUndefined()
})
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `pnpm test -- result-store`
Expected: FAIL, cannot resolve `./result-store.ts`.

- [ ] **Step 11: Implement the result store**

`packages/core/src/cache/result-store.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Diagnostic } from '../diagnostics/types.ts'
import { RESULT_SCHEMA_VERSION, type ResultKeyInput } from './keys.ts'

export type ResultStore = {
  get(key: string): Promise<Diagnostic[] | null>
  set(key: string, diagnostics: readonly Diagnostic[], components: ResultKeyInput): Promise<void>
}

/** `key` records what produced this entry, so a surprising cache hit can be explained. */
type StoredResult = { schema: number; key: ResultKeyInput; diagnostics: Diagnostic[] }

export function openResultStore(cacheDir: string): ResultStore {
  const pathFor = (key: string): string => join(cacheDir, 'results', key.slice(0, 2), `${key}.json`)

  return {
    async get(key) {
      try {
        const parsed = JSON.parse(await readFile(pathFor(key), 'utf8')) as StoredResult
        if (parsed.schema !== RESULT_SCHEMA_VERSION || !Array.isArray(parsed.diagnostics)) return null
        return parsed.diagnostics
      } catch {
        return null
      }
    },

    async set(key, diagnostics, components) {
      const target = pathFor(key)
      await mkdir(dirname(target), { recursive: true })
      const payload: StoredResult = {
        schema: RESULT_SCHEMA_VERSION,
        key: components,
        diagnostics: [...diagnostics],
      }
      const scratch = `${target}.${randomUUID()}.tmp`
      await writeFile(scratch, JSON.stringify(payload), 'utf8')
      await rename(scratch, target)
    },
  }
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm test -- cache`
Expected: PASS, all three cache test files.

- [ ] **Step 13: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export {
  RESULT_SCHEMA_VERSION,
  deriveResultKey,
  hashContent,
  hashJson,
  hashRuleSelection,
  stableStringify,
  type ResultKeyInput,
} from './cache/keys.ts'
export { openStatIndex, type StatIndex } from './cache/stat-index.ts'
export { openResultStore, type ResultStore } from './cache/result-store.ts'
```

- [ ] **Step 14: Commit**

```bash
git add packages/core
git commit -m "feat(core): content-addressed result cache with negative caching

A clean file stores an empty array and get() returns [] rather than
null, so healthy files are not re-analysed on every run. Cache keys fold
engine version, ruleset hash, file hash and config hash together. The
stat index skips hashing when size and mtime are unchanged, which is
what makes a warm run cheap. Corrupt state degrades to a cold run."
```

---

## Task 11: Engine interface, normalization and the oxlint adapter

**Files:**
- Create: `packages/core/src/engine/types.ts`, `packages/core/src/engine/normalize.ts`
- Create: `packages/engine-oxlint/package.json`, `packages/engine-oxlint/tsconfig.json`, `packages/engine-oxlint/tsdown.config.ts`
- Create: `packages/engine-oxlint/src/index.ts`, `packages/engine-oxlint/src/config.ts`, `packages/engine-oxlint/src/parse.ts`
- Test: `packages/core/src/engine/normalize.test.ts`, `packages/engine-oxlint/src/parse.test.ts`, `packages/engine-oxlint/src/index.test.ts`
- Create: `packages/engine-oxlint/fixtures/oxlint-output.json` (recorded in Step 1)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Diagnostic`, `ByteRange`, `createLineIndex`, `fingerprint` (Task 2); `RuleEntry`, `RuleRef`, `EngineId`, `ruleRefKey`, `isOwned` (Task 4); `RuleLevel` (Task 5); `InventoryFile`, `LanguageId` (Tasks 4, 8); `hashRuleSelection` (Task 10).
- Produces:
  - `type RawDiagnostic = { engineRuleId: string; message: string; severity: RawSeverity; file: string; range: ByteRange; help?: string; docsUrl?: string }`
  - `type EngineRuleSelection = ReadonlyMap<string, RuleLevel>`
  - `type EngineCapabilities`, `type RunContext`, `type EngineConfigHandle`, `type FileBatch`, `interface Engine`
  - `normalizeDiagnostics(input: NormalizeInput): Diagnostic[]`
  - `createOxlintEngine(options?: { binaryPath?: string }): Engine`
  - `parseOxlintOutput(stdout: string, rootDir: string): RawDiagnostic[]`

**Design note on classification:** the registry's `concepts` array says which concepts a rule may *claim* during arbitration; `classify` attributes an individual finding to exactly one of them (Task 4). Normalization emits at most one diagnostic per raw finding, so a multi-concept rule cannot double-report.

- [ ] **Step 1: Record real oxlint output before writing any parser**

Do not write the parser against assumptions about oxlint's rule naming. Capture the truth first.

```bash
pnpm add -w -D oxlint
mkdir -p /tmp/sgate-probe && cd /tmp/sgate-probe
cat > probe.ts <<'EOF'
export function probe(unusedParam: number): unknown {
  import('node:fs')
  debugger
  var legacy = 1
  const dupe = { a: 1, a: 2 }
  const loose = dupe as any
  if (true) return loose
  return legacy
}
EOF
cd - && ./node_modules/.bin/oxlint --format json -D correctness -D suspicious -D pedantic /tmp/sgate-probe/probe.ts > packages/engine-oxlint/fixtures/oxlint-output.json; echo "exit=$?"
./node_modules/.bin/oxlint --rules --format json | head -c 2000
./node_modules/.bin/oxlint --version
```

Read the captured file and confirm, writing the answers into a scratch note you keep until Step 6:

1. The exact shape of each `diagnostics[]` entry — the documented shape is
   `{ message, code, severity, causes, url, help, filename, labels: [{ span: { offset, length, line, column } }], related }`.
2. The exact spelling of `code` for a core rule and for a plugin rule. The documented example is
   `eslint(no-debugger)`. Record what a `typescript` plugin rule looks like.
3. The exact rule ids `--rules --format json` reports, since **those** are what `.oxlintrc.json`
   accepts. If they differ from the `code` field's inner name, the parser needs to map between them.
4. Whether `severity` uses `warning` or `warn`.
5. Whether `filename` is absolute or relative to the invocation directory.

If any recorded id contradicts `packages/core/src/registry/entries.ts`, fix the registry entries now and re-run `pnpm test -- registry`. The registry must describe the engine that actually exists.

- [ ] **Step 2: Create the engine interface**

`packages/core/src/engine/types.ts`:

```ts
import type { ByteRange } from '../diagnostics/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { LanguageId } from '../languages.ts'
import type { RuleLevel } from '../config/types.ts'
import type { Capability, EngineId } from '../registry/types.ts'

export type RawSeverity = 'error' | 'warning' | 'advice' | 'info'

export type RawDiagnostic = {
  readonly engineRuleId: string
  readonly message: string
  readonly severity: RawSeverity
  /** Repo-relative, POSIX separators. Adapters normalise this before yielding. */
  readonly file: string
  readonly range: ByteRange
  readonly help?: string
  readonly docsUrl?: string
}

/** engineRuleId → level. Levels are already resolved; the engine only materialises them. */
export type EngineRuleSelection = ReadonlyMap<string, RuleLevel>

export type EngineCapabilities = {
  readonly languages: readonly LanguageId[]
  readonly granularity: 'file' | 'project'
  readonly provides: readonly Capability[]
  readonly fixes: boolean
}

export type RunContext = {
  readonly rootDir: string
  /** Where ephemeral engine configs are written. Cleaned up by the caller. */
  readonly tmpDir: string
}

export type EngineConfigHandle = {
  readonly path: string
  readonly rulesetHash: string
  dispose(): Promise<void>
}

export type FileBatch = { readonly files: readonly InventoryFile[] }

export interface Engine {
  readonly id: EngineId
  readonly capabilities: EngineCapabilities
  version(): Promise<string>
  materializeConfig(selection: EngineRuleSelection, context: RunContext): Promise<EngineConfigHandle>
  run(
    batch: FileBatch,
    handle: EngineConfigHandle,
    context: RunContext,
    signal: AbortSignal,
  ): AsyncIterable<RawDiagnostic>
}
```

Export the types from the package surface in the same step — `packages/engine-oxlint` imports them from
`@misaon/slop-gate-core` in Step 10, before the rest of this task's exports are added. Append to
`packages/core/src/index.ts`:

```ts
export type {
  Engine,
  EngineCapabilities,
  EngineConfigHandle,
  EngineRuleSelection,
  FileBatch,
  RawDiagnostic,
  RawSeverity,
  RunContext,
} from './engine/types.ts'
```

- [ ] **Step 3: Write the failing normalization tests**

`packages/core/src/engine/normalize.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { RuleEntry, RuleRef } from '../registry/types.ts'
import { normalizeDiagnostics } from './normalize.ts'
import type { RawDiagnostic } from './types.ts'

const unusedVars: RuleEntry = {
  engine: 'oxlint',
  engineRuleId: 'no-unused-vars',
  concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
  classify: [{ messagePattern: '\\bimport(ed)?\\b', concept: 'dead-code.unused-import' }],
  tier: 0,
  priority: 90,
  severityDefault: 'warn',
  fixKind: 'suggested',
  fixTouches: ['imports'],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test/no-unused-vars',
  since: '0.1.0',
}

const noDebugger: RuleEntry = {
  ...unusedVars,
  engineRuleId: 'no-debugger',
  concepts: ['correctness.no-debugger'],
  classify: undefined,
  severityDefault: 'error',
  docsUrl: 'https://example.test/no-debugger',
}

const entries = [unusedVars, noDebugger]

const owners = new Map<string, RuleRef>([
  ['dead-code.unused-variable', { engine: 'oxlint', engineRuleId: 'no-unused-vars' }],
  ['dead-code.unused-import', { engine: 'oxlint', engineRuleId: 'no-unused-vars' }],
  ['correctness.no-debugger', { engine: 'oxlint', engineRuleId: 'no-debugger' }],
])

const source = "import { unused } from 'y'\nconst spare = 1\ndebugger\n"

const raw = (over: Partial<RawDiagnostic> & Pick<RawDiagnostic, 'engineRuleId' | 'message'>): RawDiagnostic => ({
  severity: 'warning',
  file: 'src/a.ts',
  range: { start: 0, end: 26 },
  ...over,
})

const run = (raws: readonly RawDiagnostic[], levels: Record<string, string> = {}) =>
  normalizeDiagnostics({
    engine: 'oxlint',
    raws,
    entries,
    owners,
    sourceOf: () => source,
    levelOf: (concept) => levels[concept] as never,
  })

test('emits exactly one diagnostic per raw finding', () => {
  const result = run([raw({ engineRuleId: 'no-unused-vars', message: "'unused' is defined but never used" })])
  expect(result).toHaveLength(1)
})

test('classifies a finding by message when a rule covers several concepts', () => {
  const [imported] = run([raw({ engineRuleId: 'no-unused-vars', message: "'unused' imported but never used" })])
  const [variable] = run([raw({ engineRuleId: 'no-unused-vars', message: "'spare' is assigned but never used" })])

  expect(imported?.concept).toBe('dead-code.unused-import')
  expect(variable?.concept).toBe('dead-code.unused-variable')
})

test('falls back to the first concept when no classify pattern matches', () => {
  const [only] = run([raw({ engineRuleId: 'no-unused-vars', message: 'something unexpected' })])
  expect(only?.concept).toBe('dead-code.unused-variable')
})

test('drops a finding from a rule the registry does not describe', () => {
  expect(run([raw({ engineRuleId: 'not-in-registry', message: 'x' })])).toEqual([])
})

test('drops a finding whose concept is owned by a different rule', () => {
  const otherOwner = new Map<string, RuleRef>([
    ['correctness.no-debugger', { engine: 'eslint', engineRuleId: 'no-debugger' }],
  ])
  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger' })],
    entries,
    owners: otherOwner,
    sourceOf: () => source,
    levelOf: () => undefined,
  })
  expect(result).toEqual([])
})

test('takes severity from the resolved level over the registry default', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })], {
    'correctness.no-debugger': 'info',
  })
  expect(only?.severity).toBe('info')
})

test('uses the registry default severity when no level is resolved', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })])
  expect(only?.severity).toBe('error')
})

test('drops a finding whose resolved level is off', () => {
  expect(run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })], { 'correctness.no-debugger': 'off' })).toEqual([])
})

test('recomputes positions from byte offsets', () => {
  const [only] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 43, end: 51 } }),
  ])
  expect(only?.position).toEqual({ startLine: 3, startColumn: 1, endLine: 3, endColumn: 9 })
})

test('builds a canonical rule id from engine and engine rule id', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })])
  expect(only?.ruleId).toBe('oxlint/no-debugger')
})

test('prefers the engine docs url and falls back to the registry', () => {
  const [withUrl] = run([raw({ engineRuleId: 'no-debugger', message: 'x', docsUrl: 'https://engine.test/d' })])
  const [withoutUrl] = run([raw({ engineRuleId: 'no-debugger', message: 'x' })])

  expect(withUrl?.docsUrl).toBe('https://engine.test/d')
  expect(withoutUrl?.docsUrl).toBe('https://example.test/no-debugger')
})

test('gives repeated identical findings in one file distinct fingerprints', () => {
  const [first, second] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 43, end: 51 } }),
    raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 43, end: 51 } }),
  ])
  expect(first?.fingerprint).not.toBe(second?.fingerprint)
})

test('gives the same finding in two files distinct fingerprints', () => {
  const [a, b] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/a.ts' }),
    raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/b.ts' }),
  ])
  expect(a?.fingerprint).not.toBe(b?.fingerprint)
})

test('maps raw severities that have no resolved level', () => {
  const [advice] = run([raw({ engineRuleId: 'no-unused-vars', message: 'x', severity: 'advice' })])
  expect(advice?.severity).toBe('warn')
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test -- normalize`
Expected: FAIL, cannot resolve `./normalize.ts`.

- [ ] **Step 5: Implement normalization**

`packages/core/src/engine/normalize.ts`:

```ts
import type { RuleLevel } from '../config/types.ts'
import { fingerprint } from '../diagnostics/fingerprint.ts'
import { createLineIndex, type LineIndex } from '../diagnostics/position.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { isOwned } from '../registry/ownership.ts'
import { ruleRefKey, type EngineId, type RuleEntry, type RuleRef } from '../registry/types.ts'
import type { RawDiagnostic } from './types.ts'

export type NormalizeInput = {
  engine: EngineId
  raws: readonly RawDiagnostic[]
  entries: readonly RuleEntry[]
  owners: ReadonlyMap<string, RuleRef>
  sourceOf: (file: string) => string
  levelOf: (concept: string) => RuleLevel | undefined
}

const LEVEL_TO_SEVERITY: Readonly<Record<Exclude<RuleLevel, 'off'>, Severity>> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
}

export function normalizeDiagnostics(input: NormalizeInput): Diagnostic[] {
  const byRuleId = new Map(
    input.entries.filter((entry) => entry.engine === input.engine).map((entry) => [entry.engineRuleId, entry]),
  )

  const lineIndexes = new Map<string, LineIndex>()
  const sources = new Map<string, string>()
  const occurrences = new Map<string, number>()
  const diagnostics: Diagnostic[] = []

  for (const raw of input.raws) {
    const entry = byRuleId.get(raw.engineRuleId)
    if (entry === undefined) continue

    const concept = classify(entry, raw.message)
    if (!isOwned(input.owners, { concept, engine: input.engine, engineRuleId: raw.engineRuleId })) continue

    const level = input.levelOf(concept)
    if (level === 'off') continue
    const severity = level === undefined ? entry.severityDefault : LEVEL_TO_SEVERITY[level]

    let source = sources.get(raw.file)
    if (source === undefined) {
      source = input.sourceOf(raw.file)
      sources.set(raw.file, source)
      lineIndexes.set(raw.file, createLineIndex(source))
    }
    const lineIndex = lineIndexes.get(raw.file)!

    const start = lineIndex.positionAt(raw.range.start)
    const end = lineIndex.positionAt(raw.range.end)

    const occurrenceKey = `${concept}\0${raw.file}`
    const occurrenceIndex = occurrences.get(occurrenceKey) ?? 0
    occurrences.set(occurrenceKey, occurrenceIndex + 1)

    diagnostics.push({
      concept,
      ruleId: ruleRefKey({ engine: input.engine, engineRuleId: raw.engineRuleId }),
      engine: input.engine,
      severity,
      message: raw.message,
      file: raw.file,
      range: raw.range,
      position: {
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
      },
      ...(raw.help === undefined ? {} : { help: raw.help }),
      docsUrl: raw.docsUrl ?? entry.docsUrl,
      fingerprint: fingerprint({ concept, file: raw.file, source, range: raw.range, occurrenceIndex }),
    })
  }

  return diagnostics
}

function classify(entry: RuleEntry, message: string): string {
  if (entry.concepts.length === 1) return entry.concepts[0]!
  for (const rule of entry.classify ?? []) {
    if (new RegExp(rule.messagePattern).test(message)) return rule.concept
  }
  return entry.concepts[0]!
}
```

`occurrences` is keyed by concept and file, so the second identical finding in a file gets index 1 — which is exactly what makes two genuinely distinct occurrences distinguishable in a baseline while still surviving a reformat.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- normalize`
Expected: PASS, 14 tests.

- [ ] **Step 7: Create the oxlint package**

`packages/engine-oxlint/package.json`:

```json
{
  "name": "@misaon/slop-gate-engine-oxlint",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@misaon/slop-gate-core": "workspace:*",
    "oxlint": "^1.75.0"
  }
}
```

`tsconfig.json` and `tsdown.config.ts` are byte-identical to `packages/core`'s.

```bash
pnpm install
```

- [ ] **Step 8: Write the failing parser tests**

`packages/engine-oxlint/src/parse.test.ts`. Replace the inline `SAMPLE` with the output recorded in Step 1 if the shape differs — the recorded file is the source of truth.

```ts
import { expect, test } from 'vitest'
import { parseOxlintOutput } from './parse.ts'

const SAMPLE = JSON.stringify({
  diagnostics: [
    {
      message: '`debugger` statement is not allowed',
      code: 'eslint(no-debugger)',
      severity: 'error',
      causes: [],
      url: 'https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-debugger.html',
      help: 'Remove the debugger statement',
      filename: 'src/a.ts',
      labels: [{ span: { offset: 38, length: 9, line: 5, column: 1 } }],
      related: [],
    },
    {
      message: 'Unexpected any. Specify a different type.',
      code: 'typescript(no-explicit-any)',
      severity: 'warning',
      causes: [],
      filename: 'src/a.ts',
      labels: [{ span: { offset: 60, length: 3, line: 7, column: 20 } }],
      related: [],
    },
  ],
  number_of_files: 1,
  number_of_rules: 2,
  threads_count: 8,
  start_time: 0.01,
})

test('extracts one raw diagnostic per entry', () => {
  expect(parseOxlintOutput(SAMPLE, '/repo')).toHaveLength(2)
})

test('keeps a core rule id bare and qualifies a plugin rule id', () => {
  const [core, plugin] = parseOxlintOutput(SAMPLE, '/repo')
  expect(core?.engineRuleId).toBe('no-debugger')
  expect(plugin?.engineRuleId).toBe('typescript/no-explicit-any')
})

test('converts offset and length into a byte range', () => {
  const [core] = parseOxlintOutput(SAMPLE, '/repo')
  expect(core?.range).toEqual({ start: 38, end: 47 })
})

test('carries message, severity, help and url through', () => {
  const [core] = parseOxlintOutput(SAMPLE, '/repo')
  expect(core?.message).toBe('`debugger` statement is not allowed')
  expect(core?.severity).toBe('error')
  expect(core?.help).toBe('Remove the debugger statement')
  expect(core?.docsUrl).toContain('no-debugger.html')
})

test('normalises an absolute filename to a repo-relative POSIX path', () => {
  const absolute = JSON.stringify({
    diagnostics: [
      {
        message: 'x',
        code: 'eslint(no-var)',
        severity: 'warning',
        filename: '/repo/packages/app/src/a.ts',
        labels: [{ span: { offset: 0, length: 1, line: 1, column: 1 } }],
      },
    ],
  })
  expect(parseOxlintOutput(absolute, '/repo')[0]?.file).toBe('packages/app/src/a.ts')
})

test('skips a diagnostic with no labels rather than inventing a range', () => {
  const unlabelled = JSON.stringify({
    diagnostics: [{ message: 'x', code: 'eslint(no-var)', severity: 'warning', filename: 'a.ts', labels: [] }],
  })
  expect(parseOxlintOutput(unlabelled, '/repo')).toEqual([])
})

test('returns nothing for empty output', () => {
  expect(parseOxlintOutput('', '/repo')).toEqual([])
  expect(parseOxlintOutput('{"diagnostics":[]}', '/repo')).toEqual([])
})

test('throws on output that is not oxlint json', () => {
  expect(() => parseOxlintOutput('not json at all', '/repo')).toThrow(/oxlint/)
})
```

- [ ] **Step 9: Run the tests to verify they fail**

Run: `pnpm test -- engine-oxlint`
Expected: FAIL, cannot resolve `./parse.ts`.

- [ ] **Step 10: Implement the parser**

`packages/engine-oxlint/src/parse.ts`:

```ts
import { relative } from 'node:path'
import { EngineError, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

type OxlintSpan = { offset: number; length: number }
type OxlintDiagnostic = {
  message: string
  code: string
  severity: string
  url?: string
  help?: string
  filename: string
  labels?: Array<{ span: OxlintSpan }>
}

const CODE_PATTERN = /^([a-z0-9-]+)\(([^)]+)\)$/

/** oxlint's core rules are configured bare; plugin rules are configured as `plugin/rule`. */
export function toEngineRuleId(code: string): string | null {
  const match = CODE_PATTERN.exec(code)
  if (match === null) return null
  const [, plugin, rule] = match
  return plugin === 'eslint' ? rule! : `${plugin}/${rule}`
}

const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  error: 'error',
  warning: 'warning',
  warn: 'warning',
  advice: 'advice',
  info: 'info',
}

export function parseOxlintOutput(stdout: string, rootDir: string): RawDiagnostic[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []

  let parsed: { diagnostics?: OxlintDiagnostic[] }
  try {
    parsed = JSON.parse(trimmed) as { diagnostics?: OxlintDiagnostic[] }
  } catch (cause) {
    throw new EngineError('oxlint', `could not parse oxlint json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed.diagnostics)) {
    throw new EngineError('oxlint', 'oxlint json output has no diagnostics array')
  }

  const results: RawDiagnostic[] = []
  for (const diagnostic of parsed.diagnostics) {
    const span = diagnostic.labels?.[0]?.span
    const engineRuleId = toEngineRuleId(diagnostic.code)
    if (span === undefined || engineRuleId === null) continue

    results.push({
      engineRuleId,
      message: diagnostic.message,
      severity: SEVERITIES[diagnostic.severity] ?? 'warning',
      file: toRepoRelative(diagnostic.filename, rootDir),
      range: { start: span.offset, end: span.offset + span.length },
      ...(diagnostic.help === undefined ? {} : { help: diagnostic.help }),
      ...(diagnostic.url === undefined ? {} : { docsUrl: diagnostic.url }),
    })
  }
  return results
}

function toRepoRelative(filename: string, rootDir: string): string {
  const normalized = filename.replaceAll('\\', '/')
  const root = rootDir.replaceAll('\\', '/')
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relative(root, normalized).replaceAll('\\', '/')
}
```

- [ ] **Step 11: Implement config materialization**

`packages/engine-oxlint/src/config.ts`:

```ts
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compareStrings,
  hashJson,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type RunContext,
} from '@misaon/slop-gate-core'

const LEVEL_TO_OXLINT: Readonly<Record<string, string>> = {
  error: 'error',
  warn: 'warn',
  info: 'warn',
  off: 'off',
}

export async function materializeOxlintConfig(
  selection: EngineRuleSelection,
  context: RunContext,
): Promise<EngineConfigHandle> {
  const rules = Object.fromEntries(
    [...selection]
      .filter(([, level]) => level !== 'off')
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([ruleId, level]) => [ruleId, LEVEL_TO_OXLINT[level] ?? 'warn']),
  )

  // `categories: {}` disables oxlint's own defaults so slop-gate's ruleset is the only source
  // of enabled rules. Without it, oxlint's `correctness` category would report rules the
  // registry never elected, bypassing arbitration entirely.
  const config = { $schema: undefined, categories: {}, rules }
  const rulesetHash = hashJson(config)

  await mkdir(context.tmpDir, { recursive: true })
  const path = join(context.tmpDir, `oxlintrc.${rulesetHash.slice(0, 12)}.json`)
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8')

  return {
    path,
    rulesetHash,
    async dispose() {
      await rm(path, { force: true })
    },
  }
}
```

`info` maps to oxlint's `warn` because oxlint has no third level; the distinction is preserved in our own diagnostics because normalization takes severity from the resolved level, not from the engine (Task 11 Step 5).

- [ ] **Step 12: Write the failing engine tests**

`packages/engine-oxlint/src/index.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { InventoryFile, RawDiagnostic } from '@misaon/slop-gate-core'
import { createOxlintEngine } from './index.ts'

let dir: string
let context: { rootDir: string; tmpDir: string }

const file = (path: string): InventoryFile => ({
  path,
  language: 'ts',
  workspace: '',
  size: 0,
  mtimeMs: 0,
})

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-oxlint-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('reports its version', async () => {
  expect(await createOxlintEngine().version()).toMatch(/^\d+\.\d+\.\d+/)
})

test('declares file granularity and script languages', () => {
  const engine = createOxlintEngine()
  expect(engine.capabilities.granularity).toBe('file')
  expect(engine.capabilities.languages).toContain('ts')
  expect(engine.id).toBe('oxlint')
})

test('materialises a config containing only the selected rules', async () => {
  const handle = await createOxlintEngine().materializeConfig(
    new Map([
      ['no-debugger', 'error'],
      ['no-var', 'off'],
    ]),
    context,
  )
  const written = JSON.parse(await readFile(handle.path, 'utf8')) as { rules: Record<string, string>; categories: unknown }

  expect(written.rules).toEqual({ 'no-debugger': 'error' })
  expect(written.categories).toEqual({})
  await handle.dispose()
})

test('produces the same ruleset hash regardless of selection order', async () => {
  const engine = createOxlintEngine()
  const a = await engine.materializeConfig(new Map([['no-debugger', 'error'], ['no-var', 'warn']]), context)
  const b = await engine.materializeConfig(new Map([['no-var', 'warn'], ['no-debugger', 'error']]), context)

  expect(b.rulesetHash).toBe(a.rulesetHash)
  await a.dispose()
  await b.dispose()
})

test('finds a real violation in a real file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', 'error']]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('no-debugger')
  expect(found[0]?.file).toBe('src/a.ts')
  await handle.dispose()
})

test('yields nothing for a clean file', async () => {
  await writeFile(join(dir, 'src/clean.ts'), 'export const a = 1\n')
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', 'error']]), context)

  expect(await collect(engine.run({ files: [file('src/clean.ts')] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
  await handle.dispose()
})

test('yields nothing for an empty batch without spawning a process', async () => {
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', 'error']]), context)

  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(1000)))).toEqual([])
  await handle.dispose()
})

test('raises an EngineError when the binary is missing', async () => {
  const engine = createOxlintEngine({ binaryPath: join(dir, 'does-not-exist') })
  const handle = await engine.materializeConfig(new Map([['no-debugger', 'error']]), context)
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')

  await expect(
    collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/oxlint/)
  await handle.dispose()
})
```

- [ ] **Step 13: Implement the engine**

`packages/engine-oxlint/src/index.ts`:

```ts
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import {
  EngineError,
  SCRIPT_LANGUAGES,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeOxlintConfig } from './config.ts'
import { parseOxlintOutput } from './parse.ts'

export { parseOxlintOutput, toEngineRuleId } from './parse.ts'

const run = promisify(execFile)

/** oxlint exits 1 when it reports findings; only higher codes are real failures. */
const MAX_FINDINGS_EXIT_CODE = 1

function resolveBinary(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('oxlint/bin/oxlint')
  } catch {
    return 'oxlint'
  }
}

export function createOxlintEngine(options: { binaryPath?: string } = {}): Engine {
  const binary = options.binaryPath ?? resolveBinary()

  return {
    id: 'oxlint',

    capabilities: {
      languages: [...SCRIPT_LANGUAGES, 'vue', 'svelte', 'astro'],
      granularity: 'file',
      provides: [],
      fixes: true,
    },

    async version() {
      const { stdout } = await run(binary, ['--version'], { encoding: 'utf8' })
      return stdout.trim().replace(/^oxlint\s+/, '')
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeOxlintConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(binary, batch, handle, context, signal)
    },
  }
}

async function* execute(
  binary: string,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0) return

  const args = [
    '--config',
    handle.path,
    '--disable-nested-config',
    '--format',
    'json',
    '--silent',
    ...batch.files.map((file) => file.path),
  ]

  let stdout: string
  try {
    ;({ stdout } = await run(binary, args, {
      cwd: context.rootDir,
      signal,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
    }))
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string }
    if (typeof failure.code === 'number' && failure.code <= MAX_FINDINGS_EXIT_CODE) {
      stdout = failure.stdout ?? ''
    } else {
      throw new EngineError('oxlint', `oxlint failed: ${failure.stderr?.trim() || String(failure.code)}`, {
        cause: error,
      })
    }
  }

  yield* parseOxlintOutput(stdout, context.rootDir)
}
```

`--silent` suppresses oxlint's own rendering while `--format json` still writes the machine output, and `--disable-nested-config` stops oxlint from picking up `.oxlintrc.json` files left in the repository — slop-gate's materialised config must be the only one in effect, or arbitration is bypassed.

The `--format json` flag exists alongside a native `agent` format in oxlint 1.75. We deliberately consume `json`: our `agent` reporter (M4) renders every engine uniformly, and adopting one engine's agent format would make the others inconsistent.

- [ ] **Step 14: Run the tests to verify they pass**

Run: `pnpm test -- engine-oxlint`
Expected: PASS, 16 tests across both files.

If "finds a real violation" fails with zero findings, the likely cause is `categories: {}` also disabling the rule you selected. Re-read the recorded `--rules --format json` output from Step 1 and confirm the rule id spelling; do not work around it by re-enabling categories, which would let unelected rules through.

- [ ] **Step 15: Export normalization from the core surface**

The engine types were already exported in Step 2. Append the remaining export to
`packages/core/src/index.ts`:

```ts
export { normalizeDiagnostics, type NormalizeInput } from './engine/normalize.ts'
```

- [ ] **Step 16: Commit**

```bash
git add packages
git commit -m "feat(engine-oxlint): oxlint adapter behind the Engine interface

Rule ids and output shape were recorded from the real binary before the
parser was written. Materialised configs set categories to {} so only
rules the registry elected can run; nested .oxlintrc.json files are
ignored for the same reason. Normalization emits at most one diagnostic
per finding, attributing multi-concept rules via registry classify data."
```

---

## Task 12: Planner and check orchestration

**Files:**
- Create: `packages/core/src/planner/plan.ts`, `packages/core/src/run/check.ts`
- Test: `packages/core/src/planner/plan.test.ts`, `packages/core/src/run/check.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–11.
- Produces:
  - `type EngineAssignment = { engineId: EngineId; selection: EngineRuleSelection; files: readonly InventoryFile[] }`
  - `buildPlan(input: PlanInput): EngineAssignment[]`
  - `type CheckEvent = { type: 'diagnostic'; diagnostic: Diagnostic } | { type: 'engine-failed'; engine: string; message: string } | { type: 'done'; result: CheckResult }`
  - `streamCheck(options: CheckOptions): AsyncIterable<CheckEvent>`
  - `runCheck(options: CheckOptions): Promise<CheckResult>`

**Design notes:**
- `buildPlan` performs no IO, so the whole routing decision is unit-testable without a filesystem or a real engine.
- When one engine rule owns several concepts with different levels, the engine is configured at the **strongest** level and normalization re-derives the per-concept severity (Task 11). Configuring at the weakest level would silently lose findings for the stricter concept.
- Config-level findings — overlapping rules and dead overrides — are emitted as ordinary diagnostics against the config file, which is how §5.4's "runs as part of check" becomes real rather than aspirational.
- M0 runs engines concurrently and batches sequentially within an engine. oxlint parallelises internally, so a worker pool would add complexity for no gain here; the real scheduler arrives in M2.

- [ ] **Step 1: Write the failing planner tests**

`packages/core/src/planner/plan.test.ts`:

```ts
import { expect, test } from 'vitest'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { Engine } from '../engine/types.ts'
import { electOwners } from '../registry/elect.ts'
import type { RuleEntry } from '../registry/types.ts'
import { buildPlan } from './plan.ts'

const file = (path: string, language: InventoryFile['language']): InventoryFile => ({
  path,
  language,
  workspace: '',
  size: 1,
  mtimeMs: 1,
})

const fakeEngine = (id: Engine['id'], languages: InventoryFile['language'][]): Engine =>
  ({
    id,
    capabilities: { languages, granularity: 'file', provides: [], fixes: false },
    version: async () => '1.0.0',
    materializeConfig: async () => ({ path: '', rulesetHash: '', dispose: async () => {} }),
    run: () => (async function* () {})(),
  }) satisfies Engine

const entry = (over: Pick<RuleEntry, 'engine' | 'engineRuleId' | 'concepts'> & Partial<RuleEntry>): RuleEntry => ({
  tier: 0,
  priority: 100,
  severityDefault: 'warn',
  fixKind: 'none',
  fixTouches: [],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test',
  since: '0.1.0',
  ...over,
})

const planWith = (args: {
  entries: RuleEntry[]
  engines: Engine[]
  files: InventoryFile[]
  rules: Record<string, 'off' | 'info' | 'warn' | 'error'>
}) => {
  const resolver = createRuleSetResolver({ config: { rules: args.rules as never } })
  const election = electOwners({
    entries: args.entries,
    enabledConcepts: resolver.base.enabledConcepts,
    capabilities: new Set(),
    languages: new Set(args.files.map((f) => f.language)),
  })
  return buildPlan({
    engines: args.engines,
    election,
    resolver,
    entries: args.entries,
    inventory: {
      root: '/repo',
      files: args.files,
      languages: new Set(args.files.map((f) => f.language)),
      workspaces: [{ name: 'root', dir: '' }],
    },
  })
}

test('assigns a rule to its engine with the resolved level', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan).toHaveLength(1)
  expect(plan[0]?.engineId).toBe('oxlint')
  expect(plan[0]?.selection.get('no-debugger')).toBe('error')
  expect(plan[0]?.files.map((f) => f.path)).toEqual(['a.ts'])
})

test('skips an engine with no elected rules', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts']), fakeEngine('biome-css', ['css'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan.map((p) => p.engineId)).toEqual(['oxlint'])
})

test('gives an engine only files in languages it supports', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts'), file('b.css', 'css'), file('c.md', 'markdown')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan[0]?.files.map((f) => f.path)).toEqual(['a.ts'])
})

test('omits an engine that supports no file in the inventory', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'r', concepts: ['correctness.no-debugger'], languages: ['css'] })],
    engines: [fakeEngine('oxlint', ['css'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan).toEqual([])
})

test('configures a multi-concept rule at the strongest resolved level', () => {
  const plan = planWith({
    entries: [
      entry({
        engine: 'oxlint',
        engineRuleId: 'no-unused-vars',
        concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
        classify: [{ messagePattern: 'import', concept: 'dead-code.unused-import' }],
      }),
    ],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'dead-code.unused-variable': 'info', 'dead-code.unused-import': 'error' },
  })

  expect(plan[0]?.selection.get('no-unused-vars')).toBe('error')
})

test('is deterministic in engine order', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'a', concepts: ['correctness.no-debugger'] }),
    entry({ engine: 'astgrep', engineRuleId: 'b', concepts: ['style.no-var'] }),
  ]
  const engines = [fakeEngine('astgrep', ['ts']), fakeEngine('oxlint', ['ts'])]
  const rules = { 'correctness.no-debugger': 'error', 'style.no-var': 'warn' } as const

  const first = planWith({ entries, engines, files: [file('a.ts', 'ts')], rules })
  const second = planWith({ entries, engines: [...engines].reverse(), files: [file('a.ts', 'ts')], rules })

  expect(second.map((p) => p.engineId)).toEqual(first.map((p) => p.engineId))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- planner`
Expected: FAIL, cannot resolve `./plan.ts`.

- [ ] **Step 3: Implement the planner**

`packages/core/src/planner/plan.ts`:

```ts
import type { RuleLevel } from '../config/types.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import type { Engine, EngineRuleSelection } from '../engine/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ElectionResult } from '../registry/elect.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'

export type EngineAssignment = {
  readonly engineId: EngineId
  readonly selection: EngineRuleSelection
  readonly files: readonly InventoryFile[]
}

export type PlanInput = {
  engines: readonly Engine[]
  inventory: FileInventory
  election: ElectionResult
  resolver: RuleSetResolver
  entries: readonly RuleEntry[]
}

const LEVEL_STRENGTH: Readonly<Record<RuleLevel, number>> = { off: 0, info: 1, warn: 2, error: 3 }

export function buildPlan(input: PlanInput): EngineAssignment[] {
  const conceptsByRule = new Map<string, string[]>()
  for (const [concept, owner] of input.election.owners) {
    const key = `${owner.engine}/${owner.engineRuleId}`
    conceptsByRule.set(key, [...(conceptsByRule.get(key) ?? []), concept])
  }

  const assignments: EngineAssignment[] = []

  for (const engine of [...input.engines].sort((a, b) => compareStrings(a.id, b.id))) {
    const ruleIds = input.election.selection.get(engine.id)
    if (ruleIds === undefined || ruleIds.size === 0) continue

    const supported = new Set(engine.capabilities.languages)
    const files = input.inventory.files.filter((file) => supported.has(file.language))
    if (files.length === 0) continue

    const selection = new Map<string, RuleLevel>()
    for (const ruleId of [...ruleIds].sort()) {
      const concepts = conceptsByRule.get(`${engine.id}/${ruleId}`) ?? []
      const level = strongestLevel(concepts, input.resolver)
      if (level !== 'off') selection.set(ruleId, level)
    }
    if (selection.size === 0) continue

    assignments.push({ engineId: engine.id, selection, files })
  }

  return assignments
}

function strongestLevel(concepts: readonly string[], resolver: RuleSetResolver): RuleLevel {
  let strongest: RuleLevel = 'off'
  for (const concept of concepts) {
    const level = resolver.base.rules.get(concept as never)?.level ?? 'off'
    if (LEVEL_STRENGTH[level] > LEVEL_STRENGTH[strongest]) strongest = level
  }
  return strongest
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- planner`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing orchestration tests**

`packages/core/src/run/check.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createWalkFileSource } from '../discovery/inventory.ts'
import type { Engine, RawDiagnostic } from '../engine/types.ts'
import type { RuleEntry } from '../registry/types.ts'
import { runCheck, streamCheck } from './check.ts'

let dir: string

const ENTRIES: RuleEntry[] = [
  {
    engine: 'oxlint',
    engineRuleId: 'no-debugger',
    concepts: ['correctness.no-debugger'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts'],
    docsUrl: 'https://example.test/no-debugger',
    since: '0.1.0',
  },
]

const stubEngine = (options: {
  findings?: RawDiagnostic[]
  fail?: string
  onRun?: () => void
}): Engine =>
  ({
    id: 'oxlint',
    capabilities: { languages: ['ts'], granularity: 'file', provides: [], fixes: false },
    version: async () => '1.75.0',
    materializeConfig: async () => ({ path: 'stub', rulesetHash: 'stubhash', dispose: async () => {} }),
    run: (batch) =>
      (async function* () {
        options.onRun?.()
        if (options.fail !== undefined) throw new Error(options.fail)
        const paths = new Set(batch.files.map((f) => f.path))
        for (const finding of options.findings ?? []) {
          if (paths.has(finding.file)) yield finding
        }
      })(),
  }) satisfies Engine

const debuggerFinding = (file: string): RawDiagnostic => ({
  engineRuleId: 'no-debugger',
  message: '`debugger` statement is not allowed',
  severity: 'error',
  file,
  range: { start: 22, end: 30 },
})

const baseOptions = () => ({
  rootDir: dir,
  config: { rules: { 'correctness.no-debugger': 'error' } } as never,
  entries: ENTRIES,
  fileSource: createWalkFileSource(),
  cacheDir: join(dir, '.slop-gate', 'cache'),
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-check-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('returns a normalized diagnostic for an engine finding', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })] })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.concept).toBe('correctness.no-debugger')
  expect(result.diagnostics[0]?.severity).toBe('error')
  expect(result.diagnostics[0]?.position.startLine).toBe(2)
  expect(result.counts).toEqual({ error: 1, warn: 0, info: 0 })
})

test('reports zero findings on a clean repository', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({})] })

  expect(result.diagnostics).toEqual([])
  expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test('serves a second identical run from the cache without invoking the engine', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  const first = await runCheck({ ...baseOptions(), engines: [engine()] })
  const second = await runCheck({ ...baseOptions(), engines: [engine()] })

  expect(runs).toBe(1)
  expect(second.diagnostics).toEqual(first.diagnostics)
  expect(second.stats.filesFromCache).toBeGreaterThan(0)
})

test('caches a clean result so unchanged clean files are not re-analysed', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  let runs = 0
  const engine = () => stubEngine({ onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()] })
  await runCheck({ ...baseOptions(), engines: [engine()] })

  expect(runs).toBe(1)
})

test('re-runs the engine after a file changes', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()] })
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n  debugger\n}\n')
  await runCheck({ ...baseOptions(), engines: [engine()] })

  expect(runs).toBe(2)
})

test('bypasses the cache when asked', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()], useCache: false })
  await runCheck({ ...baseOptions(), engines: [engine()], useCache: false })

  expect(runs).toBe(2)
})

test('an engine failure is reported without aborting the run', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({ fail: 'boom' })] })

  expect(result.engineFailures).toEqual([{ engine: 'oxlint', message: 'boom' }])
  expect(result.diagnostics).toEqual([])
})

test('emits a diagnostic for a dead override', async () => {
  const result = await runCheck({
    ...baseOptions(),
    config: {
      rules: { 'correctness.no-debugger': 'error', 'oxlint/no-such-rule': 'error', 'config.dead-override': 'warn' },
    } as never,
    engines: [stubEngine({})],
  })

  const dead = result.diagnostics.filter((d) => d.concept === 'config.dead-override')
  expect(dead).toHaveLength(1)
  expect(dead[0]?.message).toContain('oxlint/no-such-rule')
})

test('emits a diagnostic naming both rules when two rules overlap', async () => {
  const withOverlap: RuleEntry[] = [
    ...ENTRIES,
    { ...ENTRIES[0]!, engine: 'eslint', engineRuleId: 'no-debugger', tier: 2 },
  ]
  const result = await runCheck({
    ...baseOptions(),
    config: { rules: { 'correctness.no-debugger': 'error', 'config.rule-overlap': 'info' } } as never,
    entries: withOverlap,
    engines: [stubEngine({})],
  })

  const overlap = result.diagnostics.filter((d) => d.concept === 'config.rule-overlap')
  expect(overlap).toHaveLength(1)
  expect(overlap[0]?.message).toContain('oxlint/no-debugger')
  expect(overlap[0]?.message).toContain('eslint/no-debugger')
})

test('sorts diagnostics by file then offset', async () => {
  await writeFile(join(dir, 'src/b.ts'), 'export function g() {\n  debugger\n}\n')
  const result = await runCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [debuggerFinding('src/b.ts'), debuggerFinding('src/a.ts')] })],
  })

  expect(result.diagnostics.map((d) => d.file)).toEqual(['src/a.ts', 'src/b.ts'])
})

test('streams diagnostics before the done event', async () => {
  const events: string[] = []
  for await (const event of streamCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })],
  })) {
    events.push(event.type)
  }

  expect(events).toEqual(['diagnostic', 'done'])
})

test('reports the ruleset summary', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({})] })
  expect(result.ruleset.enabledConcepts).toBeGreaterThan(0)
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test -- run/check`
Expected: FAIL, cannot resolve `./check.ts`.

- [ ] **Step 7: Implement orchestration**

`packages/core/src/run/check.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveResultKey, hashJson, type ResultKeyInput } from '../cache/keys.ts'
import { openResultStore } from '../cache/result-store.ts'
import { openStatIndex } from '../cache/stat-index.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { buildInventory, type FileSource } from '../discovery/inventory.ts'
import type { InventoryFile } from '../discovery/types.ts'
import { normalizeDiagnostics } from '../engine/normalize.ts'
import type { Engine, RawDiagnostic } from '../engine/types.ts'
import { compareStrings } from '../ordering.ts'
import { buildPlan } from '../planner/plan.ts'
import { electOwners } from '../registry/elect.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { ruleRefKey, type RuleEntry } from '../registry/types.ts'

export type CheckOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  cacheDir?: string
  useCache?: boolean
  batchSize?: number
  signal?: AbortSignal
}

export type CheckResult = {
  diagnostics: Diagnostic[]
  counts: Record<Severity, number>
  engineFailures: Array<{ engine: string; message: string }>
  stats: { filesScanned: number; filesFromCache: number; enginesRun: number; durationMs: number }
  ruleset: {
    enabledConcepts: number
    suppressed: number
    uncovered: readonly string[]
    unknownKeys: readonly string[]
  }
}

export type CheckEvent =
  | { type: 'diagnostic'; diagnostic: Diagnostic }
  | { type: 'engine-failed'; engine: string; message: string }
  | { type: 'done'; result: CheckResult }

const DEFAULT_BATCH_SIZE = 500

export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  for await (const event of streamCheck(options)) {
    if (event.type === 'done') return event.result
  }
  throw new Error('streamCheck completed without a done event')
}

export async function* streamCheck(options: CheckOptions): AsyncIterable<CheckEvent> {
  const startedAt = performance.now()
  const signal = options.signal ?? new AbortController().signal
  const entries = options.entries ?? RULE_ENTRIES
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  const useCache = options.useCache ?? true
  const configFile = options.configFile ?? 'slop-gate.config.ts'

  const resolver = createRuleSetResolver({ config: options.config, configFile })
  const inventory = await buildInventory({
    rootDir: options.rootDir,
    ...(options.config.ignore === undefined ? {} : { ignore: options.config.ignore }),
    ...(options.fileSource === undefined ? {} : { source: options.fileSource }),
    signal,
  })

  const election = electOwners({
    entries,
    enabledConcepts: resolver.base.enabledConcepts,
    capabilities: new Set(),
    languages: inventory.languages,
    pinnedOwners: resolver.base.pinnedOwners,
  })

  const configHash = hashJson({ config: options.config, entries: entries.map(ruleRefKey) })
  const statIndex = await openStatIndex(cacheDir)
  const resultStore = openResultStore(cacheDir)
  const engineById = new Map(options.engines.map((engine) => [engine.id, engine]))
  const sources = new Map<string, string>()

  const readSource = async (file: string): Promise<string> => {
    const cached = sources.get(file)
    if (cached !== undefined) return cached
    const content = await readFile(join(options.rootDir, file), 'utf8')
    sources.set(file, content)
    return content
  }

  const collected: Diagnostic[] = []
  const engineFailures: Array<{ engine: string; message: string }> = []
  let filesFromCache = 0
  let enginesRun = 0

  for (const diagnostic of configDiagnostics({ resolver, election, configFile })) {
    collected.push(diagnostic)
    yield { type: 'diagnostic', diagnostic }
  }

  const plan = buildPlan({ engines: options.engines, inventory, election, resolver, entries })

  for (const assignment of plan) {
    const engine = engineById.get(assignment.engineId)
    if (engine === undefined) continue

    try {
      const version = await engine.version()
      const handle = await engine.materializeConfig(assignment.selection, {
        rootDir: options.rootDir,
        tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
      })
      enginesRun += 1

      try {
        const pending: InventoryFile[] = []
        const keys = new Map<string, string>()
        const keyInputs = new Map<string, ResultKeyInput>()

        for (const file of assignment.files) {
          const components = {
            engineId: engine.id,
            engineVersion: version,
            engineRulesetHash: handle.rulesetHash,
            fileHash: await statIndex.hashOf(options.rootDir, file),
            configHash,
          }
          const key = deriveResultKey(components)
          keys.set(file.path, key)
          keyInputs.set(file.path, components)

          const hit = useCache ? await resultStore.get(key) : null
          if (hit === null) {
            pending.push(file)
            continue
          }
          filesFromCache += 1
          for (const diagnostic of hit) {
            collected.push(diagnostic)
            yield { type: 'diagnostic', diagnostic }
          }
        }

        const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
        for (let index = 0; index < pending.length; index += batchSize) {
          const batch = pending.slice(index, index + batchSize)
          const raws: RawDiagnostic[] = []
          for await (const raw of engine.run({ files: batch }, handle, {
            rootDir: options.rootDir,
            tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
          }, signal)) {
            raws.push(raw)
          }

          const byFile = new Map<string, RawDiagnostic[]>(batch.map((file) => [file.path, []]))
          for (const raw of raws) byFile.get(raw.file)?.push(raw)

          for (const [path, fileRaws] of byFile) {
            const source = await readSource(path)
            const normalized = normalizeDiagnostics({
              engine: engine.id,
              raws: fileRaws,
              entries,
              owners: election.owners,
              sourceOf: () => source,
              levelOf: (concept) => resolver.forFile(path).rules.get(concept as never)?.level,
            })

            if (useCache) await resultStore.set(keys.get(path)!, normalized, keyInputs.get(path)!)
            for (const diagnostic of normalized) {
              collected.push(diagnostic)
              yield { type: 'diagnostic', diagnostic }
            }
          }
        }
      } finally {
        await handle.dispose()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      engineFailures.push({ engine: assignment.engineId, message })
      yield { type: 'engine-failed', engine: assignment.engineId, message }
    }
  }

  await statIndex.persist()

  collected.sort(
    (a, b) =>
      compareStrings(a.file, b.file) || a.range.start - b.range.start || compareStrings(a.concept, b.concept),
  )

  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  for (const diagnostic of collected) counts[diagnostic.severity] += 1

  yield {
    type: 'done',
    result: {
      diagnostics: collected,
      counts,
      engineFailures,
      stats: {
        filesScanned: inventory.files.length,
        filesFromCache,
        enginesRun,
        durationMs: Math.round(performance.now() - startedAt),
      },
      ruleset: {
        enabledConcepts: resolver.base.enabledConcepts.size,
        suppressed: election.suppressed.length,
        uncovered: election.uncovered,
        unknownKeys: resolver.base.unknownKeys,
      },
    },
  }
}

type ConfigDiagnosticInput = {
  resolver: ReturnType<typeof createRuleSetResolver>
  election: ReturnType<typeof electOwners>
  configFile: string
}

function configDiagnostics(input: ConfigDiagnosticInput): Diagnostic[] {
  const emit = (concept: string, message: string): Diagnostic | null => {
    const level = input.resolver.base.rules.get(concept as never)?.level
    if (level === undefined || level === 'off') return null
    return {
      concept,
      ruleId: `slop-gate/${concept}`,
      engine: 'slop-gate',
      severity: level === 'error' ? 'error' : level === 'info' ? 'info' : 'warn',
      message,
      file: input.configFile,
      range: { start: 0, end: 0 },
      position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      docsUrl: `https://slop-gate.dev/concepts/${concept}`,
      fingerprint: hashJson({ concept, message }).slice(0, 32),
    }
  }

  const diagnostics: Diagnostic[] = []

  for (const key of input.resolver.base.unknownKeys) {
    const diagnostic = emit(
      'config.dead-override',
      `\`${key}\` does not name a known concept or a rule any engine provides.`,
    )
    if (diagnostic) diagnostics.push(diagnostic)
  }

  for (const record of input.election.suppressed) {
    const diagnostic = emit(
      'config.rule-overlap',
      `${ruleRefKey(record.winner)} and ${ruleRefKey(record.suppressed)} both detect ` +
        `\`${record.concept}\`; ${ruleRefKey(record.suppressed)} was suppressed (${record.reason}).`,
    )
    if (diagnostic) diagnostics.push(diagnostic)
  }

  return diagnostics
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test -- run/check`
Expected: PASS, 12 tests.

- [ ] **Step 9: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export { buildPlan, type EngineAssignment, type PlanInput } from './planner/plan.ts'
export { runCheck, streamCheck, type CheckEvent, type CheckOptions, type CheckResult } from './run/check.ts'
```

- [ ] **Step 10: Commit**

```bash
git add packages/core
git commit -m "feat(core): plan and orchestrate a check run

Planning does no IO, so routing is testable without a filesystem. A
multi-concept rule is configured at its strongest resolved level and
per-concept severity is re-derived during normalization, so no finding
is silently lost. Overlapping rules and dead overrides surface as
ordinary diagnostics, making config rot visible on every run. An engine
that throws is reported and the run continues."
```

---

## Task 13: Reporters

**Files:**
- Create: `packages/reporters/package.json`, `packages/reporters/tsconfig.json`, `packages/reporters/tsdown.config.ts`
- Create: `packages/reporters/src/index.ts`, `packages/reporters/src/code-frame.ts`, `packages/reporters/src/pretty.ts`, `packages/reporters/src/json.ts`
- Test: `packages/reporters/src/code-frame.test.ts`, `packages/reporters/src/pretty.test.ts`, `packages/reporters/src/json.test.ts`

**Interfaces:**
- Consumes: `CheckEvent`, `CheckResult`, `Diagnostic` (Tasks 2, 12).
- Produces:
  - `type ReporterContext = { write(chunk: string): void; color: boolean; readSource(file: string): string | null }`
  - `type Reporter = { onEvent(event: CheckEvent): void }`
  - `type ReporterName = 'pretty' | 'json'`
  - `createReporter(name: ReporterName, context: ReporterContext): Reporter`
  - `renderCodeFrame(source: string, position: Position, options?: { color?: boolean }): string`

**Design note:** `pretty` prints each diagnostic as it arrives and emits a file header whenever the file changes, which is genuine streaming rather than buffered grouping (§8.2). With one engine the output reads as grouped by file; once several engines interleave in M2 the same file may appear more than once, which is the honest trade for first output under 200 ms.

- [ ] **Step 1: Create the package**

`packages/reporters/package.json`:

```json
{
  "name": "@misaon/slop-gate-reporters",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": { "@misaon/slop-gate-core": "workspace:*" }
}
```

`tsconfig.json` and `tsdown.config.ts` are copies of `packages/core`'s. Then `pnpm install`.

- [ ] **Step 2: Write the failing code-frame tests**

`packages/reporters/src/code-frame.test.ts`:

```ts
import { expect, test } from 'vitest'
import { renderCodeFrame } from './code-frame.ts'

const source = 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 5\n'

test('shows the offending line with a caret underline', () => {
  const frame = renderCodeFrame(source, { startLine: 3, startColumn: 7, endLine: 3, endColumn: 8 })
  expect(frame).toContain('3 | const c = 3')
  expect(frame).toMatch(/\^/)
})

test('includes one line of context on each side', () => {
  const frame = renderCodeFrame(source, { startLine: 3, startColumn: 1, endLine: 3, endColumn: 2 })
  expect(frame).toContain('2 | const b = 2')
  expect(frame).toContain('4 | const d = 4')
  expect(frame).not.toContain('1 | const a = 1')
})

test('handles a finding on the first line', () => {
  const frame = renderCodeFrame(source, { startLine: 1, startColumn: 1, endLine: 1, endColumn: 6 })
  expect(frame).toContain('1 | const a = 1')
  expect(frame).not.toContain('0 |')
})

test('underlines the full span on a single line', () => {
  const frame = renderCodeFrame(source, { startLine: 1, startColumn: 7, endLine: 1, endColumn: 8 })
  const underline = frame.split('\n').find((line) => line.includes('^'))
  expect(underline?.indexOf('^')).toBe(frame.split('\n')[0]!.indexOf('const'))
})

test('underlines only to end of line for a multi-line span', () => {
  const multi = 'const a = {\n  b: 1,\n}\n'
  const frame = renderCodeFrame(multi, { startLine: 1, startColumn: 11, endLine: 3, endColumn: 2 })
  expect(frame.split('\n').filter((line) => line.includes('^'))).toHaveLength(1)
})

test('emits no escape codes when colour is off', () => {
  const frame = renderCodeFrame(source, { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 }, { color: false })
  expect(frame).not.toContain('\u001B[')
})
```

- [ ] **Step 3: Implement the code frame**

`packages/reporters/src/code-frame.ts`:

```ts
import { styleText } from 'node:util'
import type { Position } from '@misaon/slop-gate-core'

const CONTEXT_LINES = 1

export function renderCodeFrame(
  source: string,
  position: Position,
  options: { color?: boolean } = {},
): string {
  const color = options.color ?? false
  const paint = (style: Parameters<typeof styleText>[0], text: string): string =>
    color ? styleText(style, text) : text

  const lines = source.split('\n')
  const first = Math.max(1, position.startLine - CONTEXT_LINES)
  const last = Math.min(lines.length, position.startLine + CONTEXT_LINES)
  const gutterWidth = String(last).length

  const out: string[] = []
  for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
    const text = (lines[lineNumber - 1] ?? '').replace(/\r$/, '')
    const gutter = String(lineNumber).padStart(gutterWidth, ' ')
    out.push(`${paint('dim', `${gutter} |`)} ${text}`)

    if (lineNumber !== position.startLine) continue

    const endColumn = position.endLine === position.startLine ? position.endColumn : text.length + 1
    const width = Math.max(1, endColumn - position.startColumn)
    const pad = ' '.repeat(gutterWidth) + paint('dim', ' |') + ' ' + ' '.repeat(position.startColumn - 1)
    out.push(`${pad}${paint('red', '^'.repeat(width))}`)
  }

  return out.join('\n')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- code-frame`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing reporter tests**

`packages/reporters/src/pretty.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { CheckEvent, CheckResult, Diagnostic } from '@misaon/slop-gate-core'
import { createReporter } from './index.ts'

const diagnostic = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  concept: 'correctness.no-debugger',
  ruleId: 'oxlint/no-debugger',
  engine: 'oxlint',
  severity: 'error',
  message: '`debugger` statement is not allowed',
  file: 'src/a.ts',
  range: { start: 22, end: 30 },
  position: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 },
  docsUrl: 'https://example.test/no-debugger',
  fingerprint: 'abc',
  ...over,
})

const result = (over: Partial<CheckResult> = {}): CheckResult => ({
  diagnostics: [],
  counts: { error: 1, warn: 0, info: 0 },
  engineFailures: [],
  stats: { filesScanned: 3, filesFromCache: 2, enginesRun: 1, durationMs: 42 },
  ruleset: { enabledConcepts: 5, suppressed: 1, uncovered: [], unknownKeys: [] },
  ...over,
})

const capture = (events: CheckEvent[]): string => {
  let output = ''
  const reporter = createReporter('pretty', {
    write: (chunk) => (output += chunk),
    color: false,
    readSource: () => 'export function f() {\n  debugger\n}\n',
  })
  for (const event of events) reporter.onEvent(event)
  return output
}

test('prints the file, position, severity, message and concept', () => {
  const output = capture([{ type: 'diagnostic', diagnostic: diagnostic() }, { type: 'done', result: result() }])

  expect(output).toContain('src/a.ts')
  expect(output).toContain('2:3')
  expect(output).toContain('error')
  expect(output).toContain('`debugger` statement is not allowed')
  expect(output).toContain('correctness.no-debugger')
})

test('prints a file header once for consecutive diagnostics in the same file', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic() },
    { type: 'diagnostic', diagnostic: diagnostic({ range: { start: 31, end: 39 }, fingerprint: 'def' }) },
    { type: 'done', result: result({ counts: { error: 2, warn: 0, info: 0 } }) },
  ])

  expect(output.match(/src\/a\.ts/g)).toHaveLength(1)
})

test('prints a new header when the file changes', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic() },
    { type: 'diagnostic', diagnostic: diagnostic({ file: 'src/b.ts' }) },
    { type: 'done', result: result() },
  ])

  expect(output).toContain('src/a.ts')
  expect(output).toContain('src/b.ts')
})

test('summarises counts, cache use and duration', () => {
  const output = capture([{ type: 'done', result: result() }])

  expect(output).toContain('1 error')
  expect(output).toContain('3 files')
  expect(output).toContain('2 cached')
  expect(output).toContain('42')
})

test('says so plainly when nothing was found', () => {
  const output = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }])
  expect(output).toMatch(/no issues/i)
})

test('reports an engine failure prominently', () => {
  const output = capture([
    { type: 'engine-failed', engine: 'oxlint', message: 'binary not found' },
    { type: 'done', result: result({ engineFailures: [{ engine: 'oxlint', message: 'binary not found' }] }) },
  ])

  expect(output).toContain('oxlint')
  expect(output).toContain('binary not found')
})

test('mentions suppressed overlaps in the summary', () => {
  const output = capture([{ type: 'done', result: result() }])
  expect(output).toMatch(/1 rule overlap/i)
})

test('emits no escape codes when colour is off', () => {
  const output = capture([{ type: 'diagnostic', diagnostic: diagnostic() }, { type: 'done', result: result() }])
  expect(output).not.toContain('\u001B[')
})
```

`packages/reporters/src/json.test.ts`:

```ts
import { expect, test } from 'vitest'
import type { CheckResult } from '@misaon/slop-gate-core'
import { createReporter } from './index.ts'

const result: CheckResult = {
  diagnostics: [],
  counts: { error: 0, warn: 0, info: 0 },
  engineFailures: [],
  stats: { filesScanned: 1, filesFromCache: 0, enginesRun: 1, durationMs: 1 },
  ruleset: { enabledConcepts: 2, suppressed: 0, uncovered: [], unknownKeys: [] },
}

test('emits a single versioned json document on done', () => {
  let output = ''
  const reporter = createReporter('json', { write: (chunk) => (output += chunk), color: false, readSource: () => null })
  reporter.onEvent({ type: 'done', result })

  const parsed = JSON.parse(output) as { version: number; counts: unknown; diagnostics: unknown[] }
  expect(parsed.version).toBe(1)
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test('writes nothing before done so the document stays valid json', () => {
  let output = ''
  const reporter = createReporter('json', { write: (chunk) => (output += chunk), color: false, readSource: () => null })
  reporter.onEvent({ type: 'engine-failed', engine: 'oxlint', message: 'x' })

  expect(output).toBe('')
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test -- reporters`
Expected: FAIL, cannot resolve `./index.ts`.

- [ ] **Step 7: Implement the reporters**

`packages/reporters/src/pretty.ts`:

```ts
import { styleText } from 'node:util'
import type { CheckEvent, CheckResult, Diagnostic, Severity } from '@misaon/slop-gate-core'
import { renderCodeFrame } from './code-frame.ts'
import type { Reporter, ReporterContext } from './index.ts'

const SEVERITY_STYLE: Readonly<Record<Severity, Parameters<typeof styleText>[0]>> = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
}

export function createPrettyReporter(context: ReporterContext): Reporter {
  const paint = (style: Parameters<typeof styleText>[0], text: string): string =>
    context.color ? styleText(style, text) : text

  let currentFile: string | null = null

  const writeDiagnostic = (diagnostic: Diagnostic): void => {
    if (diagnostic.file !== currentFile) {
      currentFile = diagnostic.file
      context.write(`\n${paint(['underline', 'bold'], diagnostic.file)}\n`)
    }

    const location = `${diagnostic.position.startLine}:${diagnostic.position.startColumn}`
    context.write(
      `  ${paint('dim', location.padEnd(8))}` +
        `${paint(SEVERITY_STYLE[diagnostic.severity], diagnostic.severity.padEnd(5))}  ` +
        `${diagnostic.message}  ${paint('dim', diagnostic.concept)}\n`,
    )

    const source = context.readSource(diagnostic.file)
    if (source !== null) {
      const frame = renderCodeFrame(source, diagnostic.position, { color: context.color })
      context.write(`${frame.split('\n').map((line) => `    ${line}`).join('\n')}\n`)
    }

    if (diagnostic.help !== undefined) context.write(`    ${paint('dim', `help: ${diagnostic.help}`)}\n`)
  }

  const writeSummary = (result: CheckResult): void => {
    for (const failure of result.engineFailures) {
      context.write(`\n${paint(['bgRed', 'white'], ' ENGINE FAILED ')} ${failure.engine}: ${failure.message}\n`)
    }

    const parts = (['error', 'warn', 'info'] as const)
      .filter((severity) => result.counts[severity] > 0)
      .map((severity) => paint(SEVERITY_STYLE[severity], `${result.counts[severity]} ${severity}${result.counts[severity] === 1 ? '' : 's'}`))

    context.write('\n')
    context.write(
      parts.length === 0
        ? `${paint('green', 'No issues found.')} `
        : `${parts.join(', ')}. `,
    )
    context.write(
      paint(
        'dim',
        `${result.stats.filesScanned} files, ${result.stats.filesFromCache} cached, ${result.stats.durationMs}ms`,
      ),
    )
    context.write('\n')

    if (result.ruleset.suppressed > 0) {
      const count = result.ruleset.suppressed
      context.write(
        paint('dim', `${count} rule overlap${count === 1 ? '' : 's'} resolved — run \`sgate rules conflicts\` for detail.\n`),
      )
    }
    if (result.ruleset.uncovered.length > 0) {
      context.write(
        paint('yellow', `${result.ruleset.uncovered.length} enabled concepts have no capable engine in this repo.\n`),
      )
    }
  }

  return {
    onEvent(event: CheckEvent) {
      if (event.type === 'diagnostic') writeDiagnostic(event.diagnostic)
      else if (event.type === 'done') writeSummary(event.result)
    },
  }
}
```

`packages/reporters/src/json.ts`:

```ts
import type { CheckEvent } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'

export const JSON_REPORT_VERSION = 1

export function createJsonReporter(context: ReporterContext): Reporter {
  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return
      context.write(
        `${JSON.stringify(
          {
            version: JSON_REPORT_VERSION,
            counts: event.result.counts,
            stats: event.result.stats,
            ruleset: event.result.ruleset,
            engineFailures: event.result.engineFailures,
            diagnostics: event.result.diagnostics,
          },
          null,
          2,
        )}\n`,
      )
    },
  }
}
```

`packages/reporters/src/index.ts`:

```ts
import type { CheckEvent } from '@misaon/slop-gate-core'
import { createJsonReporter } from './json.ts'
import { createPrettyReporter } from './pretty.ts'

export type ReporterContext = {
  write(chunk: string): void
  color: boolean
  /** Returns the file's content for code frames, or null when it cannot be read. */
  readSource(file: string): string | null
}

export type Reporter = { onEvent(event: CheckEvent): void }

export const REPORTER_NAMES = ['pretty', 'json'] as const

export type ReporterName = (typeof REPORTER_NAMES)[number]

export function createReporter(name: ReporterName, context: ReporterContext): Reporter {
  return name === 'json' ? createJsonReporter(context) : createPrettyReporter(context)
}

export { renderCodeFrame } from './code-frame.ts'
export { JSON_REPORT_VERSION } from './json.ts'
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test -- reporters`
Expected: PASS, 16 tests across the three files.

- [ ] **Step 9: Commit**

```bash
git add packages/reporters
git commit -m "feat(reporters): streaming pretty output and versioned json

Pretty prints each diagnostic on arrival with a header when the file
changes, so first output does not wait for the run to finish. Colour goes
through util.styleText, so there is no colour dependency. The json
reporter emits one versioned document, which is the integration contract."
```

---

## Task 14: CLI with `sgate check`

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/tsdown.config.ts`, `packages/cli/bin/sgate.js`
- Create: `packages/cli/src/main.ts`, `packages/cli/src/exit-codes.ts`, `packages/cli/src/commands/check.ts`
- Test: `packages/cli/src/exit-codes.test.ts`

**Interfaces:**
- Consumes: `streamCheck`, `loadConfig`, `ConfigError`, `PRESETS` (Tasks 6, 12); `createReporter` (Task 13); `createOxlintEngine` (Task 11).
- Produces:
  - `const EXIT_CODES = { clean: 0, findings: 1, config: 2, engine: 3, frozenRules: 4 }`
  - `resolveExitCode(input: { counts; engineFailures; maxWarnings? }): number`
  - the `sgate` binary

**Dependency justification:** `citty` is zero-dependency, ESM-only and builds on `node:util.parseArgs`, with typed args, subcommands and lazy subcommand loading. Lazy loading keeps `sgate --help` from importing the engine layer.

- [ ] **Step 1: Create the package**

`packages/cli/package.json`:

```json
{
  "name": "@misaon/slop-gate",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "bin": { "sgate": "./bin/sgate.js", "slop-gate": "./bin/sgate.js" },
  "exports": { ".": { "types": "./dist/main.d.ts", "import": "./dist/main.js" } },
  "files": ["dist", "bin"],
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@misaon/slop-gate-core": "workspace:*",
    "@misaon/slop-gate-engine-oxlint": "workspace:*",
    "@misaon/slop-gate-reporters": "workspace:*",
    "citty": "^0.2.0"
  }
}
```

`packages/cli/bin/sgate.js`:

```js
#!/usr/bin/env node
import '../dist/main.js'
```

`tsconfig.json` and `tsdown.config.ts` mirror `packages/core`'s, with `entry: ['src/main.ts']`. Then:

```bash
pnpm install
chmod +x packages/cli/bin/sgate.js
```

- [ ] **Step 2: Write the failing exit-code tests**

`packages/cli/src/exit-codes.test.ts`:

```ts
import { expect, test } from 'vitest'
import { EXIT_CODES, resolveExitCode } from './exit-codes.ts'

const clean = { counts: { error: 0, warn: 0, info: 0 }, engineFailures: [] }

test('zero when nothing was found', () => {
  expect(resolveExitCode(clean)).toBe(EXIT_CODES.clean)
})

test('one when an error was found', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 1, warn: 0, info: 0 } })).toBe(EXIT_CODES.findings)
})

test('zero for warnings when no threshold is set', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 5, info: 0 } })).toBe(EXIT_CODES.clean)
})

test('one when warnings exceed the threshold', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 3, info: 0 }, maxWarnings: 2 })).toBe(EXIT_CODES.findings)
})

test('zero when warnings equal the threshold', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 2, info: 0 }, maxWarnings: 2 })).toBe(EXIT_CODES.clean)
})

test('info findings never fail the run', () => {
  expect(resolveExitCode({ ...clean, counts: { error: 0, warn: 0, info: 9 }, maxWarnings: 0 })).toBe(EXIT_CODES.clean)
})

test('an engine failure outranks findings', () => {
  expect(
    resolveExitCode({ counts: { error: 4, warn: 0, info: 0 }, engineFailures: [{ engine: 'oxlint', message: 'x' }] }),
  ).toBe(EXIT_CODES.engine)
})
```

- [ ] **Step 3: Implement exit codes**

`packages/cli/src/exit-codes.ts`:

```ts
import type { Severity } from '@misaon/slop-gate-core'

export const EXIT_CODES = {
  clean: 0,
  findings: 1,
  config: 2,
  engine: 3,
  frozenRules: 4,
} as const

export type ExitCodeInput = {
  counts: Record<Severity, number>
  engineFailures: readonly unknown[]
  maxWarnings?: number
}

export function resolveExitCode(input: ExitCodeInput): number {
  if (input.engineFailures.length > 0) return EXIT_CODES.engine
  if (input.counts.error > 0) return EXIT_CODES.findings
  if (input.maxWarnings !== undefined && input.counts.warn > input.maxWarnings) return EXIT_CODES.findings
  return EXIT_CODES.clean
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- exit-codes`
Expected: PASS, 7 tests.

- [ ] **Step 5: Implement the check command**

`packages/cli/src/commands/check.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { ConfigError, loadConfig, streamCheck, type CheckResult, type SlopGateConfig } from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { REPORTER_NAMES, createReporter, type ReporterName } from '@misaon/slop-gate-reporters'
import { EXIT_CODES, resolveExitCode } from '../exit-codes.ts'

const DEFAULT_CONFIG: SlopGateConfig = { extends: ['recommended'] }

export const check = defineCommand({
  meta: { name: 'check', description: 'Analyse the repository and report findings' },
  args: {
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    'max-warnings': { type: 'string', description: 'Fail when warnings exceed this count' },
    'no-cache': { type: 'boolean', default: false, description: 'Ignore cached results' },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()

    if (!REPORTER_NAMES.includes(args.format as ReporterName)) {
      process.stderr.write(`unknown format: ${args.format}. Expected one of ${REPORTER_NAMES.join(', ')}.\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const loaded = await loadConfig(rootDir).catch((error: unknown) => {
      if (error instanceof ConfigError) {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = EXIT_CODES.config
        return undefined
      }
      throw error
    })
    if (process.exitCode === EXIT_CODES.config) return

    const controller = new AbortController()
    const onInterrupt = (): void => controller.abort()
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onInterrupt)

    const reporter = createReporter(args.format as ReporterName, {
      write: (chunk) => process.stdout.write(chunk),
      color: supportsColor(),
      readSource: (file) => {
        try {
          return readFileSync(join(rootDir, file), 'utf8')
        } catch {
          return null
        }
      },
    })

    let result: CheckResult | undefined
    try {
      for await (const event of streamCheck({
        rootDir,
        config: loaded?.config ?? DEFAULT_CONFIG,
        ...(loaded === null || loaded === undefined ? {} : { configFile: loaded.file }),
        engines: [createOxlintEngine()],
        useCache: !args['no-cache'],
        signal: controller.signal,
      })) {
        reporter.onEvent(event)
        if (event.type === 'done') result = event.result
      }
    } finally {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onInterrupt)
    }

    const maxWarnings = args['max-warnings'] === undefined ? undefined : Number(args['max-warnings'])
    process.exitCode = resolveExitCode({
      counts: result?.counts ?? { error: 0, warn: 0, info: 0 },
      engineFailures: result?.engineFailures ?? [],
      ...(maxWarnings === undefined || Number.isNaN(maxWarnings) ? {} : { maxWarnings }),
    })
  },
})

function supportsColor(): boolean {
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') return false
  if (process.env['FORCE_COLOR'] !== undefined && process.env['FORCE_COLOR'] !== '') return true
  return process.stdout.isTTY === true
}
```

- [ ] **Step 6: Implement the root command**

`packages/cli/src/main.ts`:

```ts
import { defineCommand, runMain } from 'citty'
import { EXIT_CODES } from './exit-codes.ts'

const main = defineCommand({
  meta: {
    name: 'sgate',
    description: 'slop-gate — one quality gate over many analysis engines',
  },
  subCommands: {
    check: () => import('./commands/check.ts').then((module) => module.check),
    init: () => import('./commands/init.ts').then((module) => module.init),
  },
})

await runMain(main).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = EXIT_CODES.config
})
```

Subcommands are lazily imported so `sgate --help` never loads the engine layer.

- [ ] **Step 7: Verify the CLI runs against this very repository**

```bash
pnpm build
node packages/cli/bin/sgate.js --help
node packages/cli/bin/sgate.js check --format json | head -40
echo "exit=$?"
```

Expected: `--help` lists `check` and `init`. `check` produces a JSON document with `version: 1`. Exit code is 0 or 1 — never 2 or 3. A `2` means config loading broke; a `3` means the oxlint adapter cannot run and Task 11 needs revisiting.

- [ ] **Step 8: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): sgate check with distinct exit codes

Exit codes separate 'found issues' from 'config broken' and 'engine
failed', which both CI and agents need in order to react correctly.
Subcommands load lazily so --help does not pull in the engine layer.
SIGINT aborts the run through the same AbortSignal the core threads."
```

---

## Task 15: `sgate init`

**Files:**
- Create: `packages/cli/src/commands/init.ts`, `packages/cli/src/agents-md.ts`
- Test: `packages/cli/src/agents-md.test.ts`, `packages/cli/src/commands/init.test.ts`

**Interfaces:**
- Consumes: `findConfigFile` (Task 6); `buildWorkspaceGraph` (Task 8).
- Produces:
  - `upsertAgentsSection(existing: string, body: string): string`
  - `runInit(options: { rootDir: string; force?: boolean }): Promise<{ created: string[]; skipped: string[] }>`
  - the `init` subcommand

**Scope note:** this is the minimal `init` of M0 — it writes a working config and the agent-facing documentation. Repository profiling and migration from existing ESLint, Prettier, Biome and Stylelint configs are M5 (§15.1); this task deliberately does not attempt them.

- [ ] **Step 1: Write the failing AGENTS.md tests**

`packages/cli/src/agents-md.test.ts`:

```ts
import { expect, test } from 'vitest'
import { upsertAgentsSection } from './agents-md.ts'

const BODY = 'Run `sgate check` before committing.'

test('appends a fenced section to an empty file', () => {
  const output = upsertAgentsSection('', BODY)
  expect(output).toContain('<!-- slop-gate:start -->')
  expect(output).toContain('<!-- slop-gate:end -->')
  expect(output).toContain(BODY)
})

test('preserves existing content when appending', () => {
  const output = upsertAgentsSection('# My project\n\nSome notes.\n', BODY)
  expect(output).toContain('# My project')
  expect(output).toContain('Some notes.')
  expect(output).toContain(BODY)
})

test('replaces an existing section instead of duplicating it', () => {
  const first = upsertAgentsSection('# P\n', 'old body')
  const second = upsertAgentsSection(first, 'new body')

  expect(second.match(/slop-gate:start/g)).toHaveLength(1)
  expect(second).toContain('new body')
  expect(second).not.toContain('old body')
})

test('is idempotent', () => {
  const once = upsertAgentsSection('# P\n', BODY)
  expect(upsertAgentsSection(once, BODY)).toBe(once)
})

test('keeps content that follows the section', () => {
  const withSection = upsertAgentsSection('# P\n', 'old')
  const withTrailer = `${withSection}\n## Later\n\nTrailing.\n`
  const updated = upsertAgentsSection(withTrailer, 'new')

  expect(updated).toContain('## Later')
  expect(updated).toContain('Trailing.')
  expect(updated).toContain('new')
})
```

- [ ] **Step 2: Implement the AGENTS.md helper**

`packages/cli/src/agents-md.ts`:

```ts
const START = '<!-- slop-gate:start -->'
const END = '<!-- slop-gate:end -->'

export function upsertAgentsSection(existing: string, body: string): string {
  const section = `${START}\n${body.trim()}\n${END}`
  const startAt = existing.indexOf(START)
  const endAt = existing.indexOf(END)

  if (startAt !== -1 && endAt > startAt) {
    return `${existing.slice(0, startAt)}${section}${existing.slice(endAt + END.length)}`
  }

  const separator = existing === '' ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${separator}${section}\n`
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm test -- agents-md`
Expected: PASS, 5 tests.

- [ ] **Step 4: Write the failing init tests**

`packages/cli/src/commands/init.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { runInit } from './init.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-init-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('writes a config, a gitignore entry and an AGENTS.md section', async () => {
  const result = await runInit({ rootDir: dir })

  expect(result.created).toContain('slop-gate.config.ts')
  expect(result.created).toContain('AGENTS.md')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('defineConfig')
  expect(await readFile(join(dir, '.slop-gate', '.gitignore'), 'utf8')).toContain('*')
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toContain('sgate check')
})

test('the generated config is loadable and yields the recommended preset', async () => {
  await runInit({ rootDir: dir })
  const { loadConfig } = await import('@misaon/slop-gate-core')

  expect((await loadConfig(dir))?.config.extends).toEqual(['recommended'])
})

test('does not overwrite an existing config', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), '// mine\nexport default {}\n')
  const result = await runInit({ rootDir: dir })

  expect(result.skipped).toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).toContain('// mine')
})

test('overwrites an existing config when forced', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), '// mine\nexport default {}\n')
  await runInit({ rootDir: dir, force: true })

  expect(await readFile(join(dir, 'slop-gate.config.ts'), 'utf8')).not.toContain('// mine')
})

test('merges into an existing AGENTS.md without losing content', async () => {
  await writeFile(join(dir, 'AGENTS.md'), '# Project\n\nExisting guidance.\n')
  await runInit({ rootDir: dir })
  const content = await readFile(join(dir, 'AGENTS.md'), 'utf8')

  expect(content).toContain('Existing guidance.')
  expect(content).toContain('sgate check')
})

test('running init twice changes nothing the second time', async () => {
  await runInit({ rootDir: dir })
  const before = await readFile(join(dir, 'AGENTS.md'), 'utf8')
  const second = await runInit({ rootDir: dir })

  expect(second.created).not.toContain('slop-gate.config.ts')
  expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toBe(before)
})
```

- [ ] **Step 5: Implement init**

`packages/cli/src/commands/init.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { buildWorkspaceGraph } from '@misaon/slop-gate-core'
import { upsertAgentsSection } from '../agents-md.ts'

const CONFIG_TEMPLATE = `import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  extends: ['recommended'],
})
`

const AGENTS_BODY = `## Code quality gate

This repository uses [slop-gate](https://github.com/misaon/slop-gate).

- \`sgate check\` — analyse the repository. Run it before you finish a task.
- \`sgate check --format agent\` — the same findings in a form optimised for you.
- \`sgate fix\` — apply the fixes that are safe to apply automatically.
- \`sgate rules why <concept>\` — explain why a rule is enabled at its current severity.

Rules are configured by *concept* (for example \`dead-code.unused-import\`) in
\`slop-gate.config.ts\`, not by engine-specific rule names. Do not add engine config files such as
\`.eslintrc\`, \`eslint.config.js\` or \`.oxlintrc.json\` — slop-gate owns the ruleset, and a
competing config file will be ignored.
`

const readIfPresent = async (path: string): Promise<string | null> =>
  readFile(path, 'utf8').then(
    (content) => content,
    () => null,
  )

export async function runInit(options: {
  rootDir: string
  force?: boolean
}): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []

  const configPath = join(options.rootDir, 'slop-gate.config.ts')
  if ((await readIfPresent(configPath)) !== null && options.force !== true) {
    skipped.push('slop-gate.config.ts')
  } else {
    await writeFile(configPath, CONFIG_TEMPLATE, 'utf8')
    created.push('slop-gate.config.ts')
  }

  await mkdir(join(options.rootDir, '.slop-gate'), { recursive: true })
  await writeFile(join(options.rootDir, '.slop-gate', '.gitignore'), '*\n', 'utf8')

  const agentsPath = join(options.rootDir, 'AGENTS.md')
  const existingAgents = (await readIfPresent(agentsPath)) ?? ''
  const updatedAgents = upsertAgentsSection(existingAgents, AGENTS_BODY)
  if (updatedAgents !== existingAgents) {
    await writeFile(agentsPath, updatedAgents, 'utf8')
    created.push('AGENTS.md')
  } else {
    skipped.push('AGENTS.md')
  }

  return { created, skipped }
}

export const init = defineCommand({
  meta: { name: 'init', description: 'Set slop-gate up in this repository' },
  args: {
    cwd: { type: 'string', description: 'Directory to initialise (defaults to the current directory)' },
    force: { type: 'boolean', default: false, description: 'Overwrite an existing config' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()
    const { created, skipped } = await runInit({ rootDir, force: args.force })
    const workspaces = await buildWorkspaceGraph(rootDir)

    for (const file of created) process.stdout.write(`  created  ${file}\n`)
    for (const file of skipped) process.stdout.write(`  kept     ${file}\n`)
    process.stdout.write(`\nDetected ${workspaces.nodes.length} workspace(s). Run \`sgate check\` next.\n`)
  },
})
```

`.slop-gate/.gitignore` containing `*` is how the cache directory stays out of git without editing the user's own `.gitignore`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- init`
Expected: PASS, 6 tests.

- [ ] **Step 7: Verify against a scratch repository**

```bash
rm -rf /tmp/sgate-init-check && mkdir -p /tmp/sgate-init-check
cd /tmp/sgate-init-check && npm init -y >/dev/null && cd -
node packages/cli/bin/sgate.js init --cwd /tmp/sgate-init-check
cat /tmp/sgate-init-check/slop-gate.config.ts /tmp/sgate-init-check/AGENTS.md
```

Expected: both files exist with the intended content and the workspace count is reported as 1.

- [ ] **Step 8: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): sgate init writes config and agent documentation

The AGENTS.md section is marker-fenced and idempotent, so re-running init
never duplicates or clobbers a developer's own notes. Repository
profiling and config migration are deliberately left to M5."
```

---

## Task 16: End-to-end verification against a committed fixture

**Files:**
- Create: `fixtures/basic/package.json`, `fixtures/basic/slop-gate.config.ts`, `fixtures/basic/src/dirty.ts`, `fixtures/basic/src/clean.ts`
- Test: `packages/cli/src/e2e.test.ts`

**Interfaces:**
- Consumes: the whole stack. This task adds no new interface.

**Why this exists:** every earlier task tested a layer in isolation, several against stub engines. This is the only test that proves the real oxlint binary, the real registry, the real cache and the real reporter work together. Without it, M0 could be entirely green and still not run.

- [ ] **Step 1: Create the fixture repository**

`fixtures/basic/package.json`:

```json
{ "name": "slop-gate-fixture-basic", "private": true, "version": "0.0.0", "type": "module" }
```

`fixtures/basic/slop-gate.config.ts`:

```ts
export default { extends: ['recommended'] }
```

The fixture config avoids importing `defineConfig` so the fixture stays independent of the workspace's module resolution.

`fixtures/basic/src/dirty.ts`:

```ts
export function dirty(): number {
  debugger
  const duplicated = { a: 1, a: 2 }
  return duplicated.a
}
```

`fixtures/basic/src/clean.ts`:

```ts
export function clean(value: number): number {
  return value * 2
}
```

- [ ] **Step 2: Write the failing end-to-end test**

`packages/cli/src/e2e.test.ts`:

```ts
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { runCheck } from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/basic')
let dir: string

const check = (useCache: boolean) =>
  runCheck({
    rootDir: dir,
    config: { extends: ['recommended'] },
    engines: [createOxlintEngine()],
    useCache,
  })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-e2e-'))
  await cp(FIXTURE, dir, { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('finds the seeded problems in the dirty file and nothing in the clean one', async () => {
  const result = await check(false)
  const concepts = result.diagnostics.map((d) => d.concept)

  expect(concepts).toContain('correctness.no-debugger')
  expect(concepts).toContain('correctness.no-duplicate-object-key')
  expect(result.diagnostics.every((d) => d.file !== 'src/clean.ts')).toBe(true)
}, 60_000)

test('reports every diagnostic with a canonical rule id, a concept and a position', async () => {
  for (const diagnostic of (await check(false)).diagnostics) {
    expect(diagnostic.ruleId).toMatch(/^[a-z-]+\/\S+$/)
    expect(diagnostic.concept).toMatch(/^[a-z-]+\.[a-z-]+$/)
    expect(diagnostic.position.startLine).toBeGreaterThan(0)
    expect(diagnostic.file).not.toMatch(/^\/|\\/)
    expect(diagnostic.fingerprint).toMatch(/^[0-9a-f]{32}$/)
  }
}, 60_000)

test('reports the same findings from cache on a second run', async () => {
  const cold = await check(true)
  const warm = await check(true)

  expect(warm.diagnostics).toEqual(cold.diagnostics)
  expect(warm.stats.filesFromCache).toBeGreaterThan(0)
}, 60_000)

test('the warm run is faster than the cold run', async () => {
  const cold = await check(true)
  const warm = await check(true)

  expect(warm.stats.durationMs).toBeLessThanOrEqual(cold.stats.durationMs)
}, 60_000)

test('never reports two diagnostics with the same concept at the same position', async () => {
  const seen = new Set<string>()
  for (const diagnostic of (await check(false)).diagnostics) {
    const key = `${diagnostic.file}:${diagnostic.range.start}:${diagnostic.concept}`
    expect(seen.has(key), `duplicate report for ${key}`).toBe(false)
    seen.add(key)
  }
}, 60_000)

test('reports no engine failures', async () => {
  expect((await check(false)).engineFailures).toEqual([])
}, 60_000)
```

The duplicate-report test is the end-to-end proof that arbitration works: it is the failure mode the whole registry exists to prevent, and it must be asserted against real engine output rather than stubs.

- [ ] **Step 3: Run the tests**

Run: `pnpm test -- e2e`
Expected: PASS, 6 tests.

If `correctness.no-duplicate-object-key` is missing, the `no-dupe-keys` entry in the registry does not match oxlint's actual rule id. Return to Task 11 Step 1, re-read the recorded `--rules --format json` output, and correct `packages/core/src/registry/entries.ts`.

- [ ] **Step 4: Run the full suite and build**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: all green. This is the M0 acceptance gate.

- [ ] **Step 5: Verify the tool on its own repository**

```bash
node packages/cli/bin/sgate.js check
echo "exit=$?"
```

Expected: findings render with code frames, the summary reports file and cache counts, and the exit code is 0 or 1. Run it twice — the second run must be visibly faster and report a non-zero cached count.

- [ ] **Step 6: Commit**

```bash
git add fixtures packages/cli/src/e2e.test.ts
git commit -m "test: end-to-end check against a committed fixture repo

Exercises the real oxlint binary, registry, cache and reporter together.
Asserts no concept is reported twice at one position, which is the
failure mode arbitration exists to prevent and which stubs cannot prove."
```

---

## M0 Acceptance

M0 is done when all of the following hold:

- `pnpm typecheck && pnpm test && pnpm build` is green on Linux, macOS and Windows for Node 24 and 26.
- `sgate init` on a fresh repository produces a loadable config and an AGENTS.md section.
- `sgate check` on this repository reports real findings with code frames and exits 0 or 1.
- A second `sgate check` with no edits is faster and reports a non-zero cached count.
- `sgate check --format json` emits a `version: 1` document.
- No concept is ever reported twice for the same position, proven end to end against the real engine.
- A rule overlap in the shipped registry produces a `config.rule-overlap` diagnostic naming both rules.

## What M0 deliberately does not include

Each is specified in the design document and planned for a later milestone. None is an oversight:

- **`sgate fix`** and the edit arbiter — M3 (§11).
- **`rules` subcommands, the lockfile, generated concept types** — M1 (§5.4–§5.6). M0 ships the registry and arbitration they are built on.
- **Ownership-driven dead-override detection** — M1. M0 detects only keys naming nothing at all (Task 7).
- **Every engine beyond oxlint** — M2 (§13.1).
- **Worker pool, project-granularity caching, cgroup-aware concurrency** — M2 (§8.2).
- **`agent` reporter, MCP server, SARIF** — M4 (§12).
- **Repository profiling and config migration** — M5 (§15.1).
- **Baseline, `--since`, remote cache, LSP** — M3 and M6.
- **The benchmark suite and the CI performance gate** (§16) — M6. M0 asserts only the qualitative
  property that a warm run is not slower than a cold one; the committed budgets and the published
  comparison against trunk, qlty and ESLint need the full engine set to be meaningful.
- **Changesets and publishing to npm** (§20) — nothing is released from M0. Package versions stay at
  `0.0.0` and `@misaon/slop-gate` is not published until the CLI surface stabilises in M5.
- **Restrictive permissions on materialised engine configs** (§19) — M2, alongside the rest of the
  engine set. M0 writes one ephemeral config into a gitignored directory and disposes of it.
