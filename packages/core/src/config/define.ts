import type { SlopGateConfig } from './types.ts'

/**
 * Identity at runtime. Its only job is to give config files full inference and
 * autocompletion without the author writing a type annotation.
 */
export function defineConfig(config: SlopGateConfig): SlopGateConfig {
  return config
}
