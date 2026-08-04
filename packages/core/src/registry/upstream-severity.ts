import type { Severity } from '../diagnostics/types.ts'

export type UpstreamSeverity = {
  readonly level: 'error' | 'warn' | 'off'
  readonly source: string
}

export const UPSTREAM_SEVERITY: Readonly<Record<string, UpstreamSeverity>> = {
  'jest/expect-expect': { level: 'warn', source: 'eslint-plugin-jest@29.16.0 flat/recommended' },
  'jest/no-disabled-tests': { level: 'warn', source: 'eslint-plugin-jest@29.16.0 flat/recommended' },
  'jsdoc/check-property-names': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/check-tag-names': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/implements-on-classes': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/no-defaults': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/require-property': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/require-property-description': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/require-property-name': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/require-property-type': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsdoc/require-yields': { level: 'warn', source: 'eslint-plugin-jsdoc@63.3.3 recommended' },
  'jsx-a11y/control-has-associated-label': { level: 'off', source: 'eslint-plugin-jsx-a11y@6.10.2 recommended' },
  'nextjs/google-font-display': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/google-font-preconnect': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/next-script-for-ga': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-async-client-component': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-before-interactive-script-outside-document': {
    level: 'warn',
    source: '@next/eslint-plugin-next@16.2.12 core-web-vitals',
  },
  'nextjs/no-css-tags': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-head-element': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-img-element': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-page-custom-font': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-styled-jsx-in-document': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-title-in-document-head': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-typos': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'nextjs/no-unwanted-polyfillio': { level: 'warn', source: '@next/eslint-plugin-next@16.2.12 core-web-vitals' },
  'promise/no-callback-in-promise': { level: 'warn', source: 'eslint-plugin-promise@7.3.0 flat/recommended' },
  'promise/valid-params': { level: 'warn', source: 'eslint-plugin-promise@7.3.0 flat/recommended' },
  'react/no-unsafe': { level: 'off', source: 'eslint-plugin-react@7.37.5 flat.recommended' },
  'vitest/no-disabled-tests': { level: 'warn', source: '@vitest/eslint-plugin@1.6.26 recommended' },
}

export function capToUpstream(mechanical: Severity, engineRuleId: string): Severity {
  const upstream = UPSTREAM_SEVERITY[engineRuleId]
  if (upstream === undefined || mechanical !== 'error') return mechanical
  return upstream.level === 'error' ? mechanical : 'warn'
}
