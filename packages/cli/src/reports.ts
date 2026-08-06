import { writeFileSync } from 'node:fs'
import { isOneOf } from '@misaon/slop-gate-core'
import { REPORTER_NAMES, createReporter, type Reporter, type ReporterContext, type ReporterName } from '@misaon/slop-gate-reporters'

export type ReportSpec = { readonly name: ReporterName; readonly path: string | null }

export type ReportSink = { readonly reporter: Reporter; flush(): void }

export function parseReportSpecs(
  raw: string | undefined,
  primary: ReporterName,
): readonly ReportSpec[] | { readonly error: string } {
  if (raw === undefined) return []

  const specs: ReportSpec[] = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (trimmed === '') return { error: `--report has an empty entry in: ${raw}` }

    const separator = trimmed.indexOf(':')
    const name = separator === -1 ? trimmed : trimmed.slice(0, separator)
    const path = separator === -1 ? null : trimmed.slice(separator + 1)

    if (!isOneOf(name, REPORTER_NAMES)) {
      return { error: `--report names an unknown format: ${name}. Expected one of ${REPORTER_NAMES.join(', ')}.` }
    }
    if (path !== null && path === '') return { error: `--report ${name}: has no path after the colon.` }

    // `--format` already owns stdout. `github` is the one report defined as workflow commands embedded
    // in a log, so it can share the stream with the human report and nothing else — any other pairing
    // interleaves two formats and produces a file that parses as neither.
    if (path === null && !(name === 'github' && primary === 'pretty')) {
      const reason =
        name === 'github'
          ? `--format is \`${primary}\`, which owns stdout`
          : `\`${name}\` is a whole-document format and cannot share stdout with \`${primary}\``
      return { error: `--report ${name} needs a path (\`${name}:<file>\`): ${reason}.` }
    }

    specs.push({ name, path })
  }
  return specs
}

// A file report cannot stream: the run has to finish before the file exists, or a crash leaves a
// truncated report that a SARIF upload would still accept.
export function createReportSink(spec: ReportSpec, context: Omit<ReporterContext, 'write'>): ReportSink {
  if (spec.path === null) {
    return { reporter: createReporter(spec.name, { ...context, write: (chunk) => process.stdout.write(chunk) }), flush: () => {} }
  }

  const held: string[] = []
  const path = spec.path
  return {
    reporter: createReporter(spec.name, { ...context, write: (chunk) => void held.push(chunk) }),
    flush: () => writeFileSync(path, held.join('')),
  }
}
