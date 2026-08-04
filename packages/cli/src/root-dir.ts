import { resolve } from 'node:path'

export const resolveRootDir = (cwd?: string): string => (cwd === undefined ? process.cwd() : resolve(cwd))
