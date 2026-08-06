import { paragraphsOf, tokenise } from '../markdown.ts'

export function Prose({ text }: { text: string }) {
  return (
    <div class="max-w-[80ch] space-y-2">
      {paragraphsOf(text).map((paragraph, index) => (
        <p key={index} class="leading-relaxed">
          {tokenise(paragraph).map((token, position) =>
            token.kind === 'code' ? (
              <code
                key={position}
                class={`rounded bg-ink-950/70 px-1 py-0.5 text-[0.85em] ${token.bold ? 'font-semibold text-ink-100' : 'text-ink-100'}`}
              >
                {token.value}
              </code>
            ) : token.bold ? (
              <strong key={position} class="font-semibold text-ink-100">
                {token.value}
              </strong>
            ) : (
              token.value
            ),
          )}
        </p>
      ))}
    </div>
  )
}
