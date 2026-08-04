---
'@misaon/slop-gate': patch
---

Fix `sgate init` writing a config that `sgate check` could not load.

`init` generates a config importing `defineConfig` from `@misaon/slop-gate`. Reached through
`npx`, the CLI runs from npx's cache and the package is not a dependency of the project, so the
very next `check` failed while loading that config — and said so with advice meant for tsconfig
path aliases, without naming the import that failed.

`init` now tells you to install the package, and the loader names the missing specifier and
gives the command that fixes it. A relative import that cannot be resolved still gets the path
advice, which is what it is for.
