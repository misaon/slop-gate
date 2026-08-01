import { expect, test } from 'vitest'
import { inspectWorktree } from './worktree.ts'

const runner = (results: Record<string, { stdout?: string; fail?: boolean }>) => async (args: readonly string[]) => {
  const result = results[args.join(' ')]
  if (result === undefined || result.fail === true) throw new Error(`git ${args.join(' ')} failed`)
  return result.stdout ?? ''
}

const CLEAN = {
  'rev-parse --is-inside-work-tree': { stdout: 'true\n' },
  'status --porcelain --untracked-files=no': { stdout: '' },
}

test('a clean git worktree is safe to fix', async () => {
  const result = await inspectWorktree('/repo', { run: runner(CLEAN) })
  expect(result).toEqual({ state: 'clean' })
})

test('a dirty git worktree reports the changed paths', async () => {
  const result = await inspectWorktree('/repo', {
    run: runner({
      ...CLEAN,
      'status --porcelain --untracked-files=no': { stdout: ' M src/a.ts\nA  src/b.ts\n' },
    }),
  })

  expect(result).toEqual({ state: 'dirty', changed: ['src/a.ts', 'src/b.ts'] })
})

test('a rename entry reports the destination path, not the arrow form', async () => {
  const result = await inspectWorktree('/repo', {
    run: runner({ ...CLEAN, 'status --porcelain --untracked-files=no': { stdout: 'R  old.ts -> new.ts\n' } }),
  })

  expect(result).toEqual({ state: 'dirty', changed: ['new.ts'] })
})

test('a path containing a space survives the porcelain parse', async () => {
  const result = await inspectWorktree('/repo', {
    run: runner({ ...CLEAN, 'status --porcelain --untracked-files=no': { stdout: ' M src/my file.ts\n' } }),
  })

  expect(result).toEqual({ state: 'dirty', changed: ['src/my file.ts'] })
})

// Untracked files are deliberately not dirt: `sgate fix` never creates a file, and a build output or
// a scratch note sitting in the tree is not a reason to refuse. What the rail protects is the user's
// ability to `git diff` the tool's own edits apart from their own, and an untracked file cannot be
// confused with an edit to a tracked one.
test('untracked files alone do not make the worktree dirty', async () => {
  const result = await inspectWorktree('/repo', {
    run: runner({
      'rev-parse --is-inside-work-tree': { stdout: 'true\n' },
      'status --porcelain --untracked-files=no': { stdout: '' },
    }),
  })
  expect(result.state).toBe('clean')
})

test('a directory outside any git repository reports no-git, not clean', async () => {
  const result = await inspectWorktree('/tmp/scratch', {
    run: runner({ 'rev-parse --is-inside-work-tree': { fail: true } }),
  })
  expect(result).toEqual({ state: 'no-git' })
})

test('git present but reporting false (inside a bare .git dir) is also no-git', async () => {
  const result = await inspectWorktree('/repo/.git', {
    run: runner({ 'rev-parse --is-inside-work-tree': { stdout: 'false\n' } }),
  })
  expect(result).toEqual({ state: 'no-git' })
})

test('git failing on status after succeeding on rev-parse is reported, never assumed clean', async () => {
  const result = await inspectWorktree('/repo', {
    run: runner({
      'rev-parse --is-inside-work-tree': { stdout: 'true\n' },
      'status --porcelain --untracked-files=no': { fail: true },
    }),
  })

  expect(result.state).toBe('unknown')
})
