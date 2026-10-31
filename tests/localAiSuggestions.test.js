import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { backendApi } from '../backend/api.js'
import { setLocalAiAdapter } from '../store/services/localAiAdapter.js'
import {
  createDefaultLocalAiConfig,
  LOCAL_AI_MODEL_STATUS
} from '../store/services/localAiCatalog.js'
import { watchNoteSuggestions } from '../store/sagas/localAiSuggestionsSaga.js'
import localAiReducer from '../store/slices/localAiSlice.js'
import { setEditorContent } from '../store/slices/editorSlice.js'
import { selectNote } from '../store/slices/notesSlice.js'

const BODY =
  '<p>Packing list for the Lisbon trip in November: passport, chargers, walking shoes, a light jacket and the guidebook. Book the airport taxi for 6am.</p>'

function harness() {
  const config = createDefaultLocalAiConfig()
  config.features.summarizeRecordings = {
    enabled: true,
    tier: 'standard',
    language: 'auto',
    model: null
  }
  let state = {
    localAi: {
      ...localAiReducer(undefined, { type: 'init' }),
      loaded: true,
      config,
      device: { status: 'supported', totalMemoryBytes: 8 * 1024 ** 3 },
      models: { QWEN3_600M_INST_Q4: { status: LOCAL_AI_MODEL_STATUS.READY } }
    },
    notes: {
      selectedNote: null,
      notesData: {
        trip: { title: '', bodyOmitted: true, updatedAt: 5, folderKey: 'f' },
        loose: { title: '', bodyOmitted: true, updatedAt: 7, folderKey: 'u' }
      }
    },
    folders: { folderData: { f: { title: 'Travel' }, u: { title: 'Untitled' } } },
    editor: {}
  }
  const channel = stdChannel()
  const task = runSaga(
    {
      channel,
      getState: () => state,
      dispatch: (action) => {
        if (action.type.startsWith('localAi/')) {
          state = { ...state, localAi: localAiReducer(state.localAi, action) }
        }
        channel.put(action)
      }
    },
    watchNoteSuggestions
  )
  return {
    put: (action) => {
      if (action.type === selectNote.type) {
        state = { ...state, notes: { ...state.notes, selectedNote: action.payload } }
      }
      channel.put(action)
    },
    state: () => state,
    stop: () => task.cancel()
  }
}

test('an untitled note whose body only the backend has still gets a title chip', async (t) => {
  const saved = { ...backendApi }
  backendApi.getSingleNote = async () => ({ data: { note: BODY, folderKey: 'f' } })
  const asked = []
  setLocalAiAdapter({
    runNoteTaskInBackground: async (task, text) => {
      asked.push([task, text.length])
      return 'Title: Lisbon packing list'
    },
    cancelTask: async () => {}
  })
  const app = harness()
  t.teardown(() => {
    app.stop()
    Object.assign(backendApi, saved)
    setLocalAiAdapter(null)
  })
  app.put(selectNote('trip'))
  await new Promise((resolve) => setTimeout(resolve, 8000))
  t.is(asked.length, 1, 'the title job ran once')
  t.is(asked[0][0], 'title')
  t.is(app.state().localAi.suggestions.noteKey, 'trip')
  t.is(app.state().localAi.suggestions.title, 'Lisbon packing list')
})

test('a new note gets a title chip once enough is typed, not only when opened', async (t) => {
  const saved = { ...backendApi }
  let body = '<p>Packing</p>'
  backendApi.getSingleNote = async () => ({ data: { note: body, folderKey: 'f' } })
  const asked = []
  setLocalAiAdapter({
    runNoteTaskInBackground: async (task) => {
      asked.push(task)
      return 'Title: Lisbon packing list'
    },
    cancelTask: async () => {}
  })
  const app = harness()
  t.teardown(() => {
    app.stop()
    Object.assign(backendApi, saved)
    setLocalAiAdapter(null)
  })
  app.put(selectNote('trip'))
  await new Promise((resolve) => setTimeout(resolve, 7000))
  t.is(asked.length, 0, 'too short when it opened')
  body = BODY
  app.put(setEditorContent({ html: BODY, text: '' }))
  await new Promise((resolve) => setTimeout(resolve, 6000))
  t.is(
    app.state().localAi.suggestions.title,
    'Lisbon packing list',
    'tried again after typing paused'
  )
})

test('a note left in Untitled gets a folder chip: an existing folder, or a new name', async (t) => {
  const saved = { ...backendApi }
  backendApi.getSingleNote = async () => ({ data: { note: BODY, folderKey: 'u' } })
  let folderName = 'travel'
  setLocalAiAdapter({
    runNoteTaskInBackground: async (task) =>
      task === 'folderName' ? folderName : 'Title: Lisbon packing list',
    cancelTask: async () => {}
  })
  const app = harness()
  t.teardown(() => {
    app.stop()
    Object.assign(backendApi, saved)
    setLocalAiAdapter(null)
  })
  app.put(selectNote('loose'))
  await new Promise((resolve) => setTimeout(resolve, 7500))
  t.alike(app.state().localAi.suggestions.folder, { folderKey: 'f' }, 'matches the Travel folder')
  folderName = 'Packing lists'
  app.put(selectNote('trip'))
  app.put(selectNote('loose'))
  app.put(setEditorContent({ html: BODY + '<p>more</p>', text: '' }))
  await new Promise((resolve) => setTimeout(resolve, 7500))
  t.ok(app.state().localAi.suggestions.folder, 'a folder chip is offered again on reopen')
})
