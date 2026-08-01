export function suppressedDebugger(): void {
  // sgate-disable-next-line correctness.no-debugger -- deliberately suppressed for the e2e fixture
  debugger
}

export function noFindingHere(): number {
  // sgate-disable-next-line correctness.no-debugger -- this one never matches anything, on purpose
  return 1
}
