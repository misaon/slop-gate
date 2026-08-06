---
'@misaon/slop-gate': minor
---

Six defects found by running slop-gate over 20 real repositories — one per framework it claims to
handle — with no config, the way a first-time user would.

Across that corpus: **findings 22,329 → 20,255, error-severity findings 3,777 → 3,005, and the
number of repositories where an engine crashed 3 → 0.**

**A dependency advisory can no longer take the whole engine down.** OSV bounds are
publisher-supplied and not all of them are semver; the snapshot shipping today holds twelve that
are two-part, one of which is on `next`. Comparing against a raw bound threw, and the engine died
with *every* advisory for the repository unreported. `vercel/commerce` now reports 12 it had been
silent about, including a *high*-severity Next.js request-deserialisation issue.

**An unreadable lockfile is a coverage gap, not an engine failure.** A `lockfileVersion: 1` file —
npm 6 era, still common — exited 3 saying `deps-security` failed. The engine already had the right
answer for a lockfile it cannot read; this routes the npm case to it. `ngx-admin` exits 1 on its
own findings now.

**Preact is not React.** The `react-jsx-transform` profile knew the automatic runtime and
`jsxImportSource`, but not the oldest way of not being React: `"jsx": "react"` with a `jsxFactory`
of your own. A repository that exists in order not to be React was told to import React 4,220
times.

**A generated file that says so on line 1 is now recognised as one.** Detection was by filename
only. `fastify/fastify`'s ajv-generated `lib/config-validator.js` is named like any other source
and produced 997 findings — 27% of everything said about that repository.

**`tsc` no longer reports inside `node_modules`.** Every other engine sees only the inventory,
which skips it. `tsc` reports on the whole program, so a project without `skipLibCheck` surfaced
type errors in its dependencies' bundled `.d.ts` files: 587 of solid-start's 1,802.

**`vitest/valid-title` warns rather than errors.** "Title must be a string" fires on any title that
is not a literal, and a table-driven test names its cases from a variable. 163 of 174 findings
across five repositories are that pattern, and none is wrong about the type.
