// SLOP_HIT: In a real implementation, this would call the payments API.
export const charge = () => 0

/* SLOP_HIT
 * This is a placeholder until the real service lands.
 */
export const lookup = () => null

// SLOP_HIT — placeholder implementation, replace before shipping
export const encode = (input: string) => input

// SLOP_HIT: error handling omitted for brevity
export const parse = (input: string) => JSON.parse(input)

// SLOP_HIT: in a real application you would read this from configuration
export const timeout = 30_000

// SLOP_HIT: your persistence layer would go here
export const save = () => undefined

// SLOP_HIT: shown for demonstration purposes only
export const demo = () => 1

// SLOP_HIT: in practice, you would validate the payload first
export const accept = (payload: unknown) => payload

// SLOP_HIT: the actual implementation would batch these
export const send = () => undefined

// SLOP_HIT: replace these with your own credentials
export const credentials = { id: '', secret: '' }

// SLOP_HIT: you would typically inject this
export const clock = () => Date.now()
