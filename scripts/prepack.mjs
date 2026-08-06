import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = dirname(import.meta.dirname)
const target = process.cwd()

copyFileSync(join(root, 'LICENSE'), join(target, 'LICENSE'))

if (existsSync(join(target, 'bin'))) copyFileSync(join(root, 'README.md'), join(target, 'README.md'))
