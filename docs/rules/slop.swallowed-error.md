# `slop.swallowed-error`

**Engine:** ast-grep · **Default level:** `warn` · **Preset:** none (opt in by concept) · **Fix:** none

Detects a `catch` clause with an empty body:

```ts
try {
  await flush()
} catch {}

try {
  await flush()
} catch (error) {
  // ignore
}
```

A block containing only comments counts as empty — that is the canonical form, not an exception to it.

## Why this is a problem

A swallowed error makes failure and success indistinguishable to everything downstream. The
function returns normally, the caller proceeds, and the only record that anything went wrong is the
absence of whatever the `try` block was supposed to do. Debugging then starts from a symptom several
layers away, with no stack trace and no log line.

It is a characteristic shape of generated code because it makes a program stop crashing without
making it work — the fastest way to a green run, and the slowest way to a correct one.

## What it does not detect

- A `catch` that logs and continues. Spec §14 names this shape too, and it was implemented and then
  **measured out**: 5 findings across the third-party corpus, every one a CLI printing an error at
  its top level, where that is the correct handling rather than a swallowed error.
- A `catch` that returns a fallback, rethrows, or calls a handler.
- An unhandled rejection, a missing `await`, or an error dropped by a `.catch(() => {})` callback —
  the last is worth adding and is recorded in the follow-ups.

## Measured accuracy

| Corpus | Findings | Verdict |
|---|---|---|
| slop-gate, 163 JS/TS files | 0 | — |
| 3,366 third-party files (~45 MB) | 433 across 34 packages | A random sample of 22 was read in context: roughly 19 were deliberate |

The deliberate ones are feature probes (`try { require.resolve('picomatch') } catch {}`), optional
reads, best-effort cleanup and validity tests (`new URL(x)`). The ones that were not include a case
whose own comment reads `// Swallow // XXX should we be logging these?`.

**That rate is why this concept is in no preset, including `slop`.** It detects exactly what it says
it detects; in library code, most of what it detects is intentional. Enable it deliberately, on a
codebase where it earns its place:

```ts
rules: { 'slop.swallowed-error': 'warn' }
```

## Escapes

Ignoring an error is sometimes the whole point. Say so, and the reason becomes documentation:

```ts
// sgate-disable-next-line slop.swallowed-error -- optional peer; absence is the normal case
try { require.resolve('picomatch') } catch {}
```

Otherwise, the two fixes that keep the information are rethrowing with a cause, and handling:

```ts
catch (error) {
  throw new Error('could not flush the write buffer', { cause: error })
}
```
