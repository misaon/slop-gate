import type { ReporterContext } from '../index.ts'

/**
 * Context for the non-streaming `sgate rules` renderers (`list`/`why`/`conflicts`): the same
 * terminal facts `check`'s reporters use, minus `readSource` — none of these commands show a code
 * frame, so there is no source file to read and nothing would ever call it.
 */
export type RulesReporterContext = Pick<ReporterContext, 'write' | 'color' | 'unicode' | 'width' | 'version'>
