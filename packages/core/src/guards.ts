/**
 * Whether a plain string is one of a known set, narrowing it to that set's member type.
 *
 * **The cast this replaces was not incidental.** `Array<T>.includes` takes a `T`, so
 * `REPORTER_NAMES.includes(format)` will not compile for a `string` — and the shortest way to make it
 * compile is `includes(format as ReporterName)`, which asserts the very thing being tested and then
 * throws the answer away: the surviving branch still has a bare `string`, so every later use needs its
 * own cast. A predicate does the same test and keeps the result, so the checked branch is typed.
 */
export function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value)
}
