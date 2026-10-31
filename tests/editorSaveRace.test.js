// A local write whose backend ack is slower than its own subscription echo used
// to be read as a remote edit: that raised a conflict on a single device with no
// peers, and updateNoteSaga then silently dropped every later editor save.
import test from 'brittle'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'

import { setRPC } from '../rpc.js'
import notesReducer from '../store/slices/notesSlice.js'
import foldersReducer from '../store/slices/foldersSlice.js'
import editorReducer from '../store/slices/editorSlice.js'
import { watchNotesSaga } from '../store/sagas/notesSaga.js'
import { watchEditorSaga } from '../store/sagas/editorSaga.js'
import {
  setNoteKeys,
  setNoteData,
  setSelectedNote,
  updateNote,
  flushNoteSaves
} from '../store/slices/notesSlice.js'
import { setEditorContent } from '../store/slices/editorSlice.js'

class FakeStream {
  on() {}
  destroy() {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function build({ writeLatencyMs }) {
  const sent = []
  setRPC({
    commandSubscribeNoteKeys: async () => new FakeStream(),
    commandSubscribeNote: async () => new FakeStream(),
    commandGetSingleNote: async ({ key }) => ({ key, data: {} }),
    commandUpdateNote: async (args) => {
      sent.push(args)
      await sleep(writeLatencyMs)
      return { done: true }
    }
  })

  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: combineReducers({
      notes: notesReducer,
      folders: foldersReducer,
      editor: editorReducer
    }),
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware)
  })
  sagaMiddleware.run(function* () {
    yield* [] // noop
  })
  sagaMiddleware.run(watchNotesSaga)
  sagaMiddleware.run(watchEditorSaga)
  return { store, sent }
}

test('a local write whose echo beats its ack does not conflict, and saves keep working', async (t) => {
  const { store, sent } = build({ writeLatencyMs: 700 })

  // Note n1 exists with body "A"; open it in the editor.
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>A</p>', folderKey: 'f1' } })
  )
  store.dispatch(setSelectedNote('n1'))
  await sleep(50)

  t.is(store.getState().editor.baseContent, '<p>A</p>', 'editor base starts at the stored body')

  // t=0 user types "AB" -> mirrored to the store, and saved.
  store.dispatch(setEditorContent({ html: '<p>AB</p>', text: 'AB' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())

  // t=50 user keeps typing before the first write has come back.
  await sleep(50)
  store.dispatch(setEditorContent({ html: '<p>ABC</p>', text: 'ABC' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>ABC</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())

  // t=100 the backend applied write #1 and the subscription pushes it back,
  // while the RPC ack for it is still in flight.
  await sleep(50)
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>AB</p>', folderKey: 'f1' } })
  )

  // let the 400ms editor debounce fire, then let the writes land
  await sleep(1200)

  t.absent(
    store.getState().editor.conflict,
    'our own echo is recognised as ours even though the ack came back after it'
  )

  const before = sent.length
  store.dispatch(setEditorContent({ html: '<p>ABCD</p>', text: 'ABCD' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>ABCD</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(300)

  t.is(sent.length, before + 1, 'the next edit still reached the backend')
  t.ok(
    sent.some((s) => s.note === '<p>ABCD</p>'),
    'and carried the typed body'
  )
})

test('control: the same sequence with a fast write does not conflict', async (t) => {
  const { store, sent } = build({ writeLatencyMs: 5 })

  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>A</p>', folderKey: 'f1' } })
  )
  store.dispatch(setSelectedNote('n1'))
  await sleep(50)

  store.dispatch(setEditorContent({ html: '<p>AB</p>', text: 'AB' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(50)
  store.dispatch(setEditorContent({ html: '<p>ABC</p>', text: 'ABC' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>ABC</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(50)
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>AB</p>', folderKey: 'f1' } })
  )

  await sleep(1200)

  t.absent(
    store.getState().editor.conflict,
    'no conflict when the write acks before the echo is processed'
  )

  const before = sent.length
  store.dispatch(setEditorContent({ html: '<p>ABCD</p>', text: 'ABCD' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>ABCD</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(200)
  t.is(sent.length, before + 1, 'and the next edit still saves')
})

test('a backend that refuses the write does not advance the editor base', async (t) => {
  const sent = []
  setRPC({
    commandSubscribeNoteKeys: async () => new FakeStream(),
    commandSubscribeNote: async () => new FakeStream(),
    commandGetSingleNote: async ({ key }) => ({ key, data: {} }),
    commandUpdateNote: async (args) => {
      sent.push(args)
      return { done: false } // e.g. the note is not in the view, or the append threw
    }
  })

  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: combineReducers({
      notes: notesReducer,
      folders: foldersReducer,
      editor: editorReducer
    }),
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(sagaMiddleware)
  })
  // A refused editor save is retried until it lands, and this backend never
  // takes it. Stop the watcher so those retries cannot reach the next test's
  // RPC, which `setRPC` installs globally.
  const notesTask = sagaMiddleware.run(watchNotesSaga)
  const editorTask = sagaMiddleware.run(watchEditorSaga)
  t.teardown(() => {
    notesTask.cancel()
    editorTask.cancel()
  })

  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>A</p>', folderKey: 'f1' } })
  )
  store.dispatch(setSelectedNote('n1'))
  await sleep(50)

  store.dispatch(setEditorContent({ html: '<p>AB</p>', text: 'AB' }))
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(200)

  t.is(sent.length, 1, 'the write was attempted')
  t.is(
    store.getState().editor.baseContent,
    '<p>A</p>',
    'the base still holds the last body the core actually confirmed'
  )
  t.not(
    store.getState().editor.baseContent,
    '<p>AB</p>',
    'a refused write is never treated as saved'
  )
})

test('leaving a note with an unresolved conflict keeps the typed buffer', async (t) => {
  const { store, sent } = build({ writeLatencyMs: 5 })

  store.dispatch(setNoteKeys(['n1', 'n2']))
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>A</p>', folderKey: 'f1' } })
  )
  store.dispatch(
    setNoteData({ key: 'n2', data: { title: 'Other', note: '<p>x</p>', folderKey: 'f1' } })
  )
  store.dispatch(setSelectedNote('n1'))
  await sleep(50)

  // The user types, and a genuine remote edit lands on the same note.
  store.dispatch(setEditorContent({ html: '<p>my typing</p>', text: 'my typing' }))
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>their edit</p>', folderKey: 'f1' } })
  )
  await sleep(700)

  t.ok(store.getState().editor.conflict, 'a genuine conflict is raised')

  const before = sent.length
  store.dispatch(setSelectedNote(null)) // back out of the editor
  await sleep(300)

  const written = sent.slice(before)
  t.is(written.length, 1, 'leaving the note writes the held buffer')
  t.is(written[0].key, 'n1', 'against the note that was conflicted')
  t.is(
    written[0].note,
    '<p>my typing</p>',
    'and it is the text the user typed, not the remote body'
  )
  t.absent(store.getState().editor.conflict, 'the conflict is cleared once resolved')
})
