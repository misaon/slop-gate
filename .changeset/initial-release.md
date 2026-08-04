---
'@misaon/slop-gate': minor
---

First public release.

slop-gate runs ten analysers behind one config file, one diagnostic model and one exit code:
oxlint, tsc, knip, ast-grep, biome (CSS), oxfmt, actionlint, hadolint, JSON/YAML schema
validation and a dependency-advisory check.

What it does that a runner of linters does not: every rule declares the *concept* it detects,
exactly one rule owns a concept per language, and `sgate rules why` shows the arbitration.
Framework profiles read your `tsconfig.json` and workspace manifests and turn rules off with
a stated reason scoped to the directories the evidence covers — and stand down instead of
guessing when the evidence is ambiguous.

Reporters for humans (`pretty`), machines (`json`, `agent`, `sarif`), and pull requests
(`github`, `gitlab`), plus an MCP server. Results cache per (engine, file); a warm run on
this repository is around 120 ms.
