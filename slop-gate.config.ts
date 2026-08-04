import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  extends: ['recommended'],
  // `packages/*/fixtures/**` is deliberately-wrong code — an engine adapter's true- and
  // false-positive corpus — so linting it reports on defects that are the fixture's whole point.
  ignore: ['fixtures/**', 'packages/*/fixtures/**'],
})
