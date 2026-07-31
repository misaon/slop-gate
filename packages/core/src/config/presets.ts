import type { PresetName, RuleMap } from './types.ts'

const recommended: RuleMap = {
  'correctness.parse-error': 'error',
  'correctness.no-debugger': 'error',
  'correctness.no-duplicate-object-key': 'error',
  'correctness.no-constant-condition': 'error',
  'dead-code.unused-import': 'warn',
  'dead-code.unused-variable': 'warn',
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
}

const strict: RuleMap = {
  ...recommended,
  'dead-code.unused-import': 'error',
  'dead-code.unused-variable': 'error',
  'style.no-var': 'error',
  'config.rule-overlap': 'warn',
}

const slop: RuleMap = {
  'slop.as-any-cast': 'warn',
}

export const PRESETS: Readonly<Record<PresetName, RuleMap>> = { recommended, strict, slop }
