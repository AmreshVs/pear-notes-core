import test from 'brittle'
import { formatDate, getGroupTitle, NOTES_LIST_GROUP } from '../utils.js'

const DAY_MS = 86_400_000
const noteAt = (updatedAt) => ({ value: { updatedAt } })

test('formatDate - a timestamp from a peer with a fast clock never reads as negative', (t) => {
  const now = Date.now()
  for (const ahead of [1, 500, 3000, 120_000, 3 * 60 * 60 * 1000, DAY_MS]) {
    const label = formatDate(now + ahead)
    t.absent(label.includes('-'), `${ahead}ms ahead renders without a negative: ${label}`)
    t.is(label, 'Just now', `${ahead}ms ahead reads as Just now`)
  }
})

test('getGroupTitle - a future timestamp groups under Today, not Last 7 Days', (t) => {
  const now = Date.now()
  t.is(getGroupTitle(noteAt(now + 1)), NOTES_LIST_GROUP.TODAY)
  t.is(getGroupTitle(noteAt(now + 3000)), NOTES_LIST_GROUP.TODAY)
  t.is(getGroupTitle(noteAt(now + 3 * 60 * 60 * 1000)), NOTES_LIST_GROUP.TODAY)
})

test('formatDate - past timestamps are unchanged', (t) => {
  const now = Date.now()
  t.is(formatDate(now), 'Just now')
  t.is(formatDate(now - 60_000), 'Just now')
  t.is(formatDate(now - 300_000), '5m ago')
  t.is(formatDate(now - 2 * 60 * 60 * 1000), '2h ago')
  t.is(formatDate(now - DAY_MS), 'Yesterday')
  t.is(formatDate(now - 3 * DAY_MS), '3d ago')
  t.is(formatDate(0), '')
})

test('getGroupTitle - past timestamps are unchanged', (t) => {
  const now = Date.now()
  t.is(getGroupTitle(noteAt(now - 60_000)), NOTES_LIST_GROUP.TODAY)
  t.is(getGroupTitle(noteAt(now - DAY_MS)), NOTES_LIST_GROUP.YESTERDAY)
  t.is(getGroupTitle(noteAt(now - 3 * DAY_MS)), NOTES_LIST_GROUP.L7DAYS)
  t.is(getGroupTitle(noteAt(now - 20 * DAY_MS)), NOTES_LIST_GROUP.L30DAYS)
  t.is(getGroupTitle({ value: {} }), 'No Date')
})
