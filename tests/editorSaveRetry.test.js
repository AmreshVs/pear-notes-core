// Editor saves are only sent when the content changes. A save the backend
// refused was therefore never sent again once the user stopped typing, and the
// edit lived only in the editor's memory until the note or the app was closed.
import test from 'brittle'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'

import { setRPC } from '../rpc.js'
import notesReducer from '../store/slices/notesSlice.js'
import foldersReducer from '../store/slices/foldersSlice.js'
import editorReducer, { syncEditorWithNote } from '../store/slices/editorSlice.js'
import { watchNotesSaga } from '../store/sagas/notesSaga.js'
import { setNoteData, setNoteKeys, updateNote, flushNoteSaves } from '../store/slices/notesSlice.js'

class FakeStream {
  on() {}
  destroy() {}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// `answers` is consumed one per save; once empty, every save succeeds.
function build(t, answers) {
  const sent = []
  setRPC({
    commandSubscribeNoteKeys: async () => new FakeStream(),
    commandSubscribeNote: async () => new FakeStream(),
    commandGetSingleNote: async ({ key }) => ({ key, data: {} }),
    commandUpdateNote: async (args) => {
      sent.push(args.note)
      const answer = answers.shift()
      if (answer === 'throw') throw new Error('rpc failed')
      return { done: answer !== 'refuse' }
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
  // `setRPC` is global, so a retry left running would reach the next test.
  const task = sagaMiddleware.run(watchNotesSaga)
  t.teardown(() => task.cancel())
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(
    setNoteData({ key: 'n1', data: { title: 'T', note: '<p>A</p>', folderKey: 'f1' } })
  )
  store.dispatch(syncEditorWithNote({ key: 'n1', data: { title: 'T', note: '<p>A</p>' } }))
  return { store, sent }
}

test('a refused editor save is sent again until it lands', async (t) => {
  const { store, sent } = build(t, ['refuse', 'refuse'])
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())

  await sleep(200)
  t.alike(sent, ['<p>AB</p>'], 'the first save was refused and nothing else was typed')

  // Backoff is 1s, then 2s.
  await sleep(3500)
  t.alike(sent, ['<p>AB</p>', '<p>AB</p>', '<p>AB</p>'], 'it is resent until the backend takes it')

  await sleep(1500)
  t.is(sent.length, 3, 'and not again once it has landed')
})

test('a save whose RPC threw is retried too', async (t) => {
  const { store, sent } = build(t, ['throw'])
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(1500)
  t.alike(sent, ['<p>AB</p>', '<p>AB</p>'], 'the thrown save was resent')
})

test('a newer edit replaces the retry of an older one', async (t) => {
  const { store, sent } = build(t, ['refuse'])
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(200)
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>ABC</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(1500)
  t.alike(sent, ['<p>AB</p>', '<p>ABC</p>'], 'the stale body is not written over the newer one')
})

test('a pin on the same note does not cancel an unsaved edit', async (t) => {
  const { store, sent } = build(t, ['refuse'])
  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(200)
  store.dispatch(updateNote({ key: 'n1', pinned: true }))
  await sleep(1500)
  t.is(sent.at(-1), '<p>AB</p>', 'the edit is still retried after an unrelated save')
})
