import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const target = process.cwd()

copyFileSync(join(root, 'LICENSE'), join(target, 'LICENSE'))

if (existsSync(join(target, 'bin'))) copyFileSync(join(root, 'README.md'), join(target, 'README.md'))
