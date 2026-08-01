declare function work(): void
declare function report(error: unknown): void

export function rethrowsWithCause() {
  try {
    work()
  } catch (error) {
    throw new Error('work failed', { cause: error })
  }
}

export function handles() {
  try {
    work()
  } catch (error) {
    report(error)
  }
}

export function returnsFallback(): number {
  try {
    work()
    return 1
  } catch {
    return 0
  }
}

export function rethrowsBare() {
  try {
    work()
  } catch (error) {
    throw error
  }
}

export function emptyTryBody() {
  try {
  } catch (error) {
    report(error)
  }
}
