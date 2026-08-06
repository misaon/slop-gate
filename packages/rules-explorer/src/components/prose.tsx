import type { ComponentChildren } from 'preact'

/**
 * The withheld reasons are long prose written in commit-message markdown. Rendering the source shows
 * its asterisks and backticks; this reads the two spellings that actually appear and nothing else,
 * building vnodes rather than HTML so there is no way for the text to inject markup.
 */
// Bold is matched first and code within it, because a bold run routinely spans a code span
// (`**and iterates a workflow's jobs over \`Jobs map[string]*Job\`, whose order Go randomises**`).
const BOLD = /(\*\*[\s\S]+?\*\*)/g
const CODE = /(`[^`]+`)/g

function code(text: string, keyPrefix: string): ComponentChildren[] {
  return text.split(CODE).map((part, index) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={`${keyPrefix}-${index}`} class="rounded bg-ink-950/70 px-1 py-0.5 text-[0.85em] text-ink-100">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  )
}

function inline(text: string): ComponentChildren[] {
  return text.split(BOLD).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={index} class="font-semibold text-ink-100">
        {code(part.slice(2, -2), `b${index}`)}
      </strong>
    ) : (
      code(part, `t${index}`)
    ),
  )
}

export function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim() !== '')
  return (
    <div class="max-w-[80ch] space-y-2">
      {paragraphs.map((paragraph, index) => (
        <p key={index} class="leading-relaxed">
          {inline(paragraph)}
        </p>
      ))}
    </div>
  )
}
