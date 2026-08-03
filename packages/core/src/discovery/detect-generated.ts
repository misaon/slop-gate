/**
 * A `.gen.` or `.generated.` segment immediately before the extension, or a `__generated__`
 * directory. Deliberately a *marker* rather than a guess: nobody names a hand-written file
 * `client.gen.ts`, and every one of these spellings is a convention a code generator writes on
 * purpose. `src/generator.ts` and `src/generated.ts` are not markers and must not match, which is
 * what the `.` on both sides is for.
 */
const GENERATED_PATH_MARKERS = /(^|\/)__generated__\/|\.(gen|generated)\.[^/]+$/

/**
 * True when nothing a human wrote lives at `path`, so a finding there is unactionable whether or not
 * it is correct: the fix would be overwritten by the next run of the generator, and the defect — if
 * there is one — belongs to the generator's template rather than to this repository.
 *
 * Measured on a 145k-line React monorepo: **164 findings in 25 generated files**, 23% of everything
 * left after the React false positives were removed. `@hey-api/openapi-ts` output accounts for all
 * of them, across five API packages, and the largest contributors are the ones that would be
 * genuinely worth fixing in hand-written code — 59 unused exports, 45 unused exported types, 30
 * `as any` casts.
 *
 * **`.d.ts` is deliberately not a marker, and that is the whole reason this is a path predicate
 * rather than a `*.d.ts` glob in the default ignore set.** The same measurement had 18 findings in
 * 14 `.d.ts` files, and not one was generated: `nextAuth.d.ts`, `notistack.d.ts`, `mui.d.ts`,
 * `global.d.ts` and `react.d.ts` are hand-written module augmentations, and their findings are a
 * separate question with a separate answer. A declaration file is generated about as often as it is
 * typed by hand, so its extension carries no information; a `.gen.` in its name does, which is why
 * `types.gen.d.ts` still matches.
 *
 * Under-inclusive on purpose. A generated file this misses leaves a visible finding the user can act
 * on; a hand-written file this wrongly claims loses its coverage in silence, and only the second
 * failure is invisible. That is why a bare `generated/` directory segment is not a marker and
 * `__generated__` is.
 */
export function isGeneratedPath(path: string): boolean {
  return GENERATED_PATH_MARKERS.test(path)
}
