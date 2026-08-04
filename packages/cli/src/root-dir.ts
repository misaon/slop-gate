import { resolve } from 'node:path'

/**
 * The absolute directory a command should analyse, from its `--cwd` argument.
 *
 * **`resolve`, because `--cwd fixtures/basic` is what a person types first.** Passed through unresolved, a
 * relative path reached `createRequire(join(rootDir, 'package.json'))` and Node rejected it with *"The argument
 * 'filename' must be a file URL object, file URL string, or absolute path string"* — an unhandled internal
 * error and exit 2, from the most obvious possible invocation. Nothing in `--cwd`'s help text said it had to be
 * absolute, and nothing should have to.
 *
 * One function rather than nine copies of `args.cwd ?? process.cwd()`: every command that takes a directory
 * needs the same answer, and the version that shipped was the same expression written out nine times, each of
 * them wrong in the same way.
 */
export const resolveRootDir = (cwd?: string): string => (cwd === undefined ? process.cwd() : resolve(cwd))
