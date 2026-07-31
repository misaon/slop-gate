const START = '<!-- slop-gate:start -->'
const END = '<!-- slop-gate:end -->'

export function upsertAgentsSection(existing: string, body: string): string {
  const section = `${START}\n${body.trim()}\n${END}`
  const startAt = existing.indexOf(START)
  const endAt = existing.indexOf(END)

  if (startAt !== -1 && endAt > startAt) {
    return `${existing.slice(0, startAt)}${section}${existing.slice(endAt + END.length)}`
  }

  const separator = existing === '' ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${separator}${section}\n`
}
