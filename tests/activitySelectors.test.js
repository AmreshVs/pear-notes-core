import test from 'brittle'
import {
  getActivityDiff,
  getNoteActivityEntries,
  setNoteActivityEntries
} from '../store/slices/activitySlice.js'
import activityReducer from '../store/slices/activitySlice.js'

const stateWith = (activity) => ({ activity })

const emptyState = stateWith(activityReducer(undefined, { type: '@@init' }))

test('a note with no history returns the same array reference every call', async (t) => {
  const selector = getNoteActivityEntries('missing-note')
  const first = selector(emptyState)
  const second = selector(emptyState)

  t.alike(first, [], 'reads as empty')
  t.is(
    first,
    second,
    'identical reference - a fresh [] each call makes React throw "getSnapshot should be cached"'
  )
})

test('separate selector instances still share the empty reference', async (t) => {
  const a = getNoteActivityEntries('note-a')(emptyState)
  const b = getNoteActivityEntries('note-b')(emptyState)
  t.is(a, b, 'both fall back to the same shared empty array')
})

test('a note with history returns its stored array', async (t) => {
  const entries = [{ id: '1', event: 'note.edited' }]
  const populated = stateWith(
    activityReducer(
      activityReducer(undefined, { type: '@@init' }),
      setNoteActivityEntries({ noteKey: 'note-a', entries })
    )
  )

  const selector = getNoteActivityEntries('note-a')
  t.is(selector(populated).length, 1, 'entries come through')
  t.is(selector(populated), selector(populated), 'and the reference is stable')
})

test('a missing diff returns a stable null rather than a fresh object', async (t) => {
  const selector = getActivityDiff('nope')
  t.is(selector(emptyState), null, 'null when absent')
  t.is(selector(emptyState), selector(emptyState), 'stable across calls')
})
