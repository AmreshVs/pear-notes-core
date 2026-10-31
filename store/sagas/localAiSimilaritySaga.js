import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'

import { backendApi } from '../../backend/api.js'
import * as log from '../../log.js'
import { AI_SUGGESTION } from '../services/aiSuggestionPrefs.js'
import {
  dismissDuplicatePair,
  findDuplicatePairs,
  findRelatedNotes
} from '../services/localAiSearch.js'
import {
  clearVaultSimilarity,
  dismissDuplicateNotes,
  duplicatePairDismissed,
  duplicatesFailed,
  duplicatesLoaded,
  duplicatesLoading,
  getDuplicateNotesState,
  getLocalAiIndex,
  getRelatedNotesState,
  loadDuplicateNotes,
  loadRelatedNotes,
  relatedNotesFailed,
  relatedNotesLoaded,
  relatedNotesLoading,
  selectAiSuggestionOn
} from '../slices/localAiSlice.js'
import { clearState } from '../slices/notesSlice.js'
import { vaultEntered } from '../slices/vaultsSlice.js'

let vaultEpoch = 0

function* handleLoadRelated({ payload: noteKey }) {
  if (!(yield select(selectAiSuggestionOn, AI_SUGGESTION.RELATED))) return
  const related = yield select(getRelatedNotesState)
  if (!noteKey || related.noteKey !== noteKey) return
  const indexAt = (yield select(getLocalAiIndex)).changedAt || 0
  if (related.status === 'done' && related.forKey === noteKey && related.indexAt === indexAt) return
  const epoch = vaultEpoch
  yield put(relatedNotesLoading(noteKey))
  try {
    const hits = yield call(findRelatedNotes, { api: backendApi, noteKey })
    if (epoch !== vaultEpoch) return
    yield put(hits ? relatedNotesLoaded({ noteKey, hits, indexAt }) : relatedNotesFailed(noteKey))
  } catch (e) {
    log.warn('[ai-related] failed', e?.message ?? e)
    if (epoch === vaultEpoch) yield put(relatedNotesFailed(noteKey))
  }
}

function* handleLoadDuplicates({ payload }) {
  if (!(yield select(selectAiSuggestionOn, AI_SUGGESTION.RELATED))) return
  const duplicates = yield select(getDuplicateNotesState)
  const indexAt = (yield select(getLocalAiIndex)).changedAt || 0
  const fresh = duplicates.status === 'done' && duplicates.indexAt === indexAt
  if (fresh && payload?.force !== true) return
  const epoch = vaultEpoch
  yield put(duplicatesLoading())
  try {
    const startedAt = Date.now()
    const pairs = yield call(findDuplicatePairs, { api: backendApi })
    if (epoch !== vaultEpoch) return
    if (!pairs) {
      yield put(duplicatesFailed())
      return
    }
    log.info(`[ai-duplicates] ${pairs.length} pairs in ${Date.now() - startedAt} ms`)
    yield put(duplicatesLoaded({ pairs, indexAt }))
  } catch (e) {
    log.warn('[ai-duplicates] failed', e?.message ?? e)
    if (epoch === vaultEpoch) yield put(duplicatesFailed())
  }
}

function* handleDismissDuplicate({ payload }) {
  const { a, b } = payload || {}
  if (!a || !b) return
  yield put(duplicatePairDismissed({ a, b }))
  try {
    const ok = yield call(dismissDuplicatePair, { api: backendApi, a, b })
    if (!ok) log.warn('[ai-duplicates] dismissal not saved')
  } catch (e) {
    log.warn('[ai-duplicates] dismissal not saved', e?.message ?? e)
  }
}

function* handleVaultChanged() {
  vaultEpoch += 1
  yield put(clearVaultSimilarity())
}

export function* watchLocalAiSimilarity() {
  yield takeLatest(loadRelatedNotes, handleLoadRelated)
  yield takeLatest(loadDuplicateNotes, handleLoadDuplicates)
  yield takeEvery(dismissDuplicateNotes, handleDismissDuplicate)
  yield takeEvery([vaultEntered, clearState], handleVaultChanged)
}
