---
'@misaon/slop-gate': minor
---

Nothing changes for you; this release only makes the version numbers agree again.

The twelve engine packages were published at 0.2.0 during an attempt to rename the CLI to
`sgate`. npm refused that name — it is too close to existing packages (`slate`, `xstate`,
`sade`) — so the rename is reverted and the CLI stays `@misaon/slop-gate`. This brings it up
to 0.2.0 alongside the engines it ships with.

Install and invocation are unchanged:

```bash
npm install -D @misaon/slop-gate
npx sgate check
```
