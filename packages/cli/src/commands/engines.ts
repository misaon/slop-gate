import { defineCommand } from 'citty'
import { ActionlintInstallError, installActionlint } from '@misaon/slop-gate-engine-actionlint'
import { EXIT_CODES } from '../exit-codes.ts'

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
        engine: { type: 'positional', required: true, description: 'Engine to install (currently only `actionlint`)' },
      },
      async run({ args }) {
        if (args.engine !== 'actionlint') {
          process.stderr.write(`Unknown optional engine \`${String(args.engine)}\`. The only one today is \`actionlint\`.\n`)
          process.exitCode = EXIT_CODES.config
          return
        }

        try {
          const result = await installActionlint()
          process.stdout.write(
            result.cached
              ? `actionlint ${result.version} is already installed at ${result.path}\n`
              : `actionlint ${result.version} verified and installed at ${result.path}\n`,
          )
        } catch (error) {
          // An install error is a configuration problem, not a findings count — a checksum mismatch in
          // particular must not be reportable as "the check found something".
          process.stderr.write(`${error instanceof ActionlintInstallError ? error.message : String(error)}\n`)
          process.exitCode = EXIT_CODES.config
        }
      },
    }),
  },
})
