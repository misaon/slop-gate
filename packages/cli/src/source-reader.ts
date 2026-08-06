import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A reporter asks for a file's text to draw a code frame, and asks repeatedly for the same file. The map is
 * the caller's, because `streamCheck` fills it during the run and this only has to avoid reading twice what
 * it already holds. A file that cannot be read is `null` rather than an error: a missing source costs a code
 * frame, and a report is worth more than a crash.
 */
export function createSourceReader(rootDir: string, sources: Map<string, string>): (file: string | null) => string | null {
  return (file) => {
    if (file === null) return null
    const held = sources.get(file)
    if (held !== undefined) return held
    try {
      const content = readFileSync(join(rootDir, file), 'utf8')
      sources.set(file, content)
      return content
    } catch {
      return null
    }
  }
}
