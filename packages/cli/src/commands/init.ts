import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
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

export const SLOP_GATE_GITIGNORE = '*\n!.gitignore\n!baseline.json\n'

const readIfPresent = async (path: string): Promise<string | null> =>
  readFile(path, 'utf8').then(
    (content) => content,
    () => null,
  )

// `.mts` is unambiguous ESM. Without `"type": "module"` in the target, a `.ts` config makes Node
// try CommonJS first and print a warning on every run — so an unreadable manifest picks `.mts` too.
async function targetsEsm(rootDir: string): Promise<boolean> {
  const raw = await readIfPresent(join(rootDir, 'package.json'))
  if (raw === null) return false
  try {
    return (JSON.parse(raw) as { type?: unknown }).type === 'module'
  } catch {
    return false
  }
}

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

const PACKAGE_NAME = '@misaon/slop-gate'

// `npx @misaon/slop-gate init` runs the CLI from npx's cache, so the package is nowhere in the
// target project — and the config written here imports `defineConfig` from it. `init` is the last
// moment anyone can be told, because it is the step that creates the dependency.
export async function missingPackageHint(rootDir: string): Promise<string | undefined> {
  const installed = await stat(join(rootDir, 'node_modules', ...PACKAGE_NAME.split('/'))).then(
    (entry) => entry.isDirectory(),
    () => false,
  )
  if (installed) return undefined

  return (
    `\n  ${PACKAGE_NAME} is not installed in this project, and the config just written imports ` +
    `\`defineConfig\` from it.\n  Install it before running a check:  npm install -D ${PACKAGE_NAME}\n`
  )
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

    const hint = await missingPackageHint(rootDir)
    if (hint !== undefined) process.stdout.write(hint)

    process.stdout.write(`\nDetected ${workspaces.nodes.length} workspace(s). Run \`sgate check\` next.\n`)
  },
})
