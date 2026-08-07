# @misaon/slop-gate-rules-explorer

## 0.2.0

### Patch Changes

- [#75](https://github.com/misaon/slop-gate/pull/75) [`15705e0`](https://github.com/misaon/slop-gate/commit/15705e0ec0ccd0a8bb5e8a203104fe12d260b977) Thanks [@misaon](https://github.com/misaon)! - TanStack Table 9 for the rules explorer. The Preact binding drops the filtered and faceted row models
  it registered and never used — `app.tsx` narrows the rows itself — which takes the client bundle from
  213.50 kB to 196.82 kB.

- [#75](https://github.com/misaon/slop-gate/pull/75) [`d52b27f`](https://github.com/misaon/slop-gate/commit/d52b27f793a5cf9bd212d5b228f788310d7e2b4d) Thanks [@misaon](https://github.com/misaon)! - Vite 8 for the rules explorer, with `@preact/preset-vite` 2.10.6 — 2.10.2 peers only to Vite 7, so
  the pair had to move together.
- Updated dependencies [[`e5e8b65`](https://github.com/misaon/slop-gate/commit/e5e8b654af2e4dbbbac4fc0fccea636b514af335)]:
  - @misaon/slop-gate-core@0.2.0
