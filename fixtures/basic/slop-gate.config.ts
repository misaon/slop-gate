// `rules` deliberately includes one key that names neither a known concept nor a shipped
// `engine/ruleId` — a fixed, engine-independent way for e2e.test.ts to get a `config.*`
// diagnostic out of a real run. Before fix 1, `extends: ['recommended']` alone was enough:
// the registry's oxlint/eslint tier overlap on `dead-code.unused-variable` fired unconditionally,
// regardless of which engines actually ran. It no longer does (arbitration now drops a registry
// entry whose engine never participated in the run), so this fixture needs its own trigger.
export default { extends: ['recommended'], rules: { 'oxlint/no-such-rule': 'error' } }
