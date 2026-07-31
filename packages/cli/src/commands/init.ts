import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { buildWorkspaceGraph } from '@misaon/slop-gate-core'
import { upsertAgentsSection } from '../agents-md.ts'

// defineConfig is the identity function at runtime (it exists only so editors can infer the
// config shape), so it is inlined rather than imported from '@misaon/slop-gate'. This file must
// load before that package is ever added as a project dependency — importing it by name here
// would fail resolution on a fresh project, and would even fail once installed: the CLI package's
// own entry point has no exports of its own to provide, since it is a side-effecting script, not
// a library. Swap in the real export from '@misaon/slop-gate' once you depend on it directly.
const CONFIG_TEMPLATE = `const defineConfig = (config) => config

export default defineConfig({
  extends: ['recommended'],
})
`

const AGENTS_BODY = `## Code quality gate

This repository uses [slop-gate](https://github.com/misaon/slop-gate).

- \`sgate check\` — analyse the repository. Run it before you finish a task.
- \`sgate check --format agent\` — the same findings in a form optimised for you.
- \`sgate fix\` — apply the fixes that are safe to apply automatically.
- \`sgate rules why <concept>\` — explain why a rule is enabled at its current severity.

Rules are configured by *concept* (for example \`dead-code.unused-import\`) in
\`slop-gate.config.ts\`, not by engine-specific rule names. Do not add engine config files such as
\`.eslintrc\`, \`eslint.config.js\` or \`.oxlintrc.json\` — slop-gate owns the ruleset, and a
competing config file will be ignored.
`

const readIfPresent = async (path: string): Promise<string | null> =>
  readFile(path, 'utf8').then(
    (content) => content,
    () => null,
  )

export async function runInit(options: {
  rootDir: string
  force?: boolean
}): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = []
  const skipped: string[] = []

  const configPath = join(options.rootDir, 'slop-gate.config.ts')
  if ((await readIfPresent(configPath)) !== null && options.force !== true) {
    skipped.push('slop-gate.config.ts')
  } else {
    await writeFile(configPath, CONFIG_TEMPLATE, 'utf8')
    created.push('slop-gate.config.ts')
  }

  await mkdir(join(options.rootDir, '.slop-gate'), { recursive: true })
  await writeFile(join(options.rootDir, '.slop-gate', '.gitignore'), '*\n', 'utf8')

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
    const rootDir = args.cwd ?? process.cwd()
    const { created, skipped } = await runInit({ rootDir, force: args.force })
    const workspaces = await buildWorkspaceGraph(rootDir)

    for (const file of created) process.stdout.write(`  created  ${file}\n`)
    for (const file of skipped) process.stdout.write(`  kept     ${file}\n`)
    process.stdout.write(`\nDetected ${workspaces.nodes.length} workspace(s). Run \`sgate check\` next.\n`)
  },
})
