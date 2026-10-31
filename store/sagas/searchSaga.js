import { call, delay, fork, put, select, take, takeLatest } from 'redux-saga/effects'
import { ALL_NOTES_KEY, LOCKED_NOTES_KEY } from '../../constant.js'
import { backendApi } from '../../backend/api.js'
import * as log from '../../log.js'
import { getSearchQuery, setSearchQuery } from '../slices/uiSlice.js'
import { getSelectedFolder, setSelectedFolder } from '../slices/foldersSlice.js'
import {
  isSearchingAllNotes,
  setNoteKeys,
  setNoteData,
  setNotesDataBatch
} from '../slices/notesSlice.js'
import {
  MEANING_STATUS,
  clearSearchResults,
  getMeaningSearch,
  meaningResultsReceived,
  meaningSearchStarted,
  meaningSearchUnavailable,
  getSearchIncludeLocked,
  getSearchScope,
  prewarmSearch,
  refreshSearch,
  searchFailed,
  searchResultsReceived,
  searchStarted,
  setSearchIncludeLocked,
  setSearchScope
} from '../slices/searchSlice.js'
import { parseSearchQuery } from '../../backend/noteSearch.js'
import { getLocalAiAdapter } from '../services/localAiAdapter.js'
import { findMeaningHits } from '../services/localAiSearch.js'
import { getLocalAiIndex, getMeaningSearchReady } from '../slices/localAiSlice.js'

export const SEARCH_DEBOUNCE_MS = 120
export const SEARCH_REFRESH_INTERVAL_MS = 600
export const MEANING_SEARCH_DELAY_MS = 250
export const MEANING_SEARCH_LIMIT = 20

function* searchFolderKey(query) {
  const selected = yield select(getSelectedFolder)
  const scope = yield select(getSearchScope)
  if (selected === LOCKED_NOTES_KEY) return ALL_NOTES_KEY
  return isSearchingAllNotes(selected, parseSearchQuery(query), scope) ? ALL_NOTES_KEY : selected
}

function* runSearch(wait) {
  const query = ((yield select(getSearchQuery)) || '').trim()
  if (!query) {
    yield put(clearSearchResults())
    return
  }
  yield delay(wait)
  const folderKey = yield* searchFolderKey(query)
  const includeLocked = yield select(getSearchIncludeLocked)
  yield put(searchStarted(query))
  try {
    const response = yield call(backendApi.searchNotes, { query, folderKey, includeLocked })
    if (!response || response.failed) {
      yield put(searchFailed())
      return
    }
    if ((response.query || '') !== query) return
    yield put(
      searchResultsReceived({
        query,
        folderKey,
        results: response.results || [],
        total: response.total || 0
      })
    )
  } catch (e) {
    log.error('searchNotes failed', e)
    yield put(searchFailed())
    return
  }
  yield* runMeaningSearch(query, wait === 0)
}

function* runMeaningSearch(query, refresh) {
  const embed = getLocalAiAdapter()?.embedTexts
  if (!embed || !(yield select(getMeaningSearchReady))) return
  const indexAt = (yield select(getLocalAiIndex)).changedAt || 0
  const current = yield select(getMeaningSearch)
  const cached = current.status === MEANING_STATUS.DONE && current.indexAt === indexAt
  if (cached && current.query === query) return
  if (!refresh) yield delay(MEANING_SEARCH_DELAY_MS)
  yield put(meaningSearchStarted({ query, indexAt }))
  try {
    const hits = yield call(findMeaningHits, {
      api: backendApi,
      embed,
      query,
      limit: MEANING_SEARCH_LIMIT
    })
    yield put(hits ? meaningResultsReceived({ query, hits }) : meaningSearchUnavailable(query))
  } catch (e) {
    // A busy model slot (Ask is running) or a missing model: exact results stand alone.
    log.warn('[ai-search] meaning search unavailable', e?.code ?? e?.message ?? e)
    yield put(meaningSearchUnavailable(query))
  }
}

function* searchSaga(action) {
  yield* runSearch(action.type === refreshSearch.type ? 0 : SEARCH_DEBOUNCE_MS)
}

function* prewarmSearchSaga() {
  try {
    yield call(backendApi.prewarmSearch)
  } catch (e) {
    log.error('prewarmSearch failed', e)
  }
}

function* refreshOnNoteChanges() {
  while (true) {
    yield take([setNoteKeys.type, setNoteData.type, setNotesDataBatch.type])
    const query = ((yield select(getSearchQuery)) || '').trim()
    if (!query) continue
    yield delay(SEARCH_REFRESH_INTERVAL_MS)
    if (((yield select(getSearchQuery)) || '').trim()) yield put(refreshSearch())
  }
}

export function* watchSearchSaga() {
  yield takeLatest(prewarmSearch.type, prewarmSearchSaga)
  yield takeLatest(
    [
      setSearchQuery.type,
      setSearchScope.type,
      setSearchIncludeLocked.type,
      setSelectedFolder.type,
      refreshSearch.type
    ],
    searchSaga
  )
  yield fork(refreshOnNoteChanges)
}
