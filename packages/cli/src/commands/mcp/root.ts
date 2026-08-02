import { statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export type ToolRoot = { readonly kind: 'ok'; readonly rootDir: string } | { readonly kind: 'refused'; readonly message: string }

/**
 * Where a tool call is allowed to look.
 *
 * `sgate check --cwd /anywhere` is fine — a human typed it and meant it. The same argument reaching
 * a tool handler did not necessarily come from a human: it came from a model, which may have read it
 * out of a source file, a dependency's README or a commit message. So the MCP surface takes the
 * directory the server was launched in as its boundary and refuses anything outside it, rather than
 * inheriting the CLI's willingness to analyse an arbitrary path.
 *
 * **This is a guardrail, not a sandbox, and the difference is worth stating.** Containment is
 * checked on lexically resolved paths, so a symlink *inside* the root that points outside it is
 * followed like any other directory. That is deliberate rather than an oversight: the server already
 * runs with the user's own privileges and reads their files, so a real sandbox would have to be the
 * host's job, and half of one that resolved symlinks here would mostly serve to make the guard look
 * stronger than it is. What this does stop is the realistic accident — a `..` walk, an absolute path
 * from somewhere else in the conversation, a repository root the caller guessed at.
 */
export function resolveToolRoot(serverRoot: string, requested: string | undefined): ToolRoot {
  if (requested === undefined) return { kind: 'ok', rootDir: serverRoot }

  const rootDir = resolve(serverRoot, requested)
  const step = relative(serverRoot, rootDir)
  // `step === ''` is the root itself. A leading `..` segment (or, on Windows, an absolute result,
  // which is what `relative` returns for a different drive) means the path climbed out. Compared
  // against `'..' + sep` rather than a bare `startsWith('..')` so a directory legitimately named
  // `..cache` is not refused for its name.
  if (step !== '' && (step === '..' || step.startsWith(`..${sep}`) || isAbsolute(step))) {
    return {
      kind: 'refused',
      message:
        `rootDir must be inside the directory this server was started in (${serverRoot}), and \`${requested}\` resolves ` +
        `outside it. Start a second server there if you meant to analyse a different repository.`,
    }
  }

  let stats
  try {
    stats = statSync(rootDir)
  } catch {
    return { kind: 'refused', message: `rootDir does not exist: \`${requested}\` (resolved to ${rootDir}).` }
  }
  if (!stats.isDirectory()) return { kind: 'refused', message: `rootDir is not a directory: \`${requested}\` (resolved to ${rootDir}).` }

  return { kind: 'ok', rootDir }
}
