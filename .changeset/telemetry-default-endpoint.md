---
'@misaon/slop-gate': minor
---

Telemetry now has an address, so it is opt-out rather than opt-in in practice as well as in
principle. Until now nothing was ever sent: the sender looked for `SLOP_GATE_TELEMETRY_URL`, no build
set one, and every run took the silent early return. Reports now go to
`https://slop-gate-telemetry.ondrejmisak.cz/api/telemetry` unless you say otherwise.

What was already true is unchanged — anonymous rule identifiers and counts, no code, no paths, no
messages, no configuration, at most one report an hour per checkout, and a notice on the first run.
`sgate telemetry` prints the exact document a run would send.

Off is `SLOP_GATE_TELEMETRY=0` or `DO_NOT_TRACK=1`. `SLOP_GATE_TELEMETRY_URL` still points a run
somewhere else, and setting it to an empty string now means nowhere at all — a third state, for a
test or an air-gapped build that wants everything to run with the send removed.
