import { compareStrings, type CheckEvent, type CheckResult, type Diagnostic, type MeasuredPhase, type Position, type Severity } from '@misaon/slop-gate-core'
import { displayWidth, padEndDisplay, padStartDisplay, truncateStart } from './display-width.ts'
import { createFrameKit, plural } from './box.ts'
import { SEVERITY_GLYPH, SEVERITY_GLYPH_ASCII, SEVERITY_NOUN, SEVERITY_ORDER, SEVERITY_STYLE } from './severity.ts'
import { wrapText } from './wrap-text.ts'
import type { Reporter, ReporterContext } from './index.ts'

const CONFIG_HEADING = '(configuration)'
const MOST_FREQUENT_THRESHOLD = 10
const MOST_FREQUENT_TOP_N = 3
/** `--timing`'s per-rule list is capped: a hundred rules can fire and the terminal is the wrong place to read
 *  all of them, so the block names the top offenders and points at the format that carries every one. */
const TIMING_RULES_TOP_N = 10
/**
 * A phase is printed when it is worth either of these; the rest are summed into one labelled row, since most
 * of a cold run's ~50 phases are under a millisecond and a list that long buries the rows that answer "why
 * did this take a minute?". Folded rather than dropped, so the column still adds up to the total.
 *
 * **Two criteria, because each is blind in the regime the other covers.** A share alone hides our own work
 * exactly when an engine dominates — `run:tsc` at 83% of a cold run puts the 26 ms inventory walk under 0.5%
 * and drops the row a reader asked for. An absolute floor alone is meaningless on a 140 ms warm run, where
 * 10 ms is 7% of everything.
 */
const TIMING_PHASE_MIN_SHARE = 0.005
const TIMING_PHASE_MIN_MS = 10

export function createPrettyReporter(context: ReporterContext): Reporter {
  const unicode = context.unicode
  const { width, inner, paint, frameTop, frameRow, frameBottom, writeUnit } = createFrameKit(context)
  const glyph = unicode ? SEVERITY_GLYPH : SEVERITY_GLYPH_ASCII
  const fileMark = unicode ? '▌' : '>'
  const logoMark = unicode ? '◆' : '*'
  const checkMark = unicode ? '✓' : 'OK'
  // One column in both modes, like `checkMark`: it sits inside the footer frame, where a miscounted column
  // shifts the closing border.
  const gapMark = unicode ? '▲' : '!'
  const codeFrameBar = unicode ? '│' : '|'
  const codeFrameUnderline = unicode ? '━' : '^'
  const multiplySign = unicode ? '×' : 'x'
  const statsSeparator = unicode ? ' · ' : ' | '

  // Column where a diagnostic's `line:col` starts (margin + glyph + gap), and where the concept line and
  // code-frame gutter beneath it align to. Derived from the glyph's actual display width rather than assumed,
  // so the ASCII fallback's one-column markers line up too, not just the two-column emoji set.
  const glyphWidth = displayWidth(glyph.error)
  const locationColumn = 4 + glyphWidth + 2
  const locationFieldWidth = 8
  const detailIndent = locationColumn + locationFieldWidth

  // The frame width the header and footer draw to, minus the hanging indent the message column sits at. The
  // `Math.max(1, ...)` only matters at pathological widths — the 60-column clamp floor keeps this comfortably
  // positive — but a 0 or negative budget would be a nonsensical wrap target to hand `wrapText`.
  const messageWidth = Math.max(1, width - detailIndent)

  // --- Header: printed synchronously here, before `streamCheck` has done any work at all.
  {
    const left = `  ${logoMark}  slop-gate`
    const right = `v${context.version} `
    const gap = Math.max(1, inner - displayWidth(left) - displayWidth(right))
    writeUnit([frameTop(), frameRow(paint('bold', left) + ' '.repeat(gap) + right), frameBottom()])
  }

  // --- Per-file buffering. A file header shows that file's total finding count, which cannot be known until
  // every diagnostic for it has arrived — but engines visit files in inventory order (see check.ts), so one
  // file's diagnostics arrive contiguously. Buffering one file at a time and flushing the instant a
  // *different* file's diagnostic arrives still prints progressively, and findings are never reordered nor
  // held back past the file they belong to.
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
    // Wrapped on plain text and only then assembled into lines, per `wrapText`'s contract: painting first
    // would let one escape sequence's start and end land on two different lines.
    const [firstLine, ...continuationLines] = wrapText(diagnostic.message, messageWidth)
    writeUnit([
      `    ${glyphText}  ${locationField}${firstLine}`,
      ...continuationLines.map((line) => `${detail}${line}`),
      `${detail}${paint('dim', diagnostic.concept)}`,
      ...(diagnostic.help === undefined ? [] : [`${detail}${paint('dim', `help: ${diagnostic.help}`)}`]),
    ])

    // `file: null` (an orchestrator-level diagnostic, e.g. `config.rule-overlap`) has no source to frame. A
    // frame is also shown only once per (file, concept), so two hundred findings sharing one concept do not
    // print two hundred near-identical frames; later findings still show location, message and concept.
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

  /**
   * Packed across as many footer lines as the cells need, rather than joined and left to `frameRow`, which
   * truncates to the frame's inner width: the engines this block exists to name are the ones with the fewest
   * hits, they sort last, and truncation would drop exactly them. The budget subtracts the caller's own
   * two-space indent as well as the label, so a cell can never land in the border column at
   * `MIN_FRAME_WIDTH`.
   */
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

    // An engine that is absent but would have owned nothing here is filtered out, not softened: arbitration
    // gave it no concept to lose, so a banner claiming a gap would be false. See `UnavailableEngine.displaced`.
    const gaps = result.unavailableEngines.filter((engine) => engine.displaced.length > 0)
    for (const gap of gaps) {
      writeUnit([
        `  ${paint(['bgYellow', 'black'], ' COVERAGE GAP ')} ${gap.engine} could not run here — ${gap.reason}`,
        `    ${paint('yellow', `${plural(gap.displaced.length, 'concept')} went unchecked or to a lower-ranked rule.`)}` +
          (gap.install === undefined ? '' : ` ${paint('yellow', `Resolve it with \`${gap.install}\`.`)}`),
      ])
    }

    const lines: string[] = []
    // Severity counts, not `result.diagnostics.length`: the two agree in every real run (`check.ts` derives
    // one from the other), but reading counts keeps this independent of whether a caller populated the full
    // `diagnostics` array — only the "Most frequent" block below needs per-diagnostic data.
    const total = result.counts.error + result.counts.warn + result.counts.info

    const accepted = result.baseline?.accepted ?? 0

    if (total === 0) {
      // The green tick is the one line a reader takes at a glance, so it is withheld the moment an engine
      // could not run: "No issues found" alone would be true of the engines that ran and false of the
      // repository. A baseline that accepted findings withholds it for the same reason, and the clauses
      // compose because both causes can hold at once — kept short so both still fit what `frameRow`
      // truncates to at width 80.
      const caveats: string[] = []
      if (gaps.length > 0) caveats.push(`${plural(gaps.length, 'engine')} could not run`)
      if (accepted > 0) caveats.push(`${plural(accepted, 'baselined finding')}`)
      lines.push(
        caveats.length === 0
          ? `  ${paint('green', checkMark)}  No issues found`
          : `  ${paint('yellow', `${gapMark}  No issues found, but ${caveats.join(' and ')}`)}`,
      )
    } else {
      // Text only, no severity glyph: unlike the open body's per-finding glyph (`writeFinding`), this line
      // sits inside the footer's frame, where a one-column miscount shifts the closing border. See
      // `SEVERITY_GLYPH` and `hasWideOrFullwidthCharacter`.
      const parts = SEVERITY_ORDER.filter((severity) => result.counts[severity] > 0).map((severity) =>
        paint(SEVERITY_STYLE[severity], plural(result.counts[severity], SEVERITY_NOUN[severity])),
      )
      lines.push(`  ${parts.join('    ')}`)
    }

    // Three honest numbers, not two: `filesScanned` includes every file the walker found, most of which no
    // engine covers at all (a .json, a .md, a lockfile) and so were never candidates for caching. Reporting
    // only "scanned" and "cached" reads as if the gap between them were files the cache failed on;
    // `filesAnalysed` — files actually assigned to an engine — names that gap honestly. When every analysed
    // file came from the cache (including the vacuous case of zero analysed files), folding the two into one
    // clause says so without printing the same number twice.
    const { filesScanned, filesAnalysed, filesFromCache, cacheByEngine, durationMs } = result.stats
    const analysedPart =
      filesAnalysed === 0
        ? `${filesAnalysed} analysed`
        : filesAnalysed === filesFromCache
          ? `${filesAnalysed} analysed (all cached)`
          : `${filesAnalysed} analysed${statsSeparator}${filesFromCache} cached`
    lines.push(`  ${paint('dim', `${filesScanned} scanned${statsSeparator}${analysedPart}${statsSeparator}${durationMs} ms`)}`)

    // `filesFromCache` above requires every engine that claimed a file to have hit, so a single whole-program
    // engine invalidating on any edit takes it to near zero while the per-file engines were served nearly
    // everything (`353 analysed · 3 cached`, with 351 of 353 hitting for two of four engines). Shown exactly
    // when that is happening: the condition is that some engine's own coverage *exceeds* the aggregate, which
    // is false on a cold run (every engine at zero) and on a fully warm one (nothing to add).
    if (cacheByEngine.some((engine) => engine.filesFromCache > filesFromCache)) {
      const ranked = [...cacheByEngine].sort((a, b) => b.filesFromCache - a.filesFromCache || compareStrings(a.engine, b.engine))
      for (const line of packCacheCells(ranked.map((engine) => `${engine.engine} ${engine.filesFromCache}/${engine.filesAssigned}`))) {
        lines.push(`  ${paint('dim', line)}`)
      }
    }

    // Only worth the footer space once there is enough noise to triage: three "most frequent" lines help on a
    // two-hundred-finding run and are clutter on three.
    if (total >= MOST_FREQUENT_THRESHOLD) {
      const counts = new Map<string, number>()
      for (const diagnostic of result.diagnostics) counts.set(diagnostic.concept, (counts.get(diagnostic.concept) ?? 0) + 1)
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MOST_FREQUENT_TOP_N)

      lines.push('  Most frequent')
      for (const [concept, count] of top) lines.push(`    ${padStartDisplay(String(count), 3)} ${multiplySign}  ${concept}`)
    }

    // Printed on every run that read a baseline, including one that accepted nothing: the absence of a notice
    // must never be how a reader learns whether a baseline is in force.
    if (result.baseline !== null) {
      const { path, entries, stale } = result.baseline
      lines.push(
        accepted === 0
          ? `  ${paint('dim', `${path} holds ${plural(entries, 'finding')}, none found here`)}`
          : `  ${paint('yellow', `${path} accepted ${plural(accepted, 'finding')}, not counted above`)}`,
      )
      // Stale entries are the only evidence a baseline is shrinking rather than turning into permanent debt.
      // Reported, **never pruned here** — `sgate check` does not write, so the entry survives until someone
      // decides to remove it.
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

  /**
   * `--timing` (spec §12.4), printed under the footer rather than inside it: `frameRow` truncates to the
   * frame's inner width, and this block is the one place where the longest names are the rows a reader asked
   * for. Absent unless `CheckOptions.timing` collected a report, which is what keeps a plain `sgate check`
   * output byte-for-byte what it was.
   */
  function writeTimings(result: CheckResult): void {
    const report = result.timings
    if (report === undefined) return
    const total = result.stats.durationMs

    const isLarge = (phase: MeasuredPhase): boolean =>
      total <= 0 || phase.durationMs >= TIMING_PHASE_MIN_MS || phase.durationMs / total >= TIMING_PHASE_MIN_SHARE
    const large = report.phases.filter(isLarge)
    const folded = report.phases.filter((phase) => !isLarge(phase))
    const rows: Array<{ name: string; durationMs: number; count: number }> = [
      // First and last, in the order the run happened: `startup` is over before core is called and
      // `unattributed` is settled last, so bracketing the engine work with them makes the column read as an
      // account of the whole run rather than a ranking with two oddities in it.
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
      // Omitted rather than shown as `Infinity%` when the run rounded to nothing: a share of zero is not a
      // measurement, and the millisecond column still says everything it can.
      const share = total <= 0 ? '' : `${((row.durationMs / total) * 100).toFixed(1)}%`
      const spans = row.count > 1 ? `  ${multiplySign}${row.count}` : ''
      lines.push(
        `    ${padEndDisplay(row.name, nameWidth)}  ${padStartDisplay(row.durationMs.toFixed(1), 7)} ms  ` +
          `${paint('dim', padStartDisplay(share, 6) + spans)}`,
      )
    }
    // The two rows core measured but cannot itemise, said out loud: either can be the largest number in the
    // table on a warm run, and a reader who takes them for engine work will tune the wrong thing.
    for (const note of [
      'startup is node boot, the module graph and config load, before core ran.',
      "unattributed is orchestration and this reporter's own time between yields.",
      '`--format=json` carries every phase and every rule, uncapped.',
    ]) {
      // Wrapped to the frame's own right edge so the note sits under the table rather than past it.
      for (const line of wrapText(note, Math.max(1, width - 2))) lines.push(`    ${paint('dim', line)}`)
    }
    writeUnit(lines)

    if (report.rules.length === 0) return
    const shown = report.rules.slice(0, TIMING_RULES_TOP_N)
    const omitted = report.rules.length - shown.length
    // Named a count in the heading because this is the one column of `--timing` that is not a duration and
    // could be misread as one — see `RuleFindings` in core for why it cannot be.
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

/**
 * The one line a code frame shows, without materialising the other n-1: `source.split('\n')` allocated an array
 * of every line in the file to read one element of it, once per *frame* rather than once per file. Justified on
 * allocation, not on a demonstrated time win — the wall-clock difference was inside the noise.
 *
 * The repeated *read* behind it is fixed upstream instead, which is where it belonged: the CLI shares one map
 * with `streamCheck` (see `CheckOptions.sources`), so a file is read once per run whether an engine or a code
 * frame asked for it first.
 */
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
