import { expect, test } from 'vitest'
import { paragraphsOf, tokenise } from './markdown.ts'

const plain = (text: string) => tokenise(text).map((token) => `${token.kind}${token.bold ? '*' : ''}:${token.value}`)

test('reads code and bold', () => {
  expect(plain('a `b` c')).toEqual(['text:a ', 'code:b', 'text: c'])
  expect(plain('a **b** c')).toEqual(['text:a ', 'text*:b', 'text: c'])
})

test('a glob inside a code span is not an emphasis marker', () => {
  // Verbatim from `import/no-unassigned-import`'s reason. Reading bold first pairs the `**` of
  // `**/*.css` with the one in `**/*.scss` and bolds the rest of the paragraph.
  const source = 'allowlist (`**/*.css`, `**/*.scss`, `**/polyfills*`) brings that to **1,662**, which'
  expect(plain(source)).toEqual([
    'text:allowlist (',
    'code:**/*.css',
    'text:, ',
    'code:**/*.scss',
    'text:, ',
    'code:**/polyfills*',
    'text:) brings that to ',
    'text*:1,662',
    'text:, which',
  ])
})

test('bold spans a code span, because the reasons do that too', () => {
  const source = '**and iterates a workflow\'s jobs over `Jobs map[string]*Job`, whose order Go randomises**'
  expect(plain(source)).toEqual([
    "text*:and iterates a workflow's jobs over ",
    'code*:Jobs map[string]*Job',
    'text*:, whose order Go randomises',
  ])
})

test('an unpaired marker is shown rather than guessed at', () => {
  expect(plain('a ** b `c` d')).toEqual(['text:a ** b ', 'code:c', 'text: d'])
})

test('text with no markup is one token', () => {
  expect(plain('nothing to see')).toEqual(['text:nothing to see'])
})

test('paragraphsOf splits on blank lines and drops the empties', () => {
  expect(paragraphsOf('one\n\ntwo\n\n\n  \n\nthree')).toEqual(['one', 'two', 'three'])
})
