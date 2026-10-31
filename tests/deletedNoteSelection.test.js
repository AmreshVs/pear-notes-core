import test from 'brittle'

import reducer, {
  loadNotesSuccess,
  setNoteData,
  setNoteKeys,
  setSelectedNote
} from '../store/slices/notesSlice.js'

const apply = (state, ...actions) => actions.reduce((next, action) => reducer(next, action), state)

// The key list and the bodies arrive on separate channels, so every update
// replays both the way subscribeAllNoteKeysSaga dispatches them.
const keys = (state, list) => apply(state, setNoteKeys(list), loadNotesSuccess(list))

const withBodies = (state, list) =>
  apply(
    state,
    ...list.map((key) => setNoteData({ key, data: { title: key, note: `<p>${key}</p>` } }))
  )

test('the first note opens by itself once the list arrives', (t) => {
  const booted = keys(undefined, ['a', 'b'])
  t.is(booted.selectedNote, 'a')
  t.is(booted.isLoading, false)

  // A device that boots before its first sync: the notes land later, and the
  // editor should still open one.
  const paired = keys(keys(undefined, []), ['x'])
  t.is(paired.selectedNote, 'x')
})

test('trashing the open note leaves it open', (t) => {
  const state = keys(withBodies(keys(undefined, ['a', 'b']), ['a', 'b']), ['a', 'b'])
  t.is(state.selectedNote, 'a')
  t.ok(state.notesData.a)
})

test('deleting the open note for good empties the editor', (t) => {
  const open = withBodies(keys(undefined, ['a', 'b']), ['a', 'b'])
  const deleted = keys(open, ['b'])

  t.is(deleted.selectedNote, null, 'no note is selected')
  t.absent(deleted.notesData.a, 'the deleted body is dropped')
  t.ok(deleted.notesData.b, 'the other body is kept')

  // Nothing may hand the editor a note the user did not pick.
  t.is(keys(deleted, ['b', 'c']).selectedNote, null)
})

test('deleting another note does not move the selection', (t) => {
  const state = apply(undefined, setNoteKeys(['a', 'b']), setSelectedNote('b'), setNoteKeys(['b']))
  t.is(state.selectedNote, 'b')
})
