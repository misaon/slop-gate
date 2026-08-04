import type { ReporterContext } from '../index.ts'

export type RulesReporterContext = Pick<ReporterContext, 'write' | 'color' | 'unicode' | 'width' | 'version'>
