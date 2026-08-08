export function supportsColor(): boolean {
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') return false
  if (process.env['FORCE_COLOR'] !== undefined && process.env['FORCE_COLOR'] !== '') return true
  return process.stdout.isTTY
}

export function supportsUnicode(): boolean {
  return process.env['TERM'] !== 'dumb'
}
