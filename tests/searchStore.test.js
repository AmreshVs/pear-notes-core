import test from 'brittle'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'

import { setRPC } from '../rpc.js'
import { ALL_NOTES_KEY, LOCKED_NOTES_KEY, RECENTLY_DELETED_KEY } from '../constant.js'
import notesReducer, {
  getFilteredNotes,
  getNoteCountsPerFolder,
  setNoteData,
  setNoteKeys
} from '../store/slices/notesSlice.js'
import foldersReducer, { setSelectedFolder } from '../store/slices/foldersSlice.js'
import uiReducer, { setSearchQuery } from '../store/slices/uiSlice.js'
import settingsReducer from '../store/slices/settingsSlice.js'
import searchReducer, {
  SEARCH_SCOPE,
  getSearchHit,
  getSearchSettled,
  refreshSearch,
  setSearchIncludeLocked,
  setSearchScope
} from '../store/slices/searchSlice.js'
import { SEARCH_DEBOUNCE_MS, watchSearchSaga } from '../store/sagas/searchSaga.js'

const RECIPES = 'folder-recipes'
const WORK = 'folder-work'
const SETTLE_MS = SEARCH_DEBOUNCE_MS + 60

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const NOTES = {
  pasta: { title: 'Weeknight pasta', folderKey: RECIPES, updatedAt: 3 },
  confit: { title: 'Garlic confit', folderKey: RECIPES, updatedAt: 2 },
  memo: { title: 'Quarterly memo', folderKey: WORK, updatedAt: 1 },
  trashed: { title: 'Old garlic note', folderKey: RECENTLY_DELETED_KEY, updatedAt: 0 },
  secret: { title: 'Diary', folderKey: RECENTLY_DELETED_KEY + 'x', updatedAt: 0, locked: true }
}

function setup(answer) {
  const calls = []
  setRPC({
    commandSearchNotes: async (args) => {
      calls.push(args)
      return answer(args)
    },
    commandPrewarmSearch: async () => ({ ready: true })
  })
  const saga = createSagaMiddleware()
  const store = configureStore({
    reducer: combineReducers({
      notes: notesReducer,
      folders: foldersReducer,
      ui: uiReducer,
      settings: settingsReducer,
      search: searchReducer
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(saga)
  })
  const task = saga.run(watchSearchSaga)
  store.dispatch(setNoteKeys(Object.keys(NOTES)))
  for (const [key, data] of Object.entries(NOTES)) store.dispatch(setNoteData({ key, data }))
  store.dispatch(setSelectedFolder(RECIPES))
  return { store, calls, stop: () => task.cancel() }
}

const visible = (store) => getFilteredNotes(store.getState()).map((n) => n.key)

const garlicHits = ({ query, folderKey }) => {
  if (query !== 'garlic') return { query, results: [], total: 0 }
  const results = [{ key: 'pasta', inTitle: false, snippet: '…two garlic cloves…', ranges: [5, 11] }]
  if (folderKey === ALL_NOTES_KEY) {
    results.push({ key: 'memo', inTitle: false, snippet: 'garlic bread at lunch', ranges: [0, 6] })
  }
  return { query, results, total: results.length }
}

test('title matches show at once and body matches join when the backend answers', async (t) => {
  const { store, calls, stop } = setup(garlicHits)
  t.teardown(stop)
  store.dispatch(setSearchQuery('garlic'))
  t.alike(visible(store), ['confit'], 'title filter is instant')
  await wait(SETTLE_MS)
  t.alike(visible(store), ['pasta', 'confit'])
  t.is(calls.length, 1)
  t.is(calls[0].folderKey, RECIPES)
  t.is(getSearchHit(store.getState(), 'pasta').snippet, '…two garlic cloves…')
})

test('typing quickly sends one search for the final query', async (t) => {
  const { store, calls, stop } = setup(garlicHits)
  t.teardown(stop)
  for (const prefix of ['g', 'ga', 'gar', 'garl', 'garli', 'garlic']) {
    store.dispatch(setSearchQuery(prefix))
  }
  await wait(SETTLE_MS)
  t.is(calls.length, 1)
  t.is(calls[0].query, 'garlic')
})

test('the all notes scope searches every folder but never the trash', async (t) => {
  const { store, calls, stop } = setup(garlicHits)
  t.teardown(stop)
  store.dispatch(setSearchScope(SEARCH_SCOPE.ALL))
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  t.is(calls.at(-1).folderKey, ALL_NOTES_KEY)
  t.alike(visible(store), ['pasta', 'confit', 'memo'])
})

test('the locked view lists locked notes from every folder but never the trash', async (t) => {
  const { store, stop } = setup(garlicHits)
  t.teardown(stop)
  store.dispatch(setNoteKeys([...Object.keys(NOTES), 'binned', 'safe']))
  store.dispatch(
    setNoteData({
      key: 'binned',
      data: { title: 'Binned', folderKey: RECENTLY_DELETED_KEY, locked: true }
    })
  )
  store.dispatch(
    setNoteData({ key: 'safe', data: { title: 'Safe', folderKey: WORK, locked: true } })
  )
  store.dispatch(setSelectedFolder(LOCKED_NOTES_KEY))
  t.alike(visible(store).sort(), ['safe', 'secret'])
  t.is(getNoteCountsPerFolder(store.getState())[LOCKED_NOTES_KEY], 2)
})

test('searching the locked view asks every folder and still shows only locked notes', async (t) => {
  const { store, calls, stop } = setup(garlicHits)
  t.teardown(stop)
  store.dispatch(setSelectedFolder(LOCKED_NOTES_KEY))
  store.dispatch(setSearchScope(SEARCH_SCOPE.ALL))
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  t.is(calls.at(-1).folderKey, ALL_NOTES_KEY)
  t.alike(visible(store), [])
})

test('clearing the query restores the folder list exactly', async (t) => {
  const { store, stop } = setup(garlicHits)
  t.teardown(stop)
  const before = visible(store)
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  store.dispatch(setSearchQuery(''))
  await wait(SETTLE_MS)
  t.alike(visible(store), before)
  t.is(getSearchHit(store.getState(), 'pasta'), null)
})

test('a failed backend search leaves the title results in place', async (t) => {
  const { store, stop } = setup(() => {
    throw new Error('backend gone')
  })
  t.teardown(stop)
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  t.alike(visible(store), ['confit'])
})

test('an unlocked session is passed to the backend', async (t) => {
  const { store, calls, stop } = setup(garlicHits)
  t.teardown(stop)
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  t.is(calls.at(-1).includeLocked, false)
  store.dispatch(setSearchIncludeLocked(true))
  await wait(SETTLE_MS)
  t.is(calls.at(-1).includeLocked, true)
})

test('a stale answer for an older query is ignored', async (t) => {
  const { store, stop } = setup(({ query }) => ({
    query: 'something else',
    results: [{ key: 'memo', inTitle: false, snippet: query, ranges: [] }],
    total: 1
  }))
  t.teardown(stop)
  store.dispatch(setSearchScope(SEARCH_SCOPE.ALL))
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  t.absent(visible(store).includes('memo'))
})

test('the search is unsettled until the backend answers the current query', async (t) => {
  const { store, stop } = setup(garlicHits)
  t.teardown(stop)
  t.ok(getSearchSettled(store.getState()), 'no query is settled')
  store.dispatch(setSearchQuery('garlic'))
  t.absent(getSearchSettled(store.getState()), 'typing is not settled')
  await wait(SETTLE_MS)
  t.ok(getSearchSettled(store.getState()))
  store.dispatch(refreshSearch())
  await wait(5)
  t.ok(getSearchSettled(store.getState()), 'a refresh of the same query stays settled')
  store.dispatch(setSearchQuery('garlics'))
  t.absent(getSearchSettled(store.getState()), 'a new query is not settled')
})

test('a locked note found by its body drops out as soon as notes are locked again', async (t) => {
  const { store, stop } = setup(({ query }) => ({
    query,
    results: [{ key: 'secret', inTitle: false, snippet: '', ranges: [] }],
    total: 1
  }))
  t.teardown(stop)
  store.dispatch(setSearchIncludeLocked(true))
  store.dispatch(setSearchScope(SEARCH_SCOPE.ALL))
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  t.ok(visible(store).includes('secret'), 'unlocked session shows the body hit')
  store.dispatch(setSearchIncludeLocked(false))
  t.absent(visible(store).includes('secret'), 'hidden before the new search answers')
})

test('unchanged hits keep their identity across result sets', async (t) => {
  let round = 0
  const { store, stop } = setup(({ query }) => {
    round++
    const results = [{ key: 'pasta', inTitle: false, snippet: 'same', ranges: [0, 4] }]
    if (round > 1) results.push({ key: 'memo', inTitle: false, snippet: 'new', ranges: [] })
    return { query, results, total: results.length }
  })
  t.teardown(stop)
  store.dispatch(setSearchScope(SEARCH_SCOPE.ALL))
  store.dispatch(setSearchQuery('garlic'))
  await wait(SETTLE_MS)
  const before = getSearchHit(store.getState(), 'pasta')
  store.dispatch(refreshSearch())
  await wait(20)
  t.ok(getSearchHit(store.getState(), 'memo'), 'the new hit arrived')
  t.is(getSearchHit(store.getState(), 'pasta'), before, 'the unchanged hit is the same object')
})

test('typing more keeps the previous body hits until the new answer arrives', async (t) => {
  const { store, stop } = setup(({ query }) => ({
    query,
    results: [{ key: 'pasta', inTitle: false, snippet: query, ranges: [] }],
    total: 1
  }))
  t.teardown(stop)
  store.dispatch(setSearchQuery('tex'))
  await wait(SETTLE_MS)
  t.ok(visible(store).includes('pasta'))
  store.dispatch(setSearchQuery('text'))
  t.ok(visible(store).includes('pasta'), 'the row stays during the debounce')
  await wait(SETTLE_MS)
  t.is(getSearchHit(store.getState(), 'pasta').snippet, 'text')
})
