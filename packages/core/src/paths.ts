/** Public data structures carry POSIX separators regardless of the host platform. */
export function toPosix(value: string): string {
  return value.replaceAll('\\', '/')
}
