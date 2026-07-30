import { styleText } from 'node:util'
import type { CheckEvent, CheckResult, Diagnostic, Severity } from '@misaon/slop-gate-core'
import { renderCodeFrame } from './code-frame.ts'
import type { Reporter, ReporterContext } from './index.ts'

const SEVERITY_STYLE: Readonly<Record<Severity, Parameters<typeof styleText>[0]>> = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
}

export function createPrettyReporter(context: ReporterContext): Reporter {
  const paint = (style: Parameters<typeof styleText>[0], text: string): string =>
    context.color ? styleText(style, text) : text

  let currentFile: string | null = null

  const writeDiagnostic = (diagnostic: Diagnostic): void => {
    if (diagnostic.file !== currentFile) {
      currentFile = diagnostic.file
      context.write(`\n${paint(['underline', 'bold'], diagnostic.file)}\n`)
    }

    const location = `${diagnostic.position.startLine}:${diagnostic.position.startColumn}`
    context.write(
      `  ${paint('dim', location.padEnd(8))}` +
        `${paint(SEVERITY_STYLE[diagnostic.severity], diagnostic.severity.padEnd(5))}  ` +
        `${diagnostic.message}  ${paint('dim', diagnostic.concept)}\n`,
    )

    const source = context.readSource(diagnostic.file)
    if (source !== null) {
      const frame = renderCodeFrame(source, diagnostic.position, { color: context.color })
      context.write(`${frame.split('\n').map((line) => `    ${line}`).join('\n')}\n`)
    }

    if (diagnostic.help !== undefined) context.write(`    ${paint('dim', `help: ${diagnostic.help}`)}\n`)
  }

  const writeSummary = (result: CheckResult): void => {
    for (const failure of result.engineFailures) {
      context.write(`\n${paint(['bgRed', 'white'], ' ENGINE FAILED ')} ${failure.engine}: ${failure.message}\n`)
    }

    const parts = (['error', 'warn', 'info'] as const)
      .filter((severity) => result.counts[severity] > 0)
      .map((severity) => paint(SEVERITY_STYLE[severity], `${result.counts[severity]} ${severity}${result.counts[severity] === 1 ? '' : 's'}`))

    context.write('\n')
    context.write(
      parts.length === 0
        ? `${paint('green', 'No issues found.')} `
        : `${parts.join(', ')}. `,
    )
    context.write(
      paint(
        'dim',
        `${result.stats.filesScanned} files, ${result.stats.filesFromCache} cached, ${result.stats.durationMs}ms`,
      ),
    )
    context.write('\n')

    if (result.ruleset.suppressed > 0) {
      const count = result.ruleset.suppressed
      context.write(
        paint('dim', `${count} rule overlap${count === 1 ? '' : 's'} resolved — run \`sgate rules conflicts\` for detail.\n`),
      )
    }
    if (result.ruleset.uncovered.length > 0) {
      context.write(
        paint('yellow', `${result.ruleset.uncovered.length} enabled concepts have no capable engine in this repo.\n`),
      )
    }
  }

  return {
    onEvent(event: CheckEvent) {
      if (event.type === 'diagnostic') writeDiagnostic(event.diagnostic)
      else if (event.type === 'done') writeSummary(event.result)
    },
  }
}
