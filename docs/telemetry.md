# Telemetry

slop-gate reports anonymous usage data so that rules which are wrong can be found and fixed. This
page is the whole of it — what is sent, what is not, how to see it, and how to turn it off.

```bash
sgate telemetry            # print the exact document this repository would send
SLOP_GATE_TELEMETRY=0      # off
DO_NOT_TRACK=1             # also off, and honoured first
```

`sgate telemetry` exists because a tool whose argument is that its output can be trusted without
checking cannot ask to be trusted about this either. It shows the document rather than describing it.

## Why

The registry has 923 rules and measured reliability for **three** of them, because measuring one means
reading every finding it produced by hand. That does not scale, and it is the difference between
"this rule is right 6% of the time" and an opinion.

A run can observe three things that no survey would get:

| Signal | What it means |
|---|---|
| an inline `sgate-disable` naming a rule | someone read this finding and said *not this one* |
| a concept set to `off` in the config | someone said *not this rule, ever* |
| a finding accepted into a baseline | someone said *not now* |

The first two are the closest thing to a false-positive report that exists without asking anyone to
file one.

## What is sent

```json
{
  "schema": 1,
  "run": "<random, per run, so a retry is not double-counted>",
  "project": "<random, per checkout, derived from nothing>",
  "slopGate": "0.2.0", "node": "24", "platform": "linux", "ci": true,
  "durationMs": 3421, "filesScanned": 427, "filesAnalysed": 380,
  "engines": [{ "id": "oxlint", "version": null, "ran": true }],
  "rules": [{ "rule": "oxlint/no-shadow", "findings": 12, "suppressed": 2, "baselined": 7, "generated": 0 }],
  "disabledConcepts": ["slop.double-cast"],
  "preset": "recommended",
  "baseline": true
}
```

Every value is a count, a boolean, or a string from slop-gate's own vocabulary — a rule id, a concept
id, a platform name. The Node version is reported as a major, because a full build string on a machine
nobody else shares is close to a fingerprint.

## What is never sent

File paths. Findings' messages. Source code. Package or dependency names. Repository name, URL or git
remote. Branch names. Your configuration file. Environment variables. Usernames. **The reason text on
a `sgate-disable` comment** — that is your prose and could contain anything, so only the rule it names
is counted.

**This is enforced, not promised.** `payload.test.ts` builds a payload from a run whose findings carry
planted secrets — a path with a customer name, a message with a type name, source with an API key, a
suppression reason with a project name — and fails if any of them, or any fragment of them, appears in
the serialised output. A second test fails on a new field that is a free string rather than a count or
a known-shaped id, because a free string is where the next leak would arrive.

## Anonymity

There is no account, no email, no machine id, and nothing derived from your repository.

`project` is a random UUID written to `.slop-gate/project-id` the first time a report is sent. It is
**deliberately not** a hash of the git remote: a repository URL has so little entropy that such a hash
is reversible by enumerating public repositories, which would make the whole dataset deanonymisable if
it ever leaked.

Two consequences, stated because they are the honest cost of that choice:

- `.slop-gate/` is gitignored, so **each checkout is a separate id**. Two developers on one repository
  count as two. The metric is checkouts, not projects.
- CI runners are usually ephemeral, so a CI run reports a fresh id each time. Those runs carry
  `ci: true` and are counted separately rather than as new projects. `SLOP_GATE_PROJECT_ID` overrides
  the id for a team that wants stable CI attribution — an explicit choice, never inferred.

**IP addresses are not stored.** The ingest endpoint sees one, as any HTTP server does, and writes
none to the database. Under GDPR an IP is personal data; nothing else collected here is.

## When it is sent

At most **once an hour per checkout**, tracked by a timestamp in `.slop-gate/`. That is enough to see
change and not enough for one person running `sgate check` five hundred times a day to outweigh
everyone else.

The request is one POST with a **2-second deadline, no retry, and every error swallowed**. A run never
fails, never changes its exit code, and never waits longer than that because of telemetry. If the
endpoint is down you will not notice.

## Turning it off

```bash
SLOP_GATE_TELEMETRY=0      # anything other than 1/true/on/yes is off
DO_NOT_TRACK=1             # the cross-tool convention, checked first
```

Either one in the environment, a shell profile, or CI settings. The first run prints a notice saying
so; after that it says nothing.
