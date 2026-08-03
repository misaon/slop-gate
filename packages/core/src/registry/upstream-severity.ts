import type { Severity } from '../diagnostics/types.ts'

/**
 * What a rule's *own authors* publish for it in the config they ship to users.
 *
 * `level` is verbatim from that config, including `'off'` — which is why this is not a `Severity`.
 */
export type UpstreamSeverity = {
  readonly level: 'error' | 'warn' | 'off'
  /** The package, version and config object it was read from, so the claim can be re-checked. */
  readonly source: string
}

/**
 * Rules where the plugin's own published config is **milder than our category mapping**, which is the
 * whole reason this table exists.
 *
 * The generator derives `severityDefault` from oxlint's rule category alone
 * (`correctness` → `error`, everything else → `warn`), and that mapping never asked what the people
 * who wrote the rule think of it. It is wrong in one direction specifically: `error` fails a run with
 * no opt-in anywhere (`resolveExitCode`, `packages/cli/src/exit-codes.ts`, exits 1 on a single
 * error-level finding), while a `warn` costs nothing unless the user passed `--max-warnings`. So
 * being stricter than upstream is a decision with a build-breaking consequence, and "the category
 * mapping said so" is not a reason to make it — 13 of Vercel's 21 Next.js rules ship at `warn` in
 * `eslint-config-next`'s own config, and slop-gate held all 21 at `error` purely as a side effect of
 * every oxlint `correctness` rule mapping to `error`.
 *
 * Read directly from each plugin's own default config object at the version recorded in `source` —
 * the config a user gets by extending what its README tells them to extend, not its documentation
 * prose and not the strictest variant it also publishes. Two of those choices are worth stating
 * because a reader will otherwise wonder:
 *
 * - **`@next/eslint-plugin-next`: `core-web-vitals`, not `recommended`.** `eslint-config-next`
 *   applies `core-web-vitals`, and it is the *stricter* of the two (`no-html-link-for-pages` and
 *   `no-sync-scripts` are `error` there and `warn` in `recommended`). Taking the stricter published
 *   config is the conservative reading of "its authors have the better claim".
 * - **`eslint-plugin-jsdoc`: `recommended`, not `recommended-error`.** That plugin publishes both,
 *   identical but for the level, which makes `warn` its default judgement and `error` the thing a
 *   user opts into. All nine of its rules oxlint categorises as `correctness` are `warn` upstream.
 *
 * `capToUpstream` only ever *lowers* our level; a rule upstream holds at `error` while oxlint's
 * category makes it `warn` here stays `warn`, because raising it would be an unmeasured escalation of
 * exactly the kind this table exists to stop. An `'off'` upstream level caps at `warn` rather than
 * removing the rule: whether a rule belongs in a preset at all is the separate, measured question
 * `registry/not-recommended.ts` answers, and upstream not enabling something is not evidence about its
 * false-positive rate on real code.
 *
 * To keep `error` against a milder upstream, state the measurement on a `RULE_OVERRIDES`
 * (`registry/overrides.ts`) `severityDefault` entry — the generator prefers an explicit override over
 * this cap, and `upstream-severity.test.ts` asserts that every capped rule either matches its cap or
 * has such an override. Nothing is in that position today: none of the 29 rules below has a
 * measurement on this repository's corpora that beats its author's own judgement.
 *
 * Deliberately **only** the rules where upstream is milder. The adjacent question — 43 rules we hold
 * at `error` that upstream's recommended config does not enable at all — is about preset membership
 * rather than severity, and is recorded in `docs/superpowers/specs/2026-07-31-m0-followups.md` rather
 * than acted on here.
 */
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

/**
 * Lowers `mechanical` to what `engineRuleId`'s own authors publish, and never raises it. `'off'`
 * upstream caps at `warn` — see the table's note on why it is not an exclusion.
 */
export function capToUpstream(mechanical: Severity, engineRuleId: string): Severity {
  const upstream = UPSTREAM_SEVERITY[engineRuleId]
  if (upstream === undefined || mechanical !== 'error') return mechanical
  return upstream.level === 'error' ? mechanical : 'warn'
}
