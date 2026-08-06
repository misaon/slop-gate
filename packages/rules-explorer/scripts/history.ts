import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * `RuleEntry.since` is the version the registry was generated at — the same string on all 923 rules,
 * so it cannot answer "what did upgrading oxlint add". Git can: the registry files are generated, so
 * the commit that first contains a rule is the commit that introduced it.
 */
const REGISTRY_FILES = [
  'packages/core/src/registry/entries.generated.ts',
  'packages/core/src/registry/entries.uncatalogued.ts',
]

const RULE_PATTERN = /engine: '([^']+)',\s*\n\s*engineRuleId: '([^']+)'/g

type RuleOrigin = {
  readonly commit: string
  readonly date: string
  readonly subject: string
}

export type RuleHistory = {
  readonly origins: Readonly<Record<string, RuleOrigin>>
  /** Rules present in an earlier commit and gone from HEAD — an upgrade that dropped a rule. */
  readonly removed: readonly { readonly ruleRefKey: string; readonly lastSeen: RuleOrigin }[]
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await run('git', [...args], { cwd, maxBuffer: 256 * 1024 * 1024 })
  return stdout
}

function rulesIn(source: string): Set<string> {
  const found = new Set<string>()
  for (const match of source.matchAll(RULE_PATTERN)) found.add(`${match[1]}/${match[2]}`)
  return found
}

export async function buildRuleHistory(repoRoot: string): Promise<RuleHistory> {
  const log = await git(['log', '--format=%H\t%ad\t%s', '--date=short', '--reverse', '--', ...REGISTRY_FILES], repoRoot)
  const commits = log
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [commit = '', date = '', ...rest] = line.split('\t')
      return { commit, date, subject: rest.join('\t') }
    })

  const origins: Record<string, RuleOrigin> = {}
  const lastSeen = new Map<string, RuleOrigin>()
  let present = new Set<string>()

  for (const entry of commits) {
    const sources = await Promise.all(
      REGISTRY_FILES.map((file) => git(['show', `${entry.commit}:${file}`], repoRoot).catch(() => '')),
    )
    present = new Set(sources.flatMap((source) => [...rulesIn(source)]))
    const origin: RuleOrigin = { commit: entry.commit.slice(0, 8), date: entry.date, subject: entry.subject }
    for (const rule of present) {
      origins[rule] ??= origin
      lastSeen.set(rule, origin)
    }
  }

  const removed = [...lastSeen]
    .filter(([rule]) => !present.has(rule))
    .map(([ruleRefKey, origin]) => ({ ruleRefKey, lastSeen: origin }))
    .sort((a, b) => a.ruleRefKey.localeCompare(b.ruleRefKey))

  return { origins, removed }
}
