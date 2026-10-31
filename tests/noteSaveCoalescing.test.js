import test from 'brittle'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'

import { setRPC } from '../rpc.js'
import notesReducer, {
  deleteNote,
  flushNoteSaves,
  selectNote,
  setNoteData,
  setVisibleNotes,
  setNoteKeys,
  setSelectedNote,
  subscribeAllNotes,
  updateNote
} from '../store/slices/notesSlice.js'
import foldersReducer from '../store/slices/foldersSlice.js'
import editorReducer, { syncEditorWithNote } from '../store/slices/editorSlice.js'
import {
  EDITOR_SAVE_IDLE_MS,
  EDITOR_SAVE_MAX_WAIT_MS,
  hasPendingNoteSaves,
  noteSavesSettled,
  watchNotesSaga
} from '../store/sagas/notesSaga.js'
import { watchEditorSaga } from '../store/sagas/editorSaga.js'
import { decode, encode } from '../spec/hyperschema/index.js'
import { buildNoteSummary, getNoteSummary } from '../utils.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeStream {
  constructor() {
    this.handlers = {}
  }
  on(event, handler) {
    this.handlers[event] = handler
  }
  emit(event, payload) {
    this.handlers[event]?.(payload)
  }
  destroy() {
    this.emit('close')
  }
}

function build(t, { stored = {}, editor = false, refuse = 0, editorBase = 'n1' } = {}) {
  const sent = []
  const subscriptions = []
  const deleted = []
  const trashed = []
  setRPC({
    commandSubscribeNoteKeys: async () => new FakeStream(),
    commandSubscribeNote: async (args) => {
      const stream = new FakeStream()
      subscriptions.push({ ...args, stream })
      return stream
    },
    commandGetSingleNote: async ({ key }) => ({ key, data: stored[key] || {} }),
    commandUpdateNote: async (args) => {
      sent.push(args)
      if (refuse > 0) {
        refuse--
        return { done: false }
      }
      return { done: true }
    },
    commandDeleteNote: async ({ key }) => {
      deleted.push(key)
      return { done: true }
    },
    commandTrashNote: async ({ key }) => {
      trashed.push(key)
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
  const tasks = [sagaMiddleware.run(watchNotesSaga)]
  if (editor) tasks.push(sagaMiddleware.run(watchEditorSaga))
  t.teardown(() => tasks.forEach((task) => task.cancel()))
  if (editorBase) store.dispatch(syncEditorWithNote({ key: editorBase, data: {} }))
  return { store, sent, subscriptions, deleted, trashed }
}

const fullNote = (note, extra = {}) => ({ title: 'T', note, folderKey: 'f1', ...extra })
const summaryNote = (note, extra = {}) => ({
  title: 'T',
  folderKey: 'f1',
  bodyOmitted: true,
  summary: buildNoteSummary(note),
  ...extra
})
const typed = (note) => updateNote({ key: 'n1', title: 'T', note, fromEditor: true })

test('a burst of keystrokes is saved once, after typing pauses', async (t) => {
  const { store, sent } = build(t)
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>A</p>') }))

  for (const body of ['<p>AB</p>', '<p>ABC</p>', '<p>ABCD</p>', '<p>ABCDE</p>']) {
    store.dispatch(typed(body))
    await sleep(20)
  }
  t.is(sent.length, 0, 'nothing is written while typing')

  await sleep(EDITOR_SAVE_IDLE_MS + 200)
  t.is(sent.length, 1, 'one write once typing paused')
  t.is(sent[0].note, '<p>ABCDE</p>', 'carrying the latest body')
})

test('continuous typing is still saved at least every max-wait interval', async (t) => {
  const { store, sent } = build(t)
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>A</p>') }))

  const started = Date.now()
  let n = 0
  while (Date.now() - started < EDITOR_SAVE_MAX_WAIT_MS + 400) {
    store.dispatch(typed(`<p>${'x'.repeat(++n)}</p>`))
    await sleep(EDITOR_SAVE_IDLE_MS / 4)
  }
  t.ok(sent.length >= 1, 'a save landed while the user never paused')
  t.ok(sent.length <= 2, 'but not one per keystroke')
})

test('a pin on a note with a pending edit writes the edit first', async (t) => {
  const { store, sent } = build(t)
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>A</p>') }))

  store.dispatch(typed('<p>AB</p>'))
  store.dispatch(updateNote({ key: 'n1', pinned: true }))
  await sleep(100)

  t.is(sent.length, 2, 'both writes went out without waiting for the idle timer')
  t.is(sent[0].note, '<p>AB</p>', 'the edit first')
  t.is(sent[1].pinned, true, 'then the pin')
})

test('switching notes and flushing both send a pending edit at once', async (t) => {
  const { store, sent } = build(t)
  store.dispatch(setNoteKeys(['n1', 'n2']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>A</p>') }))
  store.dispatch(setNoteData({ key: 'n2', data: fullNote('<p>B</p>') }))

  store.dispatch(typed('<p>AB</p>'))
  store.dispatch(setSelectedNote('n2'))
  await sleep(50)
  t.is(sent.length, 1, 'leaving the note saved it')

  store.dispatch(syncEditorWithNote({ key: 'n2', data: fullNote('<p>B</p>') }))
  store.dispatch(updateNote({ key: 'n2', title: 'T', note: '<p>BC</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await noteSavesSettled()
  t.is(sent.length, 2, 'an explicit flush saved it and noteSavesSettled waited for the write')
  t.is(sent[1].note, '<p>BC</p>')
})

test('a retry of an older save never lands after a newer queued edit', async (t) => {
  const { store, sent } = build(t)
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>A</p>') }))

  store.dispatch(typed('<p>ABC</p>'))
  store.dispatch(
    updateNote({ key: 'n1', title: 'T', note: '<p>AB</p>', fromEditor: true, retryAttempt: 1 })
  )
  await sleep(EDITOR_SAVE_IDLE_MS + 200)

  t.alike(
    sent.map((s) => s.note),
    ['<p>ABC</p>'],
    'only the newer body was written'
  )
})

test('a pin on a summary-only note sends the stored body, never an empty one', async (t) => {
  const { store, sent } = build(t, { stored: { n1: fullNote('<p>keep me</p>') } })
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: summaryNote('<p>keep me</p>') }))

  store.dispatch(updateNote({ key: 'n1', pinned: true }))
  await sleep(100)

  t.is(sent.length, 1)
  t.is(sent[0].note, '<p>keep me</p>', 'the body was read from the backend')
  t.is(sent[0].pinned, true)
})

test('a pin is dropped when the body of a summary-only note cannot be read', async (t) => {
  const { store, sent } = build(t, { stored: {} })
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: summaryNote('<p>keep me</p>') }))

  store.dispatch(updateNote({ key: 'n1', pinned: true }))
  await sleep(100)

  t.is(sent.length, 0, 'nothing was written over the body')
})

test('deleting a summary-only note decides trash vs delete from the stored body', async (t) => {
  const { store, deleted, trashed } = build(t, {
    stored: { n1: fullNote('<p></p><p>text</p>', { title: '' }) }
  })
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: summaryNote('<p>text</p>', { title: '' }) }))

  store.dispatch(deleteNote('n1'))
  await sleep(100)

  t.alike(trashed, ['n1'], 'a note with a body goes to the trash')
  t.alike(deleted, [], 'and is not deleted for good')
})

test('only the open note streams its body', async (t) => {
  const { store, subscriptions } = build(t)
  store.dispatch(setNoteKeys(['n1', 'n2', 'n3']))
  store.dispatch(setSelectedNote('n2'))
  store.dispatch(subscribeAllNotes())
  await sleep(50)

  const modeOf = (key) => subscriptions.filter((s) => s.key === key).map((s) => s.summary)
  t.alike(modeOf('n1'), [true], 'list rows subscribe to summaries')
  t.alike(modeOf('n2'), [false], 'the open note subscribes to its body')

  store.dispatch(setSelectedNote('n3'))
  await sleep(50)
  t.alike(modeOf('n2'), [false, true], 'the note left behind drops back to a summary')
  t.alike(modeOf('n3'), [true, false], 'the newly opened note switches to its body')
  t.alike(modeOf('n1'), [true], 'other rows are untouched')
})

test('a summary never reaches the editor; the body does', async (t) => {
  const { store } = build(t, { editor: true, editorBase: null })
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: summaryNote('<p>hello</p>') }))
  store.dispatch(setSelectedNote('n1'))
  await sleep(50)
  t.not(store.getState().editor.baseKey, 'n1', 'the editor did not load an empty body')

  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>hello</p>') }))
  await sleep(50)
  t.is(store.getState().editor.baseKey, 'n1', 'the body loaded the note')
  t.is(store.getState().editor.content, '<p>hello</p>')

  store.dispatch(setNoteData({ key: 'n1', data: summaryNote('<p>other</p>') }))
  await sleep(600)
  t.is(store.getState().editor.content, '<p>hello</p>', 'a later summary is not a remote edit')
  t.absent(store.getState().editor.conflict)
})

test('summary fields survive the wire and carry what list rows need', (t) => {
  const html =
    '<p>Hello <b>world</b></p><img src="http://hyperdrive/?key=k&amp;blob=1">' +
    '<div data-file-attachment="" url="http://hyperdrive/?key=k&amp;blob=2" filename="a.pdf" filetype="application/pdf"></div>' +
    '<ul data-type="taskList"><li data-type="taskItem">x</li></ul>'
  const summary = buildNoteSummary(html)
  t.is(summary.preview.startsWith('Hello world'), true)
  t.is(summary.firstImage, 'http://hyperdrive/?key=k&blob=1')
  t.is(summary.imageUrl, 'http://hyperdrive/?key=k&blob=1')
  t.alike(summary.pdfs, [{ url: 'http://hyperdrive/?key=k&blob=2', fileName: 'a.pdf' }])
  t.alike(summary.images, ['http://hyperdrive/?key=k&blob=1'])
  t.is(summary.isChecklist, true)
  t.alike(getNoteSummary({ note: html }), summary, 'a value without a summary derives one')

  const name = '@notes/command-subscribe-note-response'
  const wire = decode(
    name,
    encode(name, { data: { title: 'T', summary: JSON.stringify(summary), bodyOmitted: true } })
  )
  t.is(wire.data.bodyOmitted, true)
  t.alike(JSON.parse(wire.data.summary), summary)
  t.absent(wire.data.note, 'no body crossed the wire')

  const request = '@notes/command-subscribe-note-request'
  t.is(decode(request, encode(request, { key: 'n1', summary: true })).summary, true)
})

const streamOf = (subscriptions, key, summary) =>
  subscriptions.filter((s) => s.key === key && s.summary === summary).at(-1)?.stream
const wireNote = (note, hash, extra = {}) => ({
  title: 'T',
  note,
  folderKey: 'f1',
  updatedAt: 1,
  summary: JSON.stringify({ ...buildNoteSummary(note), hash }),
  ...extra
})
const wireSummary = (note, hash, extra = {}) => ({
  ...wireNote(note, hash, extra),
  note: undefined,
  bodyOmitted: true
})

test('opening a summary-only note switches at once and loads its body from its stream', async (t) => {
  const { store, subscriptions } = build(t, { editor: true })
  store.dispatch(setNoteKeys(['n1', 'n2']))
  store.dispatch(setSelectedNote('n1'))
  store.dispatch(subscribeAllNotes())
  await sleep(20)
  streamOf(subscriptions, 'n1', false).emit('data', { data: wireNote('<p>first</p>', 'h1') })
  streamOf(subscriptions, 'n2', true).emit('data', { data: wireSummary('<p>second</p>', 'h2') })
  await sleep(20)

  store.dispatch(selectNote('n2'))
  t.is(store.getState().notes.selectedNote, 'n2', 'the note opens without waiting for its body')
  t.not(store.getState().editor.baseKey, 'n2', 'and the editor is not loaded with an empty body')

  await sleep(20)
  streamOf(subscriptions, 'n2', false).emit('data', { data: wireNote('<p>second</p>', 'h2') })
  await sleep(20)
  t.is(store.getState().editor.baseKey, 'n2', 'the body from the stream loaded the note')
  t.is(store.getState().editor.content, '<p>second</p>')
})

test('leaving a note keeps its body while the content hash still matches', async (t) => {
  const { store, subscriptions } = build(t, { editor: true })
  store.dispatch(setNoteKeys(['n1', 'n2']))
  store.dispatch(setSelectedNote('n1'))
  store.dispatch(subscribeAllNotes())
  await sleep(20)
  streamOf(subscriptions, 'n1', false).emit('data', { data: wireNote('<p>first</p>', 'h1') })
  await sleep(20)

  store.dispatch(selectNote('n2'))
  await sleep(20)
  const before = store.getState().notes.notesData.n1
  streamOf(subscriptions, 'n1', true).emit('data', { data: wireSummary('<p>first</p>', 'h1') })
  await sleep(20)
  t.is(store.getState().notes.notesData.n1, before, 'no store update for an unchanged note')
  t.is(store.getState().notes.notesData.n1.note, '<p>first</p>', 'its body is kept')

  store.dispatch(selectNote('n1'))
  t.is(store.getState().editor.baseKey, 'n1', 'reopening it loads at once, no placeholder')
})

test('a kept body is dropped once the note changes, even within the same millisecond', async (t) => {
  const { store, subscriptions } = build(t)
  store.dispatch(setNoteKeys(['n1', 'n2']))
  store.dispatch(setSelectedNote('n1'))
  store.dispatch(subscribeAllNotes())
  await sleep(20)
  streamOf(subscriptions, 'n1', false).emit('data', { data: wireNote('<p>first</p>', 'h1') })
  await sleep(20)
  store.dispatch(selectNote('n2'))
  await sleep(20)

  streamOf(subscriptions, 'n1', true).emit('data', { data: wireSummary('<p>first!</p>', 'h1b') })
  await sleep(20)
  t.is(store.getState().notes.notesData.n1.bodyOmitted, true, 'a different hash drops the body')
})

test('notes on screen stream bodies, and drop back to summaries once scrolled away', async (t) => {
  const { store, subscriptions } = build(t)
  store.dispatch(setNoteKeys(['n1', 'n2', 'n3', 'n4']))
  store.dispatch(setSelectedNote('n4'))
  store.dispatch(subscribeAllNotes())
  await sleep(20)
  const modeOf = (key) => subscriptions.filter((s) => s.key === key).map((s) => !s.summary)
  t.alike(modeOf('n2'), [false], 'before the list reports anything, rows are summaries')

  store.dispatch(setVisibleNotes(['n1', 'n2']))
  await sleep(20)
  t.alike(modeOf('n1'), [false, true], 'a row on screen switches to its body')
  t.alike(modeOf('n3'), [false], 'a row off screen stays a summary')

  store.dispatch(setVisibleNotes(['n2', 'n3']))
  await sleep(20)
  t.alike(modeOf('n1'), [false, true, false], 'scrolled away, it drops back to a summary')
  t.alike(modeOf('n2'), [false, true], 'still on screen, its stream is left alone')
  t.alike(modeOf('n3'), [false, true])
})

test('bodies hydrating together land as a single store update', async (t) => {
  const { store, subscriptions } = build(t)
  store.dispatch(setNoteKeys(['n1', 'n2', 'n3', 'n4']))
  store.dispatch(setSelectedNote('n4'))
  store.dispatch(subscribeAllNotes())
  store.dispatch(setVisibleNotes(['n1', 'n2', 'n3']))
  await sleep(20)

  let updates = 0
  const unsubscribe = store.subscribe(() => updates++)
  for (const key of ['n1', 'n2', 'n3']) {
    streamOf(subscriptions, key, false).emit('data', { data: wireNote(`<p>${key}</p>`, key) })
  }
  await sleep(40)
  unsubscribe()

  t.is(updates, 1, 'one render for the whole batch')
  t.is(store.getState().notes.notesData.n3.note, '<p>n3</p>')
})

test('a save waiting to retry is still pending, and a flush sends it at once', async (t) => {
  const { store, sent } = build(t, { refuse: 1 })
  store.dispatch(setNoteKeys(['n1']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>A</p>') }))

  store.dispatch(typed('<p>AB</p>'))
  store.dispatch(flushNoteSaves())
  await sleep(50)
  t.is(sent.length, 1, 'the first attempt was refused')
  t.ok(hasPendingNoteSaves(), 'the edit waiting to retry still counts as unsaved')

  const started = Date.now()
  store.dispatch(flushNoteSaves())
  await noteSavesSettled()
  t.ok(Date.now() - started < 500, 'the flush did not wait out the backoff')
  t.is(sent.length, 2, 'the retry went out')
  t.is(sent[1].note, '<p>AB</p>')
  t.absent(hasPendingNoteSaves(), 'and settled only once it landed')
})

test('an editor save for a note the editor is not showing is dropped', async (t) => {
  const { store, sent } = build(t, { editorBase: 'n1' })
  store.dispatch(setNoteKeys(['n1', 'n2']))
  store.dispatch(setNoteData({ key: 'n1', data: fullNote('<p>one</p>') }))
  store.dispatch(setNoteData({ key: 'n2', data: fullNote('<p>two</p>') }))

  store.dispatch(updateNote({ key: 'n2', title: 'T', note: '<p>one</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(50)
  t.is(sent.length, 0, "the open note's content was not written into another note")

  store.dispatch(updateNote({ key: 'n1', title: 'T', note: '<p>one!</p>', fromEditor: true }))
  store.dispatch(flushNoteSaves())
  await sleep(50)
  t.is(sent.length, 1, 'a save for the note on screen still goes out')
})
