import { buffers, channel } from 'redux-saga'
import {
  all,
  call,
  cancel,
  delay,
  flush,
  fork,
  put,
  race,
  spawn,
  takeEvery,
  takeLatest,
  takeLeading,
  take,
  select
} from 'redux-saga/effects'
import {
  loadNotesSuccess,
  updateNote,
  deleteNote,
  deleteNotes,
  moveNotes,
  createNote,
  subscribeAllNoteKeys,
  setNoteKeys,
  subscribeAllNotes,
  setNoteData,
  getNoteKeys,
  getNoteData,
  getNotesData,
  setSelectedNote,
  getSelectedNote,
  restoreNote,
  restoreNotes,
  mergeNotes,
  undoMergeNotes,
  previewMergeNotes,
  clearMergePreview,
  setMergePreview,
  setLockRefusal,
  splitNote,
  applyFolderMoves,
  setLastMerge,
  getLastMerge,
  purgeExpiredTrash,
  flushNoteSaves,
  selectNote,
  setNotesDataBatch,
  setVisibleNotes
} from '../slices/notesSlice.js'
import {
  getEditorBaseKey,
  getEditorConflict,
  recordLocalWrite,
  setEditorBase
} from '../slices/editorSlice.js'
import { getFolders, getFoldersLoading, getSelectedFolder } from '../slices/foldersSlice.js'
import { backendApi } from '../../backend/api.js'
import { appBoot } from '../../bootTimeline.js'
import { apiSubscribeCall } from './utils.js'
import { buildMergePreview, buildMergedNote, checkMergeable } from '../services/noteMerge.js'
import { checkSplittable, splitNoteByHeadings } from '../services/noteSplit.js'
import {
  ALL_NOTES_KEY,
  RECENTLY_DELETED_KEY,
  DEFAULT_FOLDER_NAME,
  LOCK_REFUSAL,
  normalizeAttachmentUrls
} from '../../constant.js'
import * as log from '../../log.js'

const UNLOCK_REFUSALS = [LOCK_REFUSAL.FILES_MISSING, LOCK_REFUSAL.FILES_SEALED]

function checkDataOrder(prevData, newData) {
  if (prevData.length === 0) return false
  if (prevData.length !== newData.length) return false
  for (let i = 0; i < prevData.length; i++) {
    if (prevData[i] !== newData[i]) {
      return false
    }
  }
  return true
}

const CREATE_DEBOUNCE_MS = 700
let isCreatingNote = false
let lastNoteCreatedAt = 0

function isSameNoteData(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    normalizeAttachmentUrls(a.note) === normalizeAttachmentUrls(b.note) &&
    a.title === b.title &&
    a.updatedAt === b.updatedAt &&
    a.folderKey === b.folderKey &&
    a.locked === b.locked &&
    a.pinned === b.pinned &&
    a.deletedAt === b.deletedAt &&
    a.previousFolderKey === b.previousFolderKey &&
    !!a.bodyOmitted === !!b.bodyOmitted
  )
}

// Leaving a note downgrades it to a summary; its body stays valid while the content hash matches.
function keepsCurrentBody(current, data) {
  if (!data?.bodyOmitted || !current || current.bodyOmitted) return false
  const hash = data.summary?.hash
  if (!hash || current.summary?.hash !== hash) return false
  return isSameNoteData({ ...current, note: data.note, bodyOmitted: true }, data)
}

function parseNoteSummary(data) {
  if (!data || typeof data.summary !== 'string') return data
  try {
    return { ...data, summary: JSON.parse(data.summary) }
  } catch {
    return { ...data, summary: null }
  }
}

// The list holds summaries only; any write that needs the stored body must read it first.
function* loadFullNote(key) {
  const noteData = yield select(getNoteData(key))
  if (noteData && !noteData.bodyOmitted) return noteData
  const response = yield call(backendApi.getSingleNote, { key })
  return response?.data?.folderKey ? response.data : null
}

function* selectNoteSaga({ payload: key }) {
  yield put(setSelectedNote(key))
}

function* isStoredFolder(folderKey) {
  if (!folderKey || folderKey === ALL_NOTES_KEY || folderKey === RECENTLY_DELETED_KEY) return false
  const foldersLoading = yield select(getFoldersLoading)
  if (foldersLoading) return true
  const folders = yield select(getFolders)
  return folders.some((folder) => folder.id === folderKey && !folder.isSystem)
}

function* resolveNoteFolderKey() {
  const selectedFolder = yield select(getSelectedFolder)
  if (yield call(isStoredFolder, selectedFolder)) return selectedFolder

  const folders = yield select(getFolders)
  const untitledFolder = folders.find((f) => f.name === DEFAULT_FOLDER_NAME && !f.isSystem)
  if (untitledFolder) return untitledFolder.id

  const response = yield call(backendApi.insertFolder, { title: DEFAULT_FOLDER_NAME })
  return response?.key || ''
}

/** @param {{ payload?: { title?: string, note?: string } }} [action] */
function* createNoteSaga(action) {
  const payload = action?.payload
  const now = Date.now()
  if (isCreatingNote || now - lastNoteCreatedAt < CREATE_DEBOUNCE_MS) return
  isCreatingNote = true
  lastNoteCreatedAt = now
  try {
    const folderKey = yield call(resolveNoteFolderKey)
    if (!folderKey) return

    const { key } = yield call(backendApi.insertNote, {
      title: String(payload?.title ?? ''),
      note: String(payload?.note ?? ''),
      folderKey
    })
    if (key) {
      yield put(setSelectedNote(key))
    }
  } catch (error) {
    log.error('Error in createNoteSaga:', error)
  } finally {
    isCreatingNote = false
  }
}

// Editor saves are only sent when the content changes, so a save the backend
// refused was never sent again once the user stopped typing: the edit lived in
// the editor's memory alone, and closing the note or the app lost it. Any
// transient failure could do that - a base reopen after an autobase error, a
// wedged writer being recovered, an apply that aborted on a missing view block.
//
// So a failed editor save is retried with backoff until it lands. It retries
// the same content, and stands down as soon as a newer editor save for that note
// starts, since the newer one carries everything this one had.
const SAVE_RETRY_BASE_MS = 1000
const SAVE_RETRY_MAX_MS = 30000
const editorSaveGeneration = new Map()

const waitingRetries = new Map()

// A retry waiting out its backoff is still an unsaved edit: a flush sends it at once.
function* retryEditorSave(payload, generation) {
  const attempt = (payload.retryAttempt || 0) + 1
  waitingRetries.set(payload.key, generation)
  try {
    yield race({
      backoff: delay(Math.min(SAVE_RETRY_BASE_MS * 2 ** (attempt - 1), SAVE_RETRY_MAX_MS)),
      flushed: take(flushNoteSaves.type)
    })
    if (editorSaveGeneration.get(payload.key) !== generation) return
    log.error('updateNoteSaga: retrying a save the backend did not take', {
      key: payload.key,
      attempt
    })
    yield put(updateNote({ ...payload, retryAttempt: attempt }))
  } finally {
    if (waitingRetries.get(payload.key) === generation) waitingRetries.delete(payload.key)
    notifySavesSettled()
  }
}

function* updateNoteSaga({ payload }) {
  const { key, title, note, folderKey, locked, pinned, fromEditor } = payload
  // Only editor saves supersede each other. A pin or a folder move for the same
  // note must not cancel the retry of an edit that has not landed yet.
  let generation = 0
  if (key && fromEditor) {
    generation = (editorSaveGeneration.get(key) || 0) + 1
    editorSaveGeneration.set(key, generation)
  }
  let failed = false
  try {
    if (!key) return

    if (fromEditor) {
      const conflict = yield select(getEditorConflict)
      if (conflict?.key === key) {
        // The buffer is held in editorSlice.content and recovered by resolving
        // the conflict with 'mine'. It is NOT durable: quitting with the
        // conflict unresolved still loses it. See the note in updateNoteSaga.
        log.error('updateNoteSaga: save held back, note is conflicted', { key })
        return
      }
    }

    const stored = yield select(getNoteData(key))
    const noteData = yield call(loadFullNote, key)

    if (!noteData && stored?.bodyOmitted) {
      log.error('updateNoteSaga: could not read the stored note before saving', { key })
      failed = true
      return
    }

    // Neither the store nor the backend has the note: it was deleted for good,
    // here or on another device. A save that arrives after that — the editor's
    // debounce is the usual one — must not write it back into existence.
    if (!noteData) {
      log.error('updateNoteSaga: dropped a save for a note that no longer exists', { key })
      return
    }

    const nextTitle = title !== undefined ? title : noteData?.title
    const nextFolder = folderKey !== undefined ? folderKey : noteData?.folderKey
    const nextNote =
      note !== undefined ? normalizeAttachmentUrls(note) : normalizeAttachmentUrls(noteData?.note)
    const nextLocked = locked !== undefined ? locked : noteData?.locked === true
    const nextPinned = pinned !== undefined ? pinned : noteData?.pinned === true

    if (
      noteData &&
      nextTitle === noteData.title &&
      nextNote === normalizeAttachmentUrls(noteData.note) &&
      nextFolder === noteData.folderKey &&
      nextLocked === (noteData.locked === true) &&
      nextPinned === (noteData.pinned === true)
    ) {
      return
    }

    // Register the write before sending it. The backend echoes the change back
    // through subscribeNote on its own channel, which can beat this RPC's ack —
    // and an echo that is not yet recognised as ours is read as a remote edit,
    // raising a conflict that then silently drops every later save.
    const editorBaseKey = yield select(getEditorBaseKey)
    const isEditorNote = editorBaseKey === key
    if (isEditorNote) {
      yield put(recordLocalWrite({ key, title: nextTitle || '', content: nextNote || '' }))
    }

    const result = yield call(backendApi.updateNote, {
      key,
      title: nextTitle,
      folderKey: nextFolder,
      note: nextNote,
      locked: nextLocked,
      pinned: nextPinned
    })

    // A write the backend refused must not advance the base: leaving the base
    // behind keeps the buffer dirty, so the next save resends this content
    // instead of treating it as already stored.
    if (result?.done !== true) {
      log.error('updateNoteSaga: the backend did not save the note', { key })
      if (UNLOCK_REFUSALS.includes(result?.reason) && nextLocked !== (noteData.locked === true)) {
        yield put(setLockRefusal({ key, reason: result.reason }))
      }
      failed = true
      return
    }

    if (isEditorNote) {
      yield put(setEditorBase({ key, title: nextTitle || '', content: nextNote || '' }))
    }
  } catch (error) {
    log.error('Error in updateNoteSaga:', error)
    failed = true
  } finally {
    // Detached: an attached fork would hold up anything that `call`s this saga
    // (moveNoteSaga does) for the whole backoff.
    if (failed && fromEditor) yield spawn(retryEditorSave, payload, generation)
  }
}

// Editor saves are coalesced per note: every keystroke still updates the editor, but the note is
// written once typing pauses, and at least every EDITOR_SAVE_MAX_WAIT_MS while it does not.
export const EDITOR_SAVE_IDLE_MS = 1000
export const EDITOR_SAVE_MAX_WAIT_MS = 5000
const pendingEditorSaves = new Map()
let pendingSaveToken = 0
let savesInFlight = 0
let settledWaiters = []

function notifySavesSettled() {
  if (hasPendingNoteSaves()) return
  const waiters = settledWaiters
  settledWaiters = []
  for (const resolve of waiters) resolve()
}

export function hasPendingNoteSaves() {
  return pendingEditorSaves.size > 0 || savesInFlight > 0 || waitingRetries.size > 0
}

export function noteSavesSettled() {
  if (!hasPendingNoteSaves()) return Promise.resolve()
  return new Promise((resolve) => settledWaiters.push(resolve))
}

function* sendEditorSave(payload) {
  savesInFlight++
  try {
    yield call(updateNoteSaga, { payload })
  } finally {
    savesInFlight--
    notifySavesSettled()
  }
}

function* flushEditorSave(key) {
  const pending = pendingEditorSaves.get(key)
  if (!pending) return
  pendingEditorSaves.delete(key)
  yield call(sendEditorSave, pending.payload)
}

function* flushAllEditorSaves() {
  const keys = [...pendingEditorSaves.keys()]
  if (keys.length) yield all(keys.map((key) => call(flushEditorSave, key)))
  notifySavesSettled()
}

function* editorSaveTimer(key, token, wait) {
  yield delay(wait)
  if (pendingEditorSaves.get(key)?.token !== token) return
  yield call(flushEditorSave, key)
}

function* routeUpdateNoteSaga(action) {
  const payload = action.payload || {}
  const { key } = payload
  if (key && payload.fromEditor && !payload.retryAttempt) {
    // An editor save names the note it was typed into; anything else is another note's buffer.
    if ((yield select(getEditorBaseKey)) !== key) {
      log.error('updateNoteSaga: dropped an editor save for a note the editor is not showing', {
        key
      })
      return
    }
    const now = Date.now()
    const firstAt = pendingEditorSaves.get(key)?.firstAt ?? now
    const token = ++pendingSaveToken
    pendingEditorSaves.set(key, { payload, firstAt, token })
    const wait = Math.max(0, Math.min(EDITOR_SAVE_IDLE_MS, firstAt + EDITOR_SAVE_MAX_WAIT_MS - now))
    yield fork(editorSaveTimer, key, token, wait)
    return
  }
  // A newer edit is already queued and carries everything this retry would send.
  if (key && payload.retryAttempt && pendingEditorSaves.has(key)) return
  if (key) yield call(flushEditorSave, key)
  if (payload.retryAttempt) yield call(sendEditorSave, payload)
  else yield call(updateNoteSaga, action)
}

function* deleteNoteSaga({ payload: key }) {
  try {
    if (!key) return
    yield call(flushEditorSave, key)
    const stored = yield select(getNoteData(key))
    const note = yield call(loadFullNote, key)

    if (!note) {
      // A summary row whose body could not be read still exists; trash it rather than lose it.
      if (stored?.bodyOmitted) yield call(backendApi.trashNote, key)
      else yield call(backendApi.deleteNote, key)
      return
    }

    const isNoteEmpty = !note.title?.trim() && !note.note?.trim()

    if (note.folderKey === RECENTLY_DELETED_KEY || isNoteEmpty) {
      yield call(backendApi.deleteNote, key)
    } else {
      yield call(backendApi.trashNote, key)
    }
  } catch (error) {
    log.error('Error in deleteNoteSaga:', error)
  }
}

function* restoreNoteSaga({ payload: key }) {
  try {
    if (!key) return
    const result = yield call(backendApi.restoreNote, key)
    return result
  } catch (error) {
    log.error('Error in restoreNoteSaga:', error)
  }
}

function* restoreNotesSaga({ payload: keys }) {
  try {
    if (!keys?.length) return
    for (const key of keys) {
      yield call(restoreNoteSaga, { payload: key })
    }
  } catch (error) {
    log.error('Error in restoreNotesSaga:', error)
  }
}

function* purgeExpiredTrashSaga() {
  try {
    yield call(backendApi.purgeExpiredTrash)
  } catch (error) {
    log.error('Error in purgeExpiredTrashSaga:', error)
  }
}

function* deleteNotesSaga({ payload: keys }) {
  try {
    if (!keys?.length) return
    for (const key of keys) {
      yield call(deleteNoteSaga, { payload: key })
    }
  } catch (error) {
    log.error('Error in deleteNotesSaga:', error)
  }
}

// The originals go to Recently Deleted, never deleted outright, so a merge is
// undone by restoring them and trashing the merged note.
function* mergeNotesSaga({ payload }) {
  const keys = [...new Set(payload?.keys ?? [])]
  try {
    for (const key of keys) yield call(flushEditorSave, key)
    const notes = []
    for (const key of keys) notes.push(yield call(loadFullNote, key))
    const refusal = checkMergeable(notes)
    if (refusal) {
      yield put(setLastMerge({ error: refusal, keys }))
      return
    }
    const merged = buildMergedNote(notes)
    const folderKey =
      merged.folderKey && merged.folderKey !== RECENTLY_DELETED_KEY
        ? merged.folderKey
        : yield call(resolveNoteFolderKey)
    if (!folderKey) throw new Error('no folder for the merged note')
    const { key } = yield call(backendApi.insertNote, {
      title: merged.title,
      note: merged.note,
      folderKey
    })
    if (!key) throw new Error('merged note was not created')
    for (const original of keys) yield call(backendApi.trashNote, original)
    yield put(setSelectedNote(key))
    yield put(setLastMerge({ kind: 'merge', mergedKey: key, originals: keys, at: Date.now() }))
  } catch (error) {
    log.error('Error in mergeNotesSaga:', error)
    yield put(setLastMerge({ error: 'failed', keys }))
  }
}

function* previewMergeNotesSaga({ type, payload }) {
  if (type === clearMergePreview.type) {
    yield put(setMergePreview(null))
    return
  }
  const keys = [...new Set(payload?.keys ?? [])]
  yield put(setMergePreview({ status: 'loading', keys }))
  try {
    for (const key of keys) yield call(flushEditorSave, key)
    const notes = []
    for (const key of keys) notes.push(yield call(loadFullNote, key))
    const refusal = checkMergeable(notes)
    if (refusal) {
      yield put(setMergePreview({ status: 'error', error: refusal, keys }))
      return
    }
    yield put(setMergePreview({ status: 'ready', ...buildMergePreview(notes, keys) }))
  } catch (error) {
    log.error('Error in previewMergeNotesSaga:', error)
    yield put(setMergePreview({ status: 'error', error: 'failed', keys }))
  }
}

function* splitNoteSaga({ payload }) {
  const key = payload?.key
  try {
    if (!key) return
    yield call(flushEditorSave, key)
    const note = yield call(loadFullNote, key)
    const refusal = checkSplittable(note)
    if (refusal) {
      yield put(setLastMerge({ kind: 'split', error: refusal, keys: [key] }))
      return
    }
    const parts = splitNoteByHeadings(note.note, note.title)
    const folderKey =
      note.folderKey && note.folderKey !== RECENTLY_DELETED_KEY
        ? note.folderKey
        : yield call(resolveNoteFolderKey)
    if (!folderKey) throw new Error('no folder for the split notes')
    const created = []
    for (const part of [...parts].reverse()) {
      const { key: partKey } = yield call(backendApi.insertNote, {
        title: part.title,
        note: part.note,
        folderKey
      })
      if (!partKey) throw new Error('a split part was not created')
      created.unshift(partKey)
    }
    yield call(backendApi.trashNote, key)
    yield put(setSelectedNote(created[0]))
    yield put(
      setLastMerge({
        kind: 'split',
        mergedKey: created[0],
        createdKeys: created,
        originals: [key],
        at: Date.now()
      })
    )
  } catch (error) {
    log.error('Error in splitNoteSaga:', error)
    yield put(setLastMerge({ kind: 'split', error: 'failed', keys: [key] }))
  }
}

function* applyFolderMovesSaga({ payload }) {
  const moves = (payload?.moves ?? []).filter((move) => move?.key && move.to)
  if (!moves.length) return
  try {
    for (const move of moves) {
      yield call(flushEditorSave, move.key)
      yield call(updateNoteSaga, { payload: { key: move.key, folderKey: move.to } })
    }
    yield put(setLastMerge({ kind: 'move', moves, originals: [], at: Date.now() }))
  } catch (error) {
    log.error('Error in applyFolderMovesSaga:', error)
    yield put(setLastMerge({ kind: 'move', error: 'failed', keys: moves.map((move) => move.key) }))
  }
}

function* undoMergeNotesSaga() {
  const last = yield select(getLastMerge)
  if (last?.kind === 'move' && last.moves?.length) {
    yield put(setLastMerge(null))
    try {
      for (const move of last.moves) {
        yield call(updateNoteSaga, {
          payload: { key: move.key, folderKey: move.from || ALL_NOTES_KEY }
        })
      }
    } catch (error) {
      log.error('Error undoing folder moves:', error)
    }
    return
  }
  if (!last?.mergedKey) return
  yield put(setLastMerge(null))
  try {
    for (const original of last.originals) yield call(restoreNoteSaga, { payload: original })
    for (const created of last.createdKeys ?? [last.mergedKey]) {
      yield call(flushEditorSave, created)
      yield call(backendApi.trashNote, created)
    }
    yield put(setSelectedNote(last.originals[0]))
  } catch (error) {
    log.error('Error in undoMergeNotesSaga:', error)
  }
}

function* moveNotesSaga({ payload: { keys, folderKey } }) {
  try {
    if (!keys?.length || !folderKey) return
    for (const key of keys) {
      yield call(flushEditorSave, key)
      yield call(updateNoteSaga, { payload: { key, folderKey } })
    }
  } catch (error) {
    log.error('Error in moveNotesSaga:', error)
  }
}

function* subscribeAllNoteKeysSaga() {
  try {
    yield apiSubscribeCall(
      backendApi.subscribeAllNoteKeys,
      function* ({ data }) {
        appBoot.markRolling('noteKeys', `note keys received, ${data.length} keys`)
        const noteKeys = yield select(getNoteKeys)
        if (checkDataOrder(noteKeys, data)) {
          return
        }
        yield put(setNoteKeys(data))
        yield put(loadNotesSuccess(data))
      },
      { retry: true }
    )
  } catch (error) {
    log.error('Error in subscribeAllNoteKeysSaga:', error)
  }
}

const HYDRATE_FLUSH_MS = 16
let hydrationSeq = 0
const lastDirectSeq = new Map()

function* subscribeNote(key, full, hydrated) {
  try {
    return yield apiSubscribeCall(
      () => backendApi.subscribeNote({ key, summary: !full }),
      function* ({ data: wire }) {
        const data = parseNoteSummary(wire)
        const current = yield select(getNoteData(key))
        if (isSameNoteData(current, data) || keepsCurrentBody(current, data)) return
        const seq = ++hydrationSeq
        if ((yield select(getSelectedNote)) === key) {
          lastDirectSeq.set(key, seq)
          yield put(setNoteData({ key, data }))
        } else {
          yield put(hydrated, { key, data, seq })
        }
        const keys = yield select(getNoteKeys)
        const loaded = yield select(getNotesData)
        appBoot.markRolling(
          'noteBodies',
          `note body applied, ${Object.keys(loaded).length}/${keys.length} rows renderable`
        )
      },
      { retry: true }
    )
  } catch (error) {
    log.error('Error in subscribeNote:', error)
  }
}

// Rows arriving together (a scroll hydrating a dozen notes) land as one store update.
function* applyHydratedNotes(hydrated) {
  while (true) {
    const first = yield take(hydrated)
    yield delay(HYDRATE_FLUSH_MS)
    const rest = yield flush(hydrated)
    const latest = new Map()
    for (const entry of [first, ...rest]) {
      if (entry.seq < (lastDirectSeq.get(entry.key) || 0)) continue
      latest.set(entry.key, entry)
    }
    const selected = yield select(getSelectedNote)
    const batch = []
    for (const { key, data } of latest.values()) {
      if (key === selected) yield put(setNoteData({ key, data }))
      else batch.push({ key, data })
    }
    if (batch.length) yield put(setNotesDataBatch(batch))
  }
}

// The open note and the rows on screen (plus a margin) stream bodies; every other note a summary.
function* subscribeAllNotesSaga() {
  try {
    const noteTasks = {}
    const taskFull = {}
    const hydrated = channel(buffers.expanding())
    yield fork(applyHydratedNotes, hydrated)
    let visible = new Set()

    const syncSubscriptions = function* (keys) {
      const selected = yield select(getSelectedNote)
      for (const key of keys || []) {
        const full = key === selected || visible.has(key)
        const task = noteTasks[key]
        if (task?.isRunning() && taskFull[key] === full) continue
        if (task?.isRunning()) yield cancel(task)
        taskFull[key] = full
        noteTasks[key] = yield fork(subscribeNote, key, full, hydrated)
      }
    }

    yield* syncSubscriptions(yield select(getNoteKeys))

    while (true) {
      const action = yield take([setNoteKeys.type, setSelectedNote.type, setVisibleNotes.type])
      if (action.type === setVisibleNotes.type) visible = new Set(action.payload || [])
      const keys = action.type === setNoteKeys.type ? action.payload : yield select(getNoteKeys)
      yield* syncSubscriptions(keys)
    }
  } catch (error) {
    log.error('Error in subscribeAllNotesSaga:', error)
  }
}

export function* watchNotesSaga() {
  pendingEditorSaves.clear()
  waitingRetries.clear()
  savesInFlight = 0
  yield takeEvery(createNote, createNoteSaga)
  yield takeEvery(updateNote, routeUpdateNoteSaga)
  yield takeLatest(selectNote, selectNoteSaga)
  yield takeEvery([flushNoteSaves.type, setSelectedNote.type], flushAllEditorSaves)
  yield takeEvery(deleteNote, deleteNoteSaga)
  yield takeEvery(deleteNotes, deleteNotesSaga)
  yield takeEvery(moveNotes, moveNotesSaga)
  yield takeEvery(restoreNote, restoreNoteSaga)
  yield takeEvery(restoreNotes, restoreNotesSaga)
  yield takeLeading(mergeNotes, mergeNotesSaga)
  yield takeLeading(undoMergeNotes, undoMergeNotesSaga)
  yield takeLatest([previewMergeNotes, clearMergePreview], previewMergeNotesSaga)
  yield takeLeading(splitNote, splitNoteSaga)
  yield takeLeading(applyFolderMoves, applyFolderMovesSaga)
  yield takeLatest(purgeExpiredTrash, purgeExpiredTrashSaga)
  yield takeLatest(subscribeAllNoteKeys, subscribeAllNoteKeysSaga)
  yield takeLatest(subscribeAllNotes, subscribeAllNotesSaga)
}
