import { appendFileSync, readFileSync } from 'node:fs'

const [reportPath, summaryPath] = [process.argv[2], process.env['GITHUB_STEP_SUMMARY']]
if (reportPath === undefined || summaryPath === undefined) process.exit(0)

const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const diagnostics = report.diagnostics ?? []

const byConcept = new Map()
for (const diagnostic of diagnostics) {
  const held = byConcept.get(diagnostic.concept) ?? { severity: diagnostic.severity, count: 0 }
  held.count += 1
  byConcept.set(diagnostic.concept, held)
}

const counts = report.counts
const lines =
  diagnostics.length === 0
    ? ['## slop-gate', '', 'No issues found.']
    : [
        '## slop-gate',
        '',
        `${counts.error} errors · ${counts.warn} warnings · ${counts.info} info, across ${byConcept.size} concepts.`,
        `${report.stats.filesScanned} files scanned, ${report.stats.filesAnalysed} analysed, in ${report.stats.durationMs} ms.`,
        '',
        '| Concept | Severity | Findings |',
        '| --- | --- | --- |',
        ...[...byConcept.entries()]
          .sort(([, a], [, b]) => b.count - a.count)
          .map(([concept, { severity, count }]) => `| \`${concept}\` | ${severity} | ${count} |`),
      ]

// The coverage gap is the one thing the counts cannot show: an engine that never ran reports nothing,
// which reads identically to an engine that found nothing.
for (const engine of report.unavailableEngines ?? []) {
  lines.push('', `> \`${engine.engine}\` did not run — ${engine.reason}`)
}

appendFileSync(summaryPath, `${lines.join('\n')}\n`)
