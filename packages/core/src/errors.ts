export class ConfigError extends Error {
  readonly code = 'config' as const

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConfigError'
  }
}

export class EngineError extends Error {
  readonly code = 'engine' as const
  readonly engine: string

  constructor(engine: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'EngineError'
    this.engine = engine
  }
}
