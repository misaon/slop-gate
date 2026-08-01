declare function work(): void
declare function cleanup(): void

export function empty() {
  try {
    work()
  } catch { // SLOP_HIT
  }
}

export function boundButIgnored() {
  try {
    work()
  } catch (error) { // SLOP_HIT
  }
}

export function commentOnly() {
  try {
    work()
  } catch (error) { // SLOP_HIT
    // ignore, best effort
  }
}

export function withFinally() {
  try {
    work()
  } catch (error) { // SLOP_HIT
  } finally {
    cleanup()
  }
}

export async function inAsync() {
  try {
    await Promise.resolve(work())
  } catch { // SLOP_HIT
  }
}
