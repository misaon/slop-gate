import { defineCommand } from 'citty'
import { isOneOf } from '@misaon/slop-gate-core'
import { ActionlintInstallError, installActionlint } from '@misaon/slop-gate-engine-actionlint'
import { AdvisoryInstallError, installAdvisorySnapshot } from '@misaon/slop-gate-engine-deps-security'
import { HadolintInstallError, installHadolint } from '@misaon/slop-gate-engine-hadolint'
import { EXIT_CODES } from '../exit-codes.ts'

const INSTALLABLE = ['actionlint', 'advisories', 'hadolint'] as const

export const engines = defineCommand({
  meta: { name: 'engines', description: 'Manage optional engines that are downloaded rather than bundled' },
  subCommands: {
    install: defineCommand({
      meta: { name: 'install', description: 'Download and verify an optional engine into the local cache' },
      args: {
        engine: {
          type: 'positional',
          required: true,
          description: `What to install: ${INSTALLABLE.map((name) => `\`${name}\``).join(' or ')}`,
        },
      },
      async run({ args }) {
        const target = String(args.engine)
        if (!isOneOf(target, INSTALLABLE)) {
          process.stderr.write(`Unknown optional engine \`${target}\`. Available: ${INSTALLABLE.join(', ')}.\n`)
          process.exitCode = EXIT_CODES.config
          return
        }

        try {
          process.stdout.write(await runInstall(target))
        } catch (error) {
          const known =
            error instanceof ActionlintInstallError ||
            error instanceof AdvisoryInstallError ||
            error instanceof HadolintInstallError
          process.stderr.write(`${known ? error.message : String(error)}\n`)
          process.exitCode = EXIT_CODES.config
        }
      },
    }),
  },
})

async function runInstall(target: string): Promise<string> {
  if (target === 'actionlint') return runActionlintInstall()
  if (target === 'hadolint') return runHadolintInstall()
  return runAdvisoryInstall()
}

async function runActionlintInstall(): Promise<string> {
  const result = await installActionlint()
  return result.cached
    ? `actionlint ${result.version} is already installed at ${result.path}\n`
    : `actionlint ${result.version} verified and installed at ${result.path}\n`
}

async function runHadolintInstall(): Promise<string> {
  const result = await installHadolint()
  return result.cached
    ? `hadolint ${result.version} is already installed at ${result.path}\n`
    : `hadolint ${result.version} verified and installed at ${result.path}\n`
}

async function runAdvisoryInstall(): Promise<string> {
  const { directory, manifest, vulnerablePackages, maliciousPackages } = await installAdvisorySnapshot()
  return (
    `advisory snapshot installed at ${directory}\n` +
    `  ${manifest.vulnerableAdvisories} vulnerability advisories over ${vulnerablePackages} packages\n` +
    `  ${manifest.maliciousAdvisories} malicious-package advisories over ${maliciousPackages} packages\n` +
    `  fetched ${manifest.fetchedAt} from ${manifest.source}\n` +
    `  sha256 ${manifest.digest}\n` +
    '  That digest records what was fetched; it is not a verification against the publisher, which\n' +
    '  regenerates this archive daily and publishes no per-release checksum.\n'
  )
}
