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
