import { styleText } from 'node:util'
import type { CheckEvent, CheckResult, Diagnostic, Position, Severity } from '@misaon/slop-gate-core'
import { displayWidth, padEndDisplay, padStartDisplay, truncateEnd, truncateStart } from './display-width.ts'
import type { Reporter, ReporterContext } from './index.ts'

/**
 * All three are emoji at the same display width (two columns) — the only column-aligned position
 * in this layout. Mixing in a width-one dingbat here would shear every column beneath it. One
 * constant makes swapping the set (or adding a fourth severity) a one-line edit.
 */
export const SEVERITY_GLYPH: Readonly<Record<Severity, string>> = {
  error: '🔴',
  warn: '🟡',
  info: '🔵',
}

/** `TERM=dumb` fallback for `SEVERITY_GLYPH` — also one column each, for the same reason. */
const SEVERITY_GLYPH_ASCII: Readonly<Record<Severity, string>> = {
  error: 'E',
  warn: 'W',
  info: 'I',
}

const SEVERITY_STYLE: Readonly<Record<Severity, Parameters<typeof styleText>[0]>> = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
}

const SEVERITY_NOUN: Readonly<Record<Severity, string>> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
}

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warn', 'info']

const MIN_FRAME_WIDTH = 60
const MAX_FRAME_WIDTH = 100
const CONFIG_HEADING = '(configuration)'
const MOST_FREQUENT_THRESHOLD = 10
const MOST_FREQUENT_TOP_N = 3

type Box = { tl: string; tr: string; bl: string; br: string; h: string; v: string }

const UNICODE_BOX: Box = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
const ASCII_BOX: Box = { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

export function createPrettyReporter(context: ReporterContext): Reporter {
  const unicode = context.unicode
  const box = unicode ? UNICODE_BOX : ASCII_BOX
  const glyph = unicode ? SEVERITY_GLYPH : SEVERITY_GLYPH_ASCII
  const fileMark = unicode ? '▌' : '>'
  const logoMark = unicode ? '◆' : '*'
  const checkMark = unicode ? '✓' : 'OK'
  const codeFrameBar = unicode ? '│' : '|'
  const codeFrameUnderline = unicode ? '━' : '^'
  const multiplySign = unicode ? '×' : 'x'
  const statsSeparator = unicode ? ' · ' : ' | '

  // `validateStream: false` is deliberate: `styleText` otherwise re-derives colour support from
  // `process.stdout.isTTY` itself and silently no-ops when it is not a TTY — which would override
  // `context.color` exactly in the one case that flag exists to handle correctly (`FORCE_COLOR` set
  // while piped). `context.color` is already the CLI's own complete NO_COLOR/FORCE_COLOR/TTY
  // decision (see check.ts's `supportsColor`); nothing downstream should re-decide it.
  const paint = (style: Parameters<typeof styleText>[0], text: string): string =>
    context.color ? styleText(style, text, { validateStream: false }) : text

  // Frame width is derived from `context.width` (the CLI supplies `process.stdout.columns ?? 80`)
  // rather than read from `process.stdout` here — that is what makes this reporter testable
  // without a real TTY. Clamped so a narrow terminal never collapses the frame below something
  // drawable, and a wide one never stretches it across the whole screen.
  const width = Math.max(MIN_FRAME_WIDTH, Math.min(context.width, MAX_FRAME_WIDTH))
  const inner = width - 2

  // Column where a diagnostic's `line:col` starts (margin + glyph + gap), and where the concept
  // line and code-frame gutter beneath it align to. Derived from the glyph's actual display width
  // rather than assumed, so the ASCII fallback (one-column markers) lines up correctly too, not
  // just the two-column emoji set.
  const glyphWidth = displayWidth(glyph.error)
  const locationColumn = 4 + glyphWidth + 2
  const locationFieldWidth = 8
  const detailIndent = locationColumn + locationFieldWidth

  const frameRow = (content: string): string => `  ${box.v}${padEndDisplay(truncateEnd(content, inner), inner)}${box.v}`
  const frameTop = (): string => `  ${box.tl}${box.h.repeat(inner)}${box.tr}`
  const frameBottom = (): string => `  ${box.bl}${box.h.repeat(inner)}${box.br}`

  /**
   * Every printed unit (header, a file's group, one finding, one code frame, the footer) is
   * preceded by exactly one blank line and appends none of its own. That single rule is what
   * produces the whole rhythm of blank-line-separated blocks — no unit needs to know what came
   * before or after it, which matters because units are flushed incrementally as the run streams.
   */
  const writeUnit = (lines: readonly string[]): void => context.write(`\n${lines.join('\n')}\n`)

  // --- Header: printed synchronously, right here, before `streamCheck` has done any work at all —
  // as immediate as this process can make it, rather than waiting for the first diagnostic.
  {
    const left = `  ${logoMark}  slop-gate`
    const right = `v${context.version} `
    const gap = Math.max(1, inner - displayWidth(left) - displayWidth(right))
    writeUnit([frameTop(), frameRow(paint('bold', left) + ' '.repeat(gap) + right), frameBottom()])
  }

  // --- Per-file buffering. A file header shows that file's total finding count, which cannot be
  // known until every diagnostic for it has arrived — but engines visit files in inventory order
  // (see check.ts), so diagnostics for one file arrive contiguously in the stream. Buffering one
  // file at a time and flushing the instant a *different* file's diagnostic arrives (or the run
  // ends) still prints output progressively, file by file, well before the whole run finishes.
  // Findings are never reordered and never held back past the file they belong to.
  let pendingFile: string | null | undefined
  let pending: Diagnostic[] = []
  const framedConcepts = new Set<string>()

  const flushPending = (): void => {
    if (pendingFile === undefined || pending.length === 0) return
    writeFileGroup(pendingFile, pending)
    pending = []
    pendingFile = undefined
  }

  function writeFileGroup(file: string | null, diagnostics: readonly Diagnostic[]): void {
    const countText = String(diagnostics.length)
    const prefix = `  ${fileMark} `
    const maxHeadingWidth = Math.max(1, width - displayWidth(prefix) - displayWidth(countText) - 1)
    // Truncated from the left: the filename at the end of a long path matters more than its root.
    const heading = file === null ? CONFIG_HEADING : truncateStart(file, maxHeadingWidth)
    const left = prefix + heading
    const gap = Math.max(1, width - displayWidth(left) - displayWidth(countText))
    writeUnit([paint('bold', left) + ' '.repeat(gap) + countText])
    for (const diagnostic of diagnostics) writeFinding(diagnostic)
  }

  function writeFinding(diagnostic: Diagnostic): void {
    const location = `${diagnostic.position.startLine}:${diagnostic.position.startColumn}`
    const glyphText = paint(SEVERITY_STYLE[diagnostic.severity], glyph[diagnostic.severity])
    const locationField = padEndDisplay(location, locationFieldWidth)
    const detail = ' '.repeat(detailIndent)
    writeUnit([
      `    ${glyphText}  ${locationField}${diagnostic.message}`,
      `${detail}${paint('dim', diagnostic.concept)}`,
      ...(diagnostic.help === undefined ? [] : [`${detail}${paint('dim', `help: ${diagnostic.help}`)}`]),
    ])

    // `file: null` (an orchestrator-level diagnostic, e.g. `config.rule-overlap`) has nothing to
    // frame: there is no source to read. Code frames are also shown only once per (file, concept)
    // — the first occurrence — so two hundred findings sharing one concept do not print two
    // hundred near-identical frames; later findings still show location, message and concept.
    const file = diagnostic.file
    if (file === null) return
    const key = `${file} ${diagnostic.concept}`
    if (framedConcepts.has(key)) return
    framedConcepts.add(key)

    const source = context.readSource(file)
    if (source === null) return
    writeUnit(renderFrame(source, diagnostic.position, diagnostic.severity))
  }

  function renderFrame(source: string, position: Position, severity: Severity): [string, string] {
    const lines = source.split('\n')
    const lineText = (lines[position.startLine - 1] ?? '').replace(/\r$/, '')
    const gutter = String(position.startLine)
    const endColumn = position.endLine === position.startLine ? position.endColumn : lineText.length + 1
    const underlineWidth = Math.max(1, endColumn - position.startColumn)

    const marginPrefix = ' '.repeat(locationColumn)
    const codeLine = `${marginPrefix}${gutter} ${codeFrameBar}  ${lineText}`
    const underlineIndent = ' '.repeat(Math.max(0, position.startColumn - 1))
    const underline =
      `${marginPrefix}${' '.repeat(displayWidth(gutter))} ${codeFrameBar}  ${underlineIndent}` +
      paint(SEVERITY_STYLE[severity], codeFrameUnderline.repeat(underlineWidth))
    return [codeLine, underline]
  }

  const writeSummary = (result: CheckResult): void => {
    flushPending()

    for (const failure of result.engineFailures) {
      writeUnit([`  ${paint(['bgRed', 'white'], ' ENGINE FAILED ')} ${failure.engine}: ${failure.message}`])
    }

    const lines: string[] = []
    // Severity counts, not `result.diagnostics.length`: the two agree in every real run (`check.ts`
    // derives one from the other), but reading counts keeps this independent of whether a caller
    // populated the full `diagnostics` array — only the "Most frequent" block below actually needs
    // per-diagnostic concept data.
    const total = result.counts.error + result.counts.warn + result.counts.info

    if (total === 0) {
      lines.push(`  ${paint('green', checkMark)}  No issues found`)
    } else {
      const parts = SEVERITY_ORDER.filter((severity) => result.counts[severity] > 0).map((severity) =>
        paint(SEVERITY_STYLE[severity], `${glyph[severity]} ${plural(result.counts[severity], SEVERITY_NOUN[severity])}`),
      )
      lines.push(`  ${parts.join('    ')}`)
    }

    lines.push(
      `  ${paint('dim', `${plural(result.stats.filesScanned, 'file')}${statsSeparator}${result.stats.filesFromCache} cached${statsSeparator}${result.stats.durationMs} ms`)}`,
    )

    // A footer this size is only worth it once there is enough noise to triage: three lines of
    // "most frequent" concepts help on a two-hundred-finding run and are just clutter on three.
    if (total >= MOST_FREQUENT_THRESHOLD) {
      const counts = new Map<string, number>()
      for (const diagnostic of result.diagnostics) counts.set(diagnostic.concept, (counts.get(diagnostic.concept) ?? 0) + 1)
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MOST_FREQUENT_TOP_N)

      lines.push('  Most frequent')
      for (const [concept, count] of top) lines.push(`    ${padStartDisplay(String(count), 3)} ${multiplySign}  ${concept}`)
    }

    if (result.ruleset.suppressed > 0) {
      lines.push(
        `  ${paint('dim', `${plural(result.ruleset.suppressed, 'rule overlap')} resolved — run \`sgate rules conflicts\` for detail.`)}`,
      )
    }
    if (result.ruleset.uncovered.length > 0) {
      const count = result.ruleset.uncovered.length
      lines.push(
        `  ${paint('yellow', `${plural(count, 'enabled concept')} ${count === 1 ? 'has' : 'have'} no capable engine in this repo.`)}`,
      )
    }

    writeUnit([frameTop(), ...lines.map((line) => frameRow(line)), frameBottom()])
  }

  return {
    onEvent(event: CheckEvent) {
      if (event.type === 'diagnostic') {
        const diagnostic = event.diagnostic
        if (pendingFile === undefined) {
          pendingFile = diagnostic.file
          pending = [diagnostic]
        } else if (diagnostic.file === pendingFile) {
          pending.push(diagnostic)
        } else {
          flushPending()
          pendingFile = diagnostic.file
          pending = [diagnostic]
        }
      } else if (event.type === 'done') {
        writeSummary(event.result)
      }
    },
  }
}
