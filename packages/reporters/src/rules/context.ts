import type { ReporterContext } from '../index.ts'

/** The same terminal facts `check`'s reporters use, minus `readSource`: no `sgate rules` command shows a code
 *  frame, so there is no source file to read and nothing would ever call it. */
export type RulesReporterContext = Pick<ReporterContext, 'write' | 'color' | 'unicode' | 'width' | 'version'>
