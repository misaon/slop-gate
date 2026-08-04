export type BiomeCssRule = {
  readonly engineRuleId: string
  readonly group: 'a11y' | 'complexity' | 'correctness' | 'nursery' | 'style' | 'suspicious'
  readonly category: string
}

const rule = (group: BiomeCssRule['group'], engineRuleId: string): BiomeCssRule => ({
  engineRuleId,
  group,
  category: `lint/${group}/${engineRuleId}`,
})

export const BIOME_CSS_RULES: readonly BiomeCssRule[] = [
  rule('a11y', 'useGenericFontNames'),
  rule('complexity', 'noImportantStyles'),
  rule('correctness', 'noInvalidDirectionInLinearGradient'),
  rule('correctness', 'noInvalidPositionAtImportRule'),
  rule('correctness', 'noMissingVarFunction'),
  rule('correctness', 'noUnknownFunction'),
  rule('correctness', 'noUnknownProperty'),
  rule('correctness', 'noUnknownPseudoClass'),
  rule('correctness', 'noUnknownPseudoElement'),
  rule('correctness', 'noUnknownTypeSelector'),
  rule('correctness', 'noUnmatchableAnbSelector'),
  rule('nursery', 'noDuplicateSelectors'),
  rule('nursery', 'useBaseline'),
  rule('style', 'noDescendingSpecificity'),
  rule('style', 'noHexColors'),
  rule('suspicious', 'noDeprecatedMediaType'),
  rule('suspicious', 'noDuplicateAtImportRules'),
  rule('suspicious', 'noDuplicateCustomProperties'),
  rule('suspicious', 'noDuplicateFontNames'),
  rule('suspicious', 'noDuplicateProperties'),
  rule('suspicious', 'noDuplicateSelectorsKeyframeBlock'),
  rule('suspicious', 'noEmptyBlock'),
  rule('suspicious', 'noImportantInKeyframe'),
  rule('suspicious', 'noIrregularWhitespace'),
  rule('suspicious', 'noShorthandPropertyOverrides'),
  rule('suspicious', 'noUnknownAtRules'),
]

export const BIOME_CSS_RULE_IDS: ReadonlySet<string> = new Set(BIOME_CSS_RULES.map((r) => r.engineRuleId))

export function ruleByEngineRuleId(engineRuleId: string): BiomeCssRule | undefined {
  return BIOME_CSS_RULES.find((r) => r.engineRuleId === engineRuleId)
}

export function ruleByCategory(category: string): BiomeCssRule | undefined {
  return BIOME_CSS_RULES.find((r) => r.category === category)
}

export type ExcludedRule = {
  readonly engineRuleId: string
  readonly reason: string
}

export const EXCLUDED_RULES: readonly ExcludedRule[] = [
  {
    engineRuleId: 'noInvalidGridAreas',
    reason:
      "**It cannot fire on CSS as anybody writes it.** Fed Biome's own documented invalid example, " +
      "`grid-template-areas: \"a a\" \"b b b\"`, the rule reports it when the declaration shares a " +
      "line with the opening brace or with another declaration, and reports nothing at all when the " +
      "declaration sits on its own indented line — which is every real stylesheet. Four formattings " +
      "of the identical invalid value were tried; the two conventional ones produced nothing, and " +
      "`--profile-rules` confirms the rule executed in each case, so this is the rule missing the " +
      "defect rather than the rule not running.\n\n" +
      "It was in the shipped set until an authored fixture failed to reproduce what the scratch " +
      "measurement had shown, which is the entire reason those fixtures exist. Zero findings across " +
      "1729 production stylesheets is consistent with both a rare defect and a rule that never " +
      "fires, and only the fixture distinguishes them. Revisit when upstream fixes it.",
  },
  {
    engineRuleId: 'noUnknownUnit',
    reason:
      "The rule is wrong, reproducibly. Both findings across 1729 production stylesheets were " +
      "`@media (resolution <= 1x)` in zulip, and `x` is a standard CSS resolution unit — the " +
      "`dppx` alias from CSS Values and Units 4, supported everywhere. Biome 2.5.6 does not know " +
      "it. Unlike `noUnknownAtRules`, no repository shape makes this correct, so there is nothing " +
      "for a framework profile to switch on and no reason to leave it enableable: a user who turned " +
      "the concept on would be told their valid CSS is invalid.",
  },
  {
    engineRuleId: 'noUnknownMediaFeatureName',
    reason:
      "3 findings, 0 true positives, and all three are vendor-prefixed media features that were " +
      "correct for the browsers they targeted: `-ms-high-contrast` (highlight.js, twice) and " +
      "`-webkit-min-device-pixel-ratio` (VS Code). A vendor prefix is not a typo, and the rule has " +
      "no way to tell the two apart — it holds a list of standard feature names and rejects the " +
      "rest, which makes every deliberate prefix a finding forever.",
  },
  {
    engineRuleId: 'noEmptySource',
    reason:
      "4 findings, all accurate and none actionable: files containing only a licence header, which " +
      "JupyterLab and VS Code ship as placeholders their build expects to exist. 'This file has no " +
      "rules in it' is a true statement about a file that is deliberately empty.",
  },
  {
    engineRuleId: 'noExcessiveLinesPerFile',
    reason:
      "A threshold metric, not a defect: it reports that a file is longer than a configured line " +
      "count. 130 findings across 1729 stylesheets, which is a statement about the default " +
      "threshold rather than about any of those files. slop-gate has no size policy and inventing " +
      "one here would be this engine deciding it on the user's behalf.",
  },
  {
    engineRuleId: 'noValueAtRule',
    reason:
      "Flags `@value`, which is a real CSS Modules feature, in order to steer users toward native " +
      "custom properties. That is a migration preference about a working language feature, so it is " +
      "not a defect under any browser; zero findings on the corpus, which contains 686 CSS Modules " +
      "files, so it is not even a preference anybody there disagreed with.",
  },
  {
    engineRuleId: 'noExcessiveSelectorClasses',
    reason:
      "Did not fire on an authored fixture built to trigger it (`.a.b.c.d.e.f`), and produced zero " +
      "findings on the corpus, so nothing here establishes what it does. `nursery` upstream. A rule " +
      "whose behaviour we cannot demonstrate must not be shipped as coverage — that is the " +
      "`no-implied-eval` argument in `registry/not-recommended.ts` applied to a rule we can still see " +
      "into rather than one we could not.",
  },
  {
    engineRuleId: 'noUnusedClasses',
    reason:
      "Cross-file: it reports a CSS class no JSX in the project references, which makes its verdict " +
      "a function of which files the run happened to scan. It fired on a bare stylesheet in one " +
      "directory and stayed silent on the same construct in another, and produced zero findings " +
      "across 1729 corpus files. `nursery` upstream. slop-gate hands engines explicit file lists " +
      "(spec §7), so a rule needing the whole project graph would be answering a question this " +
      "adapter never gives it the input for — and every class in a partially-scanned repository " +
      "would read as unused.",
  },
  {
    engineRuleId: 'noUselessEscapeInString',
    reason:
      "Executes on CSS (it appears under `--profile-rules`) but did not fire on an authored CSS " +
      "fixture containing a useless escape in a `content:` string, and produced zero findings on " +
      "the corpus. Its documentation and its whole test surface are JavaScript. Shipping it would " +
      "claim CSS coverage that the one experiment able to demonstrate it did not support.",
  },
]

export const EXCLUDED_RULE_IDS: ReadonlySet<string> = new Set(EXCLUDED_RULES.map((r) => r.engineRuleId))

export const FOREIGN_SUPPRESSION_RULE_ID = 'foreign-suppression'
