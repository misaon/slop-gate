# `slop.double-cast`

**Engine:** ast-grep · **Default level:** `warn` · **Preset:** `slop` · **Fix:** none

Detects a type assertion routed through `unknown` or `any` on its way to some other type:

```ts
const config = raw as unknown as AppConfig
const handler = fn as any as RequestHandler
```

## Why this is a problem

TypeScript rejects `raw as AppConfig` when the two types have no overlap. That rejection is the
compiler telling you the claim is unsupported by anything it can see. Going through `unknown` does
not add evidence; it removes the check. The assertion is now unfalsifiable, and every consumer
downstream is typed against a promise nobody verified.

The failure is delayed and silent. `RegExpExecArray as unknown as [string, string]` type-checks
forever; the day a capture group becomes optional, `undefined` flows through code that is certain it
holds a `string`, and the error surfaces somewhere else entirely.

This is a different defect from [`slop.as-any-cast`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-explicit-any.html),
which is about opting out of typing a value. Here a specific type *is* claimed — one the evidence
contradicts. oxlint reports nothing for it, because no `any` appears in the source at all.

## What it does not detect

- A single assertion (`x as T`), which the compiler still checks for overlap.
- `as unknown` on its own, which widens rather than narrows and is safe.
- Anything requiring type information — whether a *single* assertion is unsound needs the checker,
  and that is M2 type-aware work.

## Measured accuracy

| Corpus | Findings | Verdict |
|---|---|---|
| slop-gate, 163 JS/TS files | 2 | Both genuine: `RegExpExecArray` asserted to a fixed-length tuple of non-optional strings |
| 3,366 third-party files (~45 MB) | 65 | Concentrated in 7 files across 2 packages — 62 in `zod`, whose subject matter is type-level construction |

That distribution is why it is in the opt-in `slop` preset and not in `recommended`: on ordinary
application code it is low-volume and points at something real; in a type-level library it is a
wall, and the author of one will not have opted in.

## Escapes

```ts
// sgate-disable-next-line slop.double-cast -- the shape is validated by `assertConfig` above
const config = raw as unknown as AppConfig
```

Or turn it off for a directory in `slop-gate.config.ts`:

```ts
overrides: [{ files: ['src/types/**'], rules: { 'slop.double-cast': 'off' } }]
```

The better fix is usually a type guard, which converts the assertion into something the compiler can
check:

```ts
function isAppConfig(value: unknown): value is AppConfig { /* real checks */ }
if (!isAppConfig(raw)) throw new TypeError('bad config')
```
