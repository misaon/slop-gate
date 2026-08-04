/**
 * Conventional Commits, enforced in CI on every commit in a pull request.
 *
 * It is enforced per *commit* rather than on the pull request title because this repository
 * merges by rebase only: every commit you write lands on `main` verbatim, so every one of them
 * has to stand on its own. On a squash-merge repository the opposite is true and linting the PR
 * title is the right check — the difference is the merge strategy, not taste.
 *
 * Only two rules are changed from `@commitlint/config-conventional`, and both loosen it:
 * the scope is free-form because the package list changes faster than any enum would, and the
 * body is unbounded because a commit here is expected to argue for itself with measurements,
 * which wraps badly at a fixed width.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [0],
    'body-max-line-length': [0],
  },
}
