import { compareStrings, type CheckEvent, type CheckResult, type Diagnostic, type MeasuredPhase, type Position, type Severity } from '@misaon/slop-gate-core'
import { displayWidth, padEndDisplay, padStartDisplay, truncateStart } from './display-width.ts'
import { brandHeader, createFrameKit, plural } from './box.ts'
import { SEVERITY_GLYPH, SEVERITY_GLYPH_ASCII, SEVERITY_NOUN, SEVERITY_ORDER, SEVERITY_STYLE } from './severity.ts'
import { wrapText } from './wrap-text.ts'
import type { Reporter, ReporterContext } from './index.ts'

const CONFIG_HEADING = '(configuration)'
const MOST_FREQUENT_THRESHOLD = 10
const MOST_FREQUENT_TOP_N = 3
const TIMING_RULES_TOP_N = 10
const TIMING_PHASE_MIN_SHARE = 0.005
const TIMING_PHASE_MIN_MS = 10

export function createPrettyReporter(context: ReporterContext): Reporter {
  const unicode = context.unicode
  const kit = createFrameKit(context)
  const { width, paint, frameTop, frameRow, frameBottom, writeUnit } = kit
  const glyph = unicode ? SEVERITY_GLYPH : SEVERITY_GLYPH_ASCII
  const fileMark = unicode ? '▌' : '>'
  const checkMark = unicode ? '✓' : 'OK'
  const gapMark = unicode ? '▲' : '!'
  const codeFrameBar = unicode ? '│' : '|'
  const codeFrameUnderline = unicode ? '━' : '^'
  const multiplySign = unicode ? '×' : 'x'
  const statsSeparator = unicode ? ' · ' : ' | '

  const glyphWidth = displayWidth(glyph.error)
  const locationColumn = 4 + glyphWidth + 2
  const locationFieldWidth = 8
  const detailIndent = locationColumn + locationFieldWidth

  const messageWidth = Math.max(1, width - detailIndent)

  writeUnit(brandHeader(kit, context.version))

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
    const [firstLine, ...continuationLines] = wrapText(diagnostic.message, messageWidth)
    writeUnit([
      `    ${glyphText}  ${locationField}${firstLine}`,
      ...continuationLines.map((line) => `${detail}${line}`),
      `${detail}${paint('dim', diagnostic.concept)}`,
      ...(diagnostic.help === undefined ? [] : [`${detail}${paint('dim', `help: ${diagnostic.help}`)}`]),
    ])

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
    const lineText = lineAt(source, position.startLine).replace(/\r$/, '')
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

  const packCacheCells = (cells: readonly string[]): string[] => {
    const label = 'cache  '
    const continuation = ' '.repeat(displayWidth(label))
    const budget = Math.max(1, width - 4 - displayWidth(label))
    const packed: string[] = []
    let current = ''
    for (const cell of cells) {
      const candidate = current === '' ? cell : `${current}${statsSeparator}${cell}`
      if (current !== '' && displayWidth(candidate) > budget) {
        packed.push(current)
        current = cell
      } else current = candidate
    }
    if (current !== '') packed.push(current)
    return packed.map((line, index) => `${index === 0 ? label : continuation}${line}`)
  }

  const writeSummary = (result: CheckResult): void => {
    flushPending()

    for (const failure of result.engineFailures) {
      writeUnit([`  ${paint(['bgRed', 'white'], ' ENGINE FAILED ')} ${failure.engine}: ${failure.message}`])
    }

    const gaps = result.unavailableEngines.filter((engine) => engine.displaced.length > 0)
    for (const gap of gaps) {
      writeUnit([
        `  ${paint(['bgYellow', 'black'], ' COVERAGE GAP ')} ${gap.engine} could not run here — ${gap.reason}`,
        `    ${paint('yellow', `${plural(gap.displaced.length, 'concept')} went unchecked or to a lower-ranked rule.`)}` +
          (gap.install === undefined ? '' : ` ${paint('yellow', `Resolve it with \`${gap.install}\`.`)}`),
      ])
    }

    const lines: string[] = []
    const total = result.counts.error + result.counts.warn + result.counts.info

    const accepted = result.baseline?.accepted ?? 0

    if (total === 0) {
      const caveats: string[] = []
      if (gaps.length > 0) caveats.push(`${plural(gaps.length, 'engine')} could not run`)
      if (accepted > 0) caveats.push(`${plural(accepted, 'baselined finding')}`)
      lines.push(
        caveats.length === 0
          ? `  ${paint('green', checkMark)}  No issues found`
          : `  ${paint('yellow', `${gapMark}  No issues found, but ${caveats.join(' and ')}`)}`,
      )
    } else {
      const parts = SEVERITY_ORDER.filter((severity) => result.counts[severity] > 0).map((severity) =>
        paint(SEVERITY_STYLE[severity], plural(result.counts[severity], SEVERITY_NOUN[severity])),
      )
      lines.push(`  ${parts.join('    ')}`)
    }

    const { filesScanned, filesAnalysed, filesFromCache, cacheByEngine, durationMs } = result.stats
    const analysedPart =
      filesAnalysed === 0
        ? `${filesAnalysed} analysed`
        : filesAnalysed === filesFromCache
          ? `${filesAnalysed} analysed (all cached)`
          : `${filesAnalysed} analysed${statsSeparator}${filesFromCache} cached`
    lines.push(`  ${paint('dim', `${filesScanned} scanned${statsSeparator}${analysedPart}${statsSeparator}${durationMs} ms`)}`)

    if (cacheByEngine.some((engine) => engine.filesFromCache > filesFromCache)) {
      const ranked = [...cacheByEngine].sort((a, b) => b.filesFromCache - a.filesFromCache || compareStrings(a.engine, b.engine))
      for (const line of packCacheCells(ranked.map((engine) => `${engine.engine} ${engine.filesFromCache}/${engine.filesAssigned}`))) {
        lines.push(`  ${paint('dim', line)}`)
      }
    }

    if (total >= MOST_FREQUENT_THRESHOLD) {
      const counts = new Map<string, number>()
      for (const diagnostic of result.diagnostics) counts.set(diagnostic.concept, (counts.get(diagnostic.concept) ?? 0) + 1)
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MOST_FREQUENT_TOP_N)

      lines.push('  Most frequent')
      for (const [concept, count] of top) lines.push(`    ${padStartDisplay(String(count), 3)} ${multiplySign}  ${concept}`)
    }

    if (result.baseline !== null) {
      const { path, entries, stale } = result.baseline
      lines.push(
        accepted === 0
          ? `  ${paint('dim', `${path} holds ${plural(entries, 'finding')}, none found here`)}`
          : `  ${paint('yellow', `${path} accepted ${plural(accepted, 'finding')}, not counted above`)}`,
      )
      if (stale.length > 0) {
        lines.push(
          `  ${paint('dim', `${plural(stale.length, 'accepted finding')} are fixed — run \`sgate baseline update\``)}`,
        )
      }
    }
    if (result.ruleset.overlaps > 0) {
      lines.push(
        `  ${paint('dim', `${plural(result.ruleset.overlaps, 'rule overlap')} resolved — run \`sgate rules conflicts\` for detail.`)}`,
      )
    }
    if (result.ruleset.uncovered.length > 0) {
      const count = result.ruleset.uncovered.length
      lines.push(
        `  ${paint('yellow', `${plural(count, 'enabled concept')} ${count === 1 ? 'has' : 'have'} no capable engine in this repo.`)}`,
      )
    }

    writeUnit([frameTop(), ...lines.map((line) => frameRow(line)), frameBottom()])
    writeTimings(result)
  }

  function writeTimings(result: CheckResult): void {
    const report = result.timings
    if (report === undefined) return
    const total = result.stats.durationMs

    const isLarge = (phase: MeasuredPhase): boolean =>
      total <= 0 || phase.durationMs >= TIMING_PHASE_MIN_MS || phase.durationMs / total >= TIMING_PHASE_MIN_SHARE
    const large = report.phases.filter(isLarge)
    const folded = report.phases.filter((phase) => !isLarge(phase))
    const rows: Array<{ name: string; durationMs: number; count: number }> = [
      { name: 'startup', durationMs: report.startupMs, count: 1 },
      ...large,
      ...(folded.length === 0
        ? []
        : [{ name: plural(folded.length, 'smaller phase'), durationMs: folded.reduce((sum, phase) => sum + phase.durationMs, 0), count: 1 }]),
      { name: 'unattributed', durationMs: report.unattributedMs, count: 1 },
    ]

    const nameWidth = Math.max(...rows.map((row) => displayWidth(row.name)))
    const lines = [`  ${paint('bold', 'timing')}${statsSeparator}${total} ms total`]
    for (const row of rows) {
      const share = total <= 0 ? '' : `${((row.durationMs / total) * 100).toFixed(1)}%`
      const spans = row.count > 1 ? `  ${multiplySign}${row.count}` : ''
      lines.push(
        `    ${padEndDisplay(row.name, nameWidth)}  ${padStartDisplay(row.durationMs.toFixed(1), 7)} ms  ` +
          `${paint('dim', padStartDisplay(share, 6) + spans)}`,
      )
    }
    const attributed = report.phases.reduce((sum, phase) => sum + phase.durationMs, 0)
    for (const note of [
      'startup is node boot, the module graph and config load, before core ran.',
      "unattributed is orchestration and this reporter's own time between yields.",
      ...(attributed > report.busyMs + 1
        ? [
            `engines run concurrently, so the phases overlap and their shares sum above 100%. They ` +
              `occupied ${report.busyMs.toFixed(1)} ms of wall clock between them.`,
          ]
        : []),
      '`--format=json` carries every phase and every rule, uncapped.',
    ]) {
      for (const line of wrapText(note, Math.max(1, width - 2))) lines.push(`    ${paint('dim', line)}`)
    }
    writeUnit(lines)

    if (report.rules.length === 0) return
    const shown = report.rules.slice(0, TIMING_RULES_TOP_N)
    const omitted = report.rules.length - shown.length
    const ruleLines = [`  ${paint('bold', 'findings by rule')}${statsSeparator}${paint('dim', 'a count: no engine reports per-rule time')}`]
    const keyWidth = Math.max(1, width - 8)
    for (const rule of shown) {
      ruleLines.push(`    ${padStartDisplay(String(rule.findings), 4)}  ${truncateStart(rule.ruleRefKey, keyWidth)}`)
    }
    if (omitted > 0) ruleLines.push(`    ${paint('dim', plural(omitted, 'more rule'))}`)
    writeUnit(ruleLines)
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

function lineAt(source: string, line: number): string {
  let start = 0
  for (let seen = 1; seen < line; seen += 1) {
    const next = source.indexOf('\n', start)
    if (next === -1) return ''
    start = next + 1
  }
  const end = source.indexOf('\n', start)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}
