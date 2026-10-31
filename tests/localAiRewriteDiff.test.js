import test from 'brittle'

import {
  diffRewriteText,
  getRewriteParagraphText,
  groupRewriteParagraphs,
  REWRITE_SEGMENT
} from '../store/services/localAiRewriteDiff.js'

const { EQUAL, REMOVED, ADDED } = REWRITE_SEGMENT

test('marks replaced words as removed then added', (t) => {
  const diff = diffRewriteText('Their was alot of feedback', 'There was a lot of feedback')
  t.is(diff.paragraphs.length, 1)
  t.alike(diff.paragraphs[0].segments, [
    { type: REMOVED, text: 'Their' },
    { type: ADDED, text: 'There' },
    { type: EQUAL, text: 'was' },
    { type: REMOVED, text: 'alot' },
    { type: ADDED, text: 'a lot' },
    { type: EQUAL, text: 'of feedback' }
  ])
  t.is(diff.fixes, 2)
  t.is(diff.removed, 2)
  t.is(diff.added, 3)
  t.absent(diff.unchanged)
  t.absent(diff.mostlyChanged)
})

test('pairs adjacent word swaps so each counts as a fix', (t) => {
  const diff = diffRewriteText('on tuesday. Their was', 'on Tuesday. There was')
  t.alike(diff.paragraphs[0].segments, [
    { type: EQUAL, text: 'on' },
    { type: REMOVED, text: 'tuesday.' },
    { type: ADDED, text: 'Tuesday.' },
    { type: REMOVED, text: 'Their' },
    { type: ADDED, text: 'There' },
    { type: EQUAL, text: 'was' }
  ])
  t.is(diff.fixes, 2)
})

test('identical text is unchanged even with different spacing', (t) => {
  const diff = diffRewriteText('Hello  world\n\nSecond line', 'Hello world\nSecond line ')
  t.ok(diff.unchanged)
  t.is(diff.fixes, 0)
  t.is(diff.paragraphs.length, 2)
  t.absent(diff.paragraphs.some((paragraph) => paragraph.changed))
})

test('flags mostly rewritten text', (t) => {
  const diff = diffRewriteText(
    'Met with the design team to go over the whole onboarding flow today',
    'Design review: onboarding needs fewer steps'
  )
  t.ok(diff.mostlyChanged)
})

test('keeps paragraphs and marks only the changed ones', (t) => {
  const diff = diffRewriteText('one two\nthree four\nfive six', 'one two\nthree for\nfive six')
  t.is(diff.paragraphs.length, 3)
  t.alike(
    diff.paragraphs.map((paragraph) => paragraph.changed),
    [false, true, false]
  )
  t.is(getRewriteParagraphText(diff.paragraphs[1], { removed: false }), 'three for')
  t.is(getRewriteParagraphText(diff.paragraphs[1], { added: false }), 'three four')
})

test('merged paragraphs stay in one paragraph', (t) => {
  const diff = diffRewriteText('first part\nsecond part', 'first part second part')
  t.is(diff.paragraphs.length, 1)
  t.is(getRewriteParagraphText(diff.paragraphs[0]), 'first part second part')
})

test('groups runs of unchanged paragraphs', (t) => {
  const diff = diffRewriteText('a\nb\nc\nd old', 'a\nb\nc\nd new')
  const items = groupRewriteParagraphs(diff.paragraphs)
  t.is(items.length, 2)
  t.is(items[0].type, 'unchanged')
  t.is(items[0].paragraphs.length, 3)
  t.is(items[1].type, 'paragraph')
})

test('does not group when nothing changed or only one paragraph', (t) => {
  t.ok(
    groupRewriteParagraphs(diffRewriteText('a\nb', 'a\nb').paragraphs).every(
      (item) => item.type === 'paragraph'
    )
  )
  t.is(groupRewriteParagraphs(diffRewriteText('a b', 'a c').paragraphs).length, 1)
})
