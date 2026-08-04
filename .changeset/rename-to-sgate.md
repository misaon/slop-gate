---
'sgate': minor
---

**The CLI is now published as `sgate`, not `@misaon/slop-gate`.**

The package name and the command are the same word, which is what `npx` resolves on — so
`npx sgate init` works with nothing installed. Under the old name it did not, because `npx`
looks for a *package* called `sgate` and there was none.

```bash
npm install -D sgate
npx sgate check
```

The twelve engine packages keep their `@misaon/slop-gate-*` names. They are dependencies
nobody types.

If you installed `@misaon/slop-gate`, swap it for `sgate` — the API, the config and the
`sgate`/`slop-gate` binaries are unchanged. The old package is deprecated and points here.
