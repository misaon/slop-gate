// Proves the `language: JavaScript` document exists. `language: TypeScript` matches .ts/.mts/.cts
// and nothing else, so without this document every .js and .jsx file in a repository would be
// scanned and silently found clean.
export function empty() {
  try {
    work()
  } catch (error) { // SLOP_HIT
  }
}
