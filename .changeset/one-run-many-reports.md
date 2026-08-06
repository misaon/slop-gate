---
'@misaon/slop-gate': minor
---

`sgate check --report <name>[:<path>]` produces additional reports from the same run — for example
`--report github,sarif:sgate.sarif` gives the readable log on stdout, annotations on the diff and
SARIF on disk at once. Previously each format needed its own invocation, so a CI job wanting
annotations and SARIF analysed the tree twice and sent two telemetry events.

`--format` still owns stdout. A report given no path shares that stream, which only `github` may do
and only alongside `--format=pretty`: it is workflow commands embedded in a log, where every other
format is a whole document that would interleave into something parsing as neither.
