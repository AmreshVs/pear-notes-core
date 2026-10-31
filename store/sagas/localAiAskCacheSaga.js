import { call, takeEvery } from 'redux-saga/effects'

import { RECENTLY_DELETED_KEY } from '../../constant.js'
import * as log from '../../log.js'
import { getLocalAiAdapter } from '../services/localAiAdapter.js'
import { deleteNote, deleteNotes, moveNotes, updateNote } from '../slices/notesSlice.js'
import { moveToVault, removeVault, switchVault } from '../slices/vaultsSlice.js'

const ALWAYS_CLEARS = new Set([
  deleteNote.type,
  deleteNotes.type,
  switchVault.type,
  removeVault.type,
  moveToVault.type
])

/** Ask's KV caches hold note text, so anything that locks, trashes or leaves a note drops them all. */
export const clearsAskCache = (action) =>
  ALWAYS_CLEARS.has(action?.type) ||
  (updateNote.match(action) &&
    (action.payload?.locked === true || action.payload?.folderKey === RECENTLY_DELETED_KEY)) ||
  (moveNotes.match(action) && action.payload?.folderKey === RECENTLY_DELETED_KEY)

function* clearAskCache() {
  const adapter = getLocalAiAdapter()
  if (!adapter?.clearAskCache) return
  try {
    yield call([adapter, adapter.clearAskCache])
  } catch (error) {
    log.error('localAi ask cache clear failed', error)
  }
}

export function* watchAskCache() {
  yield takeEvery(clearsAskCache, clearAskCache)
}
