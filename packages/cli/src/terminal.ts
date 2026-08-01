/**
 * Shared by every command that renders a `pretty` reporter, so `NO_COLOR`/`FORCE_COLOR`/TTY and
 * `TERM=dumb` are decided identically everywhere rather than re-implemented per command.
 */
export function supportsColor(): boolean {
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') return false
  if (process.env['FORCE_COLOR'] !== undefined && process.env['FORCE_COLOR'] !== '') return true
  return process.stdout.isTTY === true
}

// Independent of `supportsColor`: `TERM=dumb` selects the ASCII fallback (box characters and
// severity markers) regardless of whether colour is on, and colour can be off (`NO_COLOR`, a pipe
// with no `FORCE_COLOR`) without implying ASCII — a piped-to-file run should still get the real
// frame characters, just without escape codes.
export function supportsUnicode(): boolean {
  return process.env['TERM'] !== 'dumb'
}
