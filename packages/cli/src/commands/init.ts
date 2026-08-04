import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { buildWorkspaceGraph } from '@misaon/slop-gate-core'
import { upsertAgentsSection } from '../agents-md.ts'
import { resolveRootDir } from '../root-dir.ts'

const CONFIG_TEMPLATE = `import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  extends: ['recommended'],
})
`

const AGENTS_BODY = `## Code quality gate

This repository uses [slop-gate](https://github.com/misaon/slop-gate).

- \`sgate check\` — analyse the repository. Run it before you finish a task.
- \`sgate check --format agent\` — the same findings in a form optimised for you: grouped by fix
  strategy, split into what \`sgate fix\` rewrites and what needs your judgement. Add
  \`--max-tokens <n>\` to bound it; it always states what the bound dropped.
- \`sgate fix\` — apply the fixes slop-gate trusts. \`--dry-run\` prints the diff instead.
  Do not hand-edit a finding the agent report lists under \`automated\`; run this instead.

Rules are configured by *concept* (for example \`dead-code.unused-import\`) in
\`slop-gate.config.ts\`, not by engine-specific rule names. Do not add engine config files such as
\`.eslintrc\`, \`eslint.config.js\` or \`.oxlintrc.json\` — slop-gate owns the ruleset, and a
competing config file will be ignored.
`

/**
 * `.slop-gate/` holds the cache and the engines' scratch directory, neither of which belongs in git — hence `*`.
 * Two files have to be named as exceptions, because `*` matches them too: **`.gitignore` itself**, or `sgate
 * init`'s own output cannot be committed and every teammate's first run re-creates it untracked; and
 * **`baseline.json`**, because a baseline that is not committed is not a baseline — CI clones the repository and
 * would read none, so the build a team just agreed to make green fails on the first push. `sgate baseline create`
 * checks this negation is present and says so when it is not.
 */
export const SLOP_GATE_GITIGNORE = '*\n!.gitignore\n!baseline.json\n'

const readIfPresent = async (path: string): Promise<string | null> =>
  readFile(path, 'utf8').then(
    (content) => content,
    () => null,
  )

/**
 * `slop-gate.config.ts` is ESM. Without `"type": "module"` in the target's `package.json`, Node tries to load it
 * as CommonJS first, fails, and prints a four-line `MODULE_TYPELESS_PACKAGE_JSON` warning to stderr on every run
 * (`loadConfig` dynamically imports the file). `.mts` is unambiguous, so it never reparses and never warns — which
 * is why a malformed or unreadable `package.json` is treated the same as an absent `type` field: `.mts` is always
 * safe, where guessing `.ts` is only safe half the time.
 */
async function targetsEsm(rootDir: string): Promise<boolean> {
  const raw = await readIfPresent(join(rootDir, 'package.json'))
  if (raw === null) return false
  try {
    return (JSON.parse(raw) as { type?: unknown }).type === 'module'
  } catch {
    return false
  }
}

/** Both extensions `runInit` has ever written, newest-preferred first — see `targetsEsm`. */
const CONFIG_BASENAMES = ['slop-gate.config.ts', 'slop-gate.config.mts'] as const

export async function runInit(options: {
  rootDir: string
  force?: boolean
}): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []

  const preferredConfigName = (await targetsEsm(options.rootDir)) ? 'slop-gate.config.ts' : 'slop-gate.config.mts'
  let existingConfigName: string | null = null
  for (const basename of CONFIG_BASENAMES) {
    if ((await readIfPresent(join(options.rootDir, basename))) !== null) {
      existingConfigName = basename
      break
    }
  }

  if (existingConfigName !== null && options.force !== true) {
    skipped.push(existingConfigName)
  } else {
    // Force overwrites whichever config already exists, in place — it does not change a working config's extension
    // to match the project's current module type. Only a first-time write picks the extension fresh.
    const targetName = existingConfigName ?? preferredConfigName
    await writeFile(join(options.rootDir, targetName), CONFIG_TEMPLATE, 'utf8')
    created.push(targetName)
  }

  await mkdir(join(options.rootDir, '.slop-gate'), { recursive: true })
  await writeFile(join(options.rootDir, '.slop-gate', '.gitignore'), SLOP_GATE_GITIGNORE, 'utf8')

  const agentsPath = join(options.rootDir, 'AGENTS.md')
  const existingAgents = (await readIfPresent(agentsPath)) ?? ''
  const updatedAgents = upsertAgentsSection(existingAgents, AGENTS_BODY)
  if (updatedAgents !== existingAgents) {
    await writeFile(agentsPath, updatedAgents, 'utf8')
    created.push('AGENTS.md')
  } else {
    skipped.push('AGENTS.md')
  }

  return { created, skipped }
}

export const init = defineCommand({
  meta: { name: 'init', description: 'Set slop-gate up in this repository' },
  args: {
    cwd: { type: 'string', description: 'Directory to initialise (defaults to the current directory)' },
    force: { type: 'boolean', default: false, description: 'Overwrite an existing config' },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.cwd)
    const { created, skipped } = await runInit({ rootDir, force: args.force })
    const workspaces = await buildWorkspaceGraph(rootDir)

    for (const file of created) process.stdout.write(`  created  ${file}\n`)
    for (const file of skipped) process.stdout.write(`  kept     ${file}\n`)
    process.stdout.write(`\nDetected ${workspaces.nodes.length} workspace(s). Run \`sgate check\` next.\n`)
  },
})
