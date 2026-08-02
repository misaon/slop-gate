import { defineCommand } from 'citty'
import { ActionlintInstallError, installActionlint } from '@misaon/slop-gate-engine-actionlint'
import { AdvisoryInstallError, installAdvisorySnapshot } from '@misaon/slop-gate-engine-deps-security'
import { HadolintInstallError, installHadolint } from '@misaon/slop-gate-engine-hadolint'
import { EXIT_CODES } from '../exit-codes.ts'

const INSTALLABLE = ['actionlint', 'advisories', 'hadolint'] as const

/**
 * The only command that downloads anything, and the reason it exists as a command at all.
 *
 * D3 says an exotic engine is "downloaded lazily into a checksum-verified local cache", and
 * `Engine.availability` says the availability probe may touch the filesystem and nothing else. Those
 * cannot both be honoured by a download triggered on first use, because availability is what decides
 * whether a first use ever happens — an engine reported absent is never elected and its `run` is
 * never called. So the download moves here: explicit, verified against the digest upstream published,
 * cached under a version-scoped path, and never on the path of a `sgate check`.
 *
 * The upshot for a user is that `sgate check` never reaches the network, an air-gapped CI image gets
 * a clean coverage gap rather than an engine error mid-run, and `--require-engines` means what it
 * says. The cost is one command to run once, which the coverage gap itself names.
 */
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
        if (!INSTALLABLE.includes(target as (typeof INSTALLABLE)[number])) {
          process.stderr.write(`Unknown optional engine \`${target}\`. Available: ${INSTALLABLE.join(', ')}.\n`)
          process.exitCode = EXIT_CODES.config
          return
        }

        try {
          process.stdout.write(await runInstall(target))
        } catch (error) {
          // An install error is a configuration problem, not a findings count — a checksum mismatch in
          // particular must not be reportable as "the check found something".
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

/**
 * hadolint publishes the executable itself rather than an archive, so unlike actionlint's install
 * there is nothing to unpack here — and, for the same reason, Windows x86_64 is supported. The one
 * platform that resolves to nothing is Windows arm64, which upstream does not build.
 */
async function runHadolintInstall(): Promise<string> {
  const result = await installHadolint()
  return result.cached
    ? `hadolint ${result.version} is already installed at ${result.path}\n`
    : `hadolint ${result.version} verified and installed at ${result.path}\n`
}

/**
 * Unconditionally refetched, unlike actionlint's cached-binary short-circuit, and that asymmetry is
 * the point: a pinned binary at a known digest is the same file every time, while this is a snapshot
 * of a database that changed since the last run. "Already installed" is never the useful answer to
 * someone who just asked for the advisory data.
 */
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
