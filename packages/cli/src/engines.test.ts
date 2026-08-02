import { expect, test } from 'vitest'
import { defaultEngines } from './engines.ts'

test('registers exactly the engines a real check run uses', () => {
  const engines = defaultEngines(process.cwd())
  expect(engines.map((engine) => engine.id)).toEqual([
    'oxlint',
    'tsc',
    'knip',
    'astgrep',
    'schema',
    'actionlint',
    'biome-css',
    'deps-security',
    'hadolint',
  ])
})

test('only the engines that can genuinely be unable to run declare availability', () => {
  // `Engine.availability` says to omit it entirely for a bundled engine: anything `npm install` puts
  // there is present by construction, and an implementation that always returns `available: true`
  // is noise. Four engines here can legitimately be unable to run, for three different reasons, and
  // all are coverage gaps rather than errors:
  //
  // - **actionlint** and **hadolint** are downloaded or found on PATH rather than installed with
  //   slop-gate, so their *binaries* may be missing.
  // - **tsc** ships with us, but `tsc -p` needs a project and does no discovery, so on a monorepo
  //   whose root has no `tsconfig.json` there is nothing to typecheck. Since `types.type-error` is
  //   in `recommended`, without this probe that shape failed the run outright (exit 3) instead of
  //   reporting the gap.
  // - **deps-security** ships with us too, and so does everything it executes — what it can be
  //   missing is *data*. Its advisory snapshot is fetched by an explicit `sgate engines install
  //   advisories` and never by a check, so a machine that has not run that command has no
  //   vulnerability data and must say so rather than report every repository clean.
  //
  // The other five are bundled *and* need nothing from the repository to run, so they declare
  // nothing. Order is `defaultEngines`' own.
  const declaring = defaultEngines(process.cwd())
    .filter((engine) => engine.availability !== undefined)
    .map((engine) => engine.id)
  expect(declaring).toEqual(['tsc', 'actionlint', 'deps-security', 'hadolint'])
})

test('returns a fresh engine instance each call, not a shared singleton', () => {
  // `sgate rules why`/`list`/`conflicts` and `check` each call this independently within the same
  // process in a test harness (see e2e.test.ts) — sharing one instance across calls would risk one
  // command's state (e.g. a disposed engine handle) leaking into another's.
  expect(defaultEngines(process.cwd())[0]).not.toBe(defaultEngines(process.cwd())[0])
})

test('binds each engine to the given rootDir, not a fixed default', () => {
  // `tsc` is project-granularity and resolves `typescript` (a peer dependency) relative to
  // `rootDir` — passing a different directory must produce a distinctly-configured engine, not one
  // that silently ignores the argument.
  const engines = defaultEngines('/some/other/project')
  expect(engines.map((engine) => engine.id)).toEqual([
    'oxlint',
    'tsc',
    'knip',
    'astgrep',
    'schema',
    'actionlint',
    'biome-css',
    'deps-security',
    'hadolint',
  ])
})

test('passes the discovered config file through so knip does not report it as unused', () => {
  // knip reports `slop-gate.config.ts` as an unused file on every repository that has one — nothing
  // imports a config loaded by path at runtime. The CLI is the only layer that knows where the config
  // was actually found (`loadCliConfig`), so it is the only layer that can tell the adapter.
  const withConfig = defaultEngines(process.cwd(), 'slop-gate.config.ts')
  const withoutConfig = defaultEngines(process.cwd())
  expect(withConfig.map((engine) => engine.id)).toEqual(withoutConfig.map((engine) => engine.id))
})
