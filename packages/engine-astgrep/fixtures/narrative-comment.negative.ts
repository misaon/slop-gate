// Every comment below matched a candidate pattern that was measured out against 3,366 third-party
// files, and each one is a real phrase from that corpus or from this repository. They are the
// regression test for those measurements: a widened regex re-flags them.

// Note that we deliberately skip the cache here — 76 findings, all legitimate explanation.
export const a = 1

// As you can see, the order matters; here we sort before comparing.
export const b = 2

// First, we'll generate the key. Then, we'll generate a random initialization vector.
export const c = 3

// Notice that if both timers have the same timeout, insertion order decides.
export const d = 4

// This file provides a workaround for now.
export const e = 5

// Generate the SSR manifest for determining style links in production.
export const f = 6

// For testing purposes only.
export const g = 7

// This is a simplified version that only calls enter/leave callbacks.
export const h = 8

// This is an example of what *not* to do:
export const i = 9

// Tagged statements bind the placeholder values from the template literal as parameters.
export const j = 10

// If your data includes a suitable `.toString()` method, you can probably leave this undefined.
export const k = 11

// In a real `rules list` run this is the single most common row — a near-miss on "in a real X".
export const l = 12

// A placeholder path: naming a file that does not exist on disk is the bug this type prevents.
export const m = 13

// Imports a subcommand — in production that transitively loads the whole engine layer.
export const n = 14

// oxlint enables 114 rules by default regardless of the `categories` key being absent, confirmed
// against the real binary. Every real category must be turned off explicitly, or a rule the
// registry never elected still reports, bypassing arbitration.
export const o = 15
