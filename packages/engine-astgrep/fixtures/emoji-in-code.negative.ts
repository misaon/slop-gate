// Every literal below is a character `\p{Emoji}` wrongly reports as an emoji, or one that renders
// as text by default. Reproduced: the naive property flags the first four outright.
export const numbered = '#1 and *2 and 3'
export const temperature = '25°C'
export const price = '€100'
export const compare = 'x ≤ y'
export const trademark = 'Acme™'
export const tick = '✓ ok'
export const arrow = '→ next'
export const frame = '╭──╮'
export const bar = '▌'
export const plain = 'no glyphs at all'
// 🎉 An emoji in a comment is documentation, which spec §14 excludes by name.
export const commented = 'plain'
