import { statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export type ToolRoot = { readonly kind: 'ok'; readonly rootDir: string } | { readonly kind: 'refused'; readonly message: string }

export function resolveToolRoot(serverRoot: string, requested: string | undefined): ToolRoot {
  if (requested === undefined) return { kind: 'ok', rootDir: serverRoot }

  const rootDir = resolve(serverRoot, requested)
  const step = relative(serverRoot, rootDir)
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
