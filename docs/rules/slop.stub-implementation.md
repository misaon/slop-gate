# `slop.stub-implementation`

**Engine:** ast-grep · **Default level:** `warn` · **Preset:** `slop` · **Fix:** none

Detects an exported function, method or arrow function whose first statement throws an error whose
message says the work was never done:

```ts
export function reconcileInvoices(): Invoice[] {
  throw new Error('Not implemented')
}

export const send = async () => {
  // TODO: wire this up to the real client
  throw new Error('unimplemented')
}
```

## Why this is a problem

A stub is worse than a missing function, and the difference is the compiler. Delete the function and
every call site fails to build, immediately, with a list of exactly what depends on it. Leave a stub
and the call sites type-check, the module imports cleanly, the tests that mock it pass — and the
only way to discover the feature does not exist is to run the exact path that reaches it, in
production, once.

Exported is the part that matters: the function is part of a module's contract, so something outside
it is entitled to call it.

TypeScript already has two ways to say "a subclass must supply this" that keep the compiler
involved: `abstract` members, and declared-only overload signatures. Neither is detected here.

## What it detects, precisely

The **first non-comment statement** of the body must be `throw new <SomeError>(<message>)`, and the
message must match `not implemented` / `unimplemented` / `TODO` / `FIXME` / `stub` / `placeholder` /
`implement this` / `implement me` (case-insensitive). The function must be inside an
`export` statement — including `export default` and a method of an exported class.

## What it does not detect

- A non-exported helper.
- An `abstract` member (no body to match).
- A real error: `throw new Error('config file missing')` does not match the message constraint.
- A guard clause: `if (!x) throw new Error('not implemented for x')` is not the body's first
  statement path when real work follows, and a throw nested inside an `if` is not a direct child of
  the body at all.
- A function exported later by name (`function f() {...}` … `export { f }`), because there is no
  enclosing `export` statement to match.
- The "returns a placeholder literal" half of spec §14. `return null`, `return []` and `return {}`
  are the most ordinary statements in JavaScript, and no syntactic property separates a placeholder
  from a real one. It is not implemented rather than guessed at.

## Measured accuracy

| Corpus | Findings | Verdict |
|---|---|---|
| slop-gate, 163 JS/TS files | 0 | — |
| 3,366 third-party files (~45 MB) | 0 | — |

Zero false positives over 3,529 files, and zero true positives too. The second half is the point
rather than a defect: published library code does not ship functions that throw "not implemented" —
unfinished work does. That it fires at all, and on exactly the right shapes, is proved by
`packages/engine-astgrep/fixtures/stub-implementation.*.ts`.

## Escapes

A concrete must-override hook is the one legitimate shape this can hit:

```ts
// sgate-disable-next-line slop.stub-implementation -- every subclass overrides this; see Base docs
render(): string { throw new Error('not implemented') }
```

Prefer making it unnecessary:

```ts
abstract render(): string
```
