const GENERATED_PATH_MARKERS = /(^|\/)__generated__\/|\.(gen|generated)\.[^/]+$/

export function isGeneratedPath(path: string): boolean {
  return GENERATED_PATH_MARKERS.test(path)
}
