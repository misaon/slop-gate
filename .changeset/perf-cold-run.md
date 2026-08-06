---
'@misaon/slop-gate': minor
---

The cold run — the one CI takes, and the one an alpha tester sees first — is between 1.3x and 2.6x
faster, on a third to a quarter of the memory. Warm runs were already fast and are unchanged.

Measured `--no-cache`, medians of 3, same checkout built at two commits, 4-core arm64:

|  | before | after | peak RSS |
|---|---:|---:|---|
| html5-boilerplate (61 files) | 1,156 ms | **449 ms** | 334 → **105 MB** |
| withastro/docs (2,941) | 2,139 ms | **970 ms** | 405 → **163 MB** |
| immich (3,378) | 7,179 ms | **3,680 ms** | 456 → **326 MB** |
| solid-start (517) | 8,570 ms | **6,237 ms** | 398 → **318 MB** |

All 20 repositories in the corpus report identically, finding for finding and in the same order.

**The malware table is opened, not read.** 218,718 packages and 42 MB of JSON were parsed on every
run of every repository to answer a few thousand name lookups — 40% of all CPU on a small project,
plus the GC behind 200 MB of heap. It is now a sorted index with the records left on disk, and only
the names your lockfile actually holds are resolved.

**One lockfile is no longer parsed twice.** The `yaml` package's duplicate-key check is quadratic
and was more than half of immich's 1 MB `pnpm-lock.yaml` parse; a lockfile is generated, so it is
off. The schema engine was then parsing the same file again — 1,016 ms for zero findings, since a
lockfile binds to no published schema — and now skips lockfiles outright.

**Engines run concurrently.** They are independent, but ran one after another, leaving a four-core
machine at 1.3–2.0x CPU:wall. Results are still emitted in plan order, so what a reporter sees is
unchanged.

**`--timing` had to become more honest to say this.** `unattributedMs` was the run minus the sum of
the phases, which goes negative once phases overlap. The report now carries `busyMs` — the wall
clock with at least one phase in flight — so `startupMs + busyMs + unattributedMs` is the run
exactly, and `--timing` says out loud when phases overlapped rather than letting their shares sum
past 100% unexplained.

**`sgate engines install advisories` must be re-run.** The snapshot format is version 2. An older
snapshot is simply not found, which is already a stated coverage gap naming the command.
