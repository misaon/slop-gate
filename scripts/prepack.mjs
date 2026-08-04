// Copies the repository's LICENCE — and, for the CLI, the README — into the package being
// packed, because npm only picks those up from the package directory and a monorepo keeps one
// copy of each at the root. Run from `prepack`, so the files exist for `npm pack`/`publish`
// and never need to be committed: `.gitignore` covers them, which is what makes drift
// impossible rather than merely unlikely.
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const target = process.cwd()

copyFileSync(join(root, 'LICENSE'), join(target, 'LICENSE'))

// The README is the package's npm page. Only the CLI has a page anybody arrives at directly;
// the engines are installed as its dependencies and a copy each would be twelve pages of the
// same text competing in search results.
if (existsSync(join(target, 'bin'))) copyFileSync(join(root, 'README.md'), join(target, 'README.md'))
