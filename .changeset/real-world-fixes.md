---
'@misaon/slop-gate': minor
---

Fixes for six defects, five of them found by running slop-gate on real projects rather than on
fixtures.

**`tsc` now works on the standard NestJS layout.** A tsconfig with `rootDir: ./src` and tests in
`test/` made tsc fail with `TS6059` per file — an engine failure, so the project got no type
checking at all. `--noEmit` does not suppress it, because `rootDir` is enforced while the program
is built. Widened to the analysed root, which changes no diagnostic.

**Next.js rules no longer fire in repositories without Next.js.** A Remix app was being told to
use `next/image`. All 21 rules in the scope resolve to "import from `next/…` instead"; a project
without Next.js cannot follow that.

**Nuxt is understood properly.** Its `#app` and `#shared` aliases were 14 unresolved-import
findings at `error` on `nuxt/nuxt.com`, and each Nuxt layer now becomes its own knip workspace
rather than being invisible to it. On that repository: unused exports 65 → 15, unresolved imports
14 → 2, errors 19 → 7.

**Firebase Functions handlers are entry points**, not dead code — the platform loads them by path.

**A framework that generates its tsconfig is a coverage gap, not a crash.** Nuxt's tsconfig extends
`.nuxt/tsconfig.json`, which exists only after `nuxt prepare`; a fresh clone used to exit 3.

**`sgate check --format=json --max-findings <n>`** bounds the report. `medusajs/medusa` produced a
23.9 MB document; at 500 findings it is 0.4 MB and carries `truncated: { dropped, of }` so a
consumer can tell a bounded document from a complete one. Opt-in — the unbounded document is still
the default. The report version goes to 5 for that reason.
