import { call, debounce, put, select, take, takeEvery } from 'redux-saga/effects'

import { EDITOR_SYNC, normalizeAttachmentUrls } from '../../constant.js'
import { resolveEditorSync } from '../../utils.js'
import {
  clearEditorConflict,
  getEditorBaseContent,
  getEditorBaseKey,
  getEditorBaseTitle,
  getEditorConflict,
  getEditorContent,
  getEditorTitle,
  getRecentLocalWrites,
  resolveEditorConflict,
  setEditorBase,
  setEditorConflict,
  syncEditorWithNote
} from '../slices/editorSlice.js'
import {
  setSelectedNote,
  getNotesData,
  setNoteData,
  getNoteKeys,
  getNoteData,
  getSelectedNote,
  updateNote
} from '../slices/notesSlice.js'
import * as log from '../../log.js'

const REMOTE_EDITOR_SYNC_DEBOUNCE_MS = 400

function* isOwnWriteEcho(key, remoteTitle, remoteContent) {
  const recentWrites = yield select(getRecentLocalWrites)
  if (!recentWrites?.length) return false
  const title = remoteTitle || ''
  const content = normalizeAttachmentUrls(remoteContent || '')
  return recentWrites.some(
    (entry) =>
      entry.key === key &&
      (entry.title || '') === title &&
      normalizeAttachmentUrls(entry.content || '') === content
  )
}

// Leaving a note with an unresolved conflict used to discard the buffer:
// updateNoteSaga holds back every save while the note is conflicted, and
// syncEditorWithNote then clears both the conflict and the typed content. The
// buffer wins deterministically on version anyway, so keep it rather than lose
// it — the user only ever sees the text they typed survive.
function* flushConflictedBufferSaga(nextNoteKey) {
  const conflict = yield select(getEditorConflict)
  if (!conflict?.key || conflict.key === nextNoteKey) return

  const baseKey = yield select(getEditorBaseKey)
  if (baseKey !== conflict.key) return

  const title = yield select(getEditorTitle)
  const content = yield select(getEditorContent)
  if (
    (title || '') === (conflict.remoteTitle || '') &&
    (content || '') === (conflict.remoteContent || '')
  ) {
    return
  }

  log.error('editorSaga: keeping the local buffer of a note left conflicted', { key: conflict.key })
  yield put(clearEditorConflict())
  yield put(
    setEditorBase({
      key: conflict.key,
      title: conflict.remoteTitle,
      content: conflict.remoteContent
    })
  )
  yield put(updateNote({ key: conflict.key, title, note: content }))
}

function* syncEditorSaga({ payload: noteKey }) {
  try {
    // Before the early return: closing the editor dispatches setSelectedNote(null),
    // and that is exactly the case where the buffer would otherwise be dropped.
    yield call(flushConflictedBufferSaga, noteKey)
    if (!noteKey) return
    const notesData = yield select(getNotesData)
    const noteData = notesData[noteKey] || {}
    // A summary has no body; adoptSelectedNoteBodySaga loads the note once its body streams in.
    if (noteData.bodyOmitted) return
    yield put(syncEditorWithNote({ key: noteKey, data: noteData }))
  } catch (error) {
    log.error('Error in syncEditorSaga:', error)
  }
}

function* updateEditorContentSaga({ payload: { key, data } }) {
  try {
    const selectedNoteKey = yield select(getSelectedNote)
    if (!key || key !== selectedNoteKey || !data || data.bodyOmitted) return

    const baseKey = yield select(getEditorBaseKey)
    if (baseKey !== key) return

    const remoteTitle = data.title || ''
    const remoteContent = data.note || ''

    const existing = yield select(getEditorConflict)
    if (existing && existing.key === key) {
      if (existing.remoteTitle !== remoteTitle || existing.remoteContent !== remoteContent) {
        yield put(setEditorConflict({ key, remoteTitle, remoteContent }))
      }
      return
    }

    if (yield call(isOwnWriteEcho, key, remoteTitle, remoteContent)) return

    const outcome = resolveEditorSync({
      remoteTitle,
      remoteContent,
      baseTitle: yield select(getEditorBaseTitle),
      baseContent: yield select(getEditorBaseContent),
      localTitle: yield select(getEditorTitle),
      localContent: yield select(getEditorContent)
    })

    if (outcome === EDITOR_SYNC.NONE) return
    if (outcome === EDITOR_SYNC.ADOPT) {
      yield put(syncEditorWithNote({ key, data }))
      return
    }

    yield put(setEditorConflict({ key, remoteTitle, remoteContent }))
  } catch (error) {
    log.error('Error in updateEditorContentSaga:', error)
  }
}

function* resolveEditorConflictSaga({ payload }) {
  try {
    const conflict = yield select(getEditorConflict)
    if (!conflict?.key) return

    const { key, remoteTitle, remoteContent } = conflict

    if (payload === 'theirs') {
      yield put(syncEditorWithNote({ key, data: { title: remoteTitle, note: remoteContent } }))
      return
    }

    const title = yield select(getEditorTitle)
    const note = yield select(getEditorContent)
    yield put(clearEditorConflict())
    yield put(setEditorBase({ key, title: remoteTitle, content: remoteContent }))
    yield put(updateNote({ key, title, note }))
  } catch (error) {
    log.error('Error in resolveEditorConflictSaga:', error)
  }
}

function* setInitialSelectedNote() {
  yield take(setNoteData)
  const keys = yield select(getNoteKeys)
  if (!keys || !keys[0]) return
  const firstNoteData = yield select(getNoteData(keys[0]))
  if (!firstNoteData || firstNoteData.bodyOmitted) return
  yield put(syncEditorWithNote({ key: keys[0], data: firstNoteData }))
}

function* adoptSelectedNoteBodySaga({ payload: { key, data } }) {
  try {
    if (!key || !data || data.bodyOmitted) return
    if ((yield select(getSelectedNote)) !== key) return
    if ((yield select(getEditorBaseKey)) === key) return
    const stored = yield select(getNoteData(key))
    if (!stored || stored.bodyOmitted) return
    yield put(syncEditorWithNote({ key, data: stored }))
  } catch (error) {
    log.error('Error in adoptSelectedNoteBodySaga:', error)
  }
}

export function* watchEditorSaga() {
  yield takeEvery(setSelectedNote, syncEditorSaga)
  yield takeEvery(resolveEditorConflict, resolveEditorConflictSaga)
  yield takeEvery(setNoteData, adoptSelectedNoteBodySaga)
  yield debounce(REMOTE_EDITOR_SYNC_DEBOUNCE_MS, setNoteData, updateEditorContentSaga)
  yield setInitialSelectedNote()
}
