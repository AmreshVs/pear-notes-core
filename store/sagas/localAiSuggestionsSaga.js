import {
  actionChannel,
  call,
  cancelled,
  delay,
  fork,
  put,
  race,
  select,
  take,
  takeEvery,
  takeLatest
} from 'redux-saga/effects'

import { backendApi } from '../../backend/api.js'
import * as log from '../../log.js'
import {
  AI_SUGGESTION,
  loadAiSuggestions,
  saveAiSuggestions
} from '../services/aiSuggestionPrefs.js'
import { getLocalAiAdapter } from '../services/localAiAdapter.js'
import {
  getFeatureRegistryNames,
  LOCAL_AI_FEATURE,
  LOCAL_AI_TEXT_TASK
} from '../services/localAiCatalog.js'
import { getAiJobScheduler } from '../services/localAiJobs.js'
import { AI_OFFLOAD_KIND, runOnLinkedDesktop } from '../services/localAiOffload.js'
import { htmlToNoteText, NOTE_TASK } from '../services/localAiPrompts.js'
import { AI_JOB_PRIORITY } from '../services/localAiScheduler.js'
import { findRelatedNotes } from '../services/localAiSearch.js'
import {
  cleanFolderName,
  cleanTitleSuggestion,
  defaultFolderKeys,
  dismissSuggestion,
  findFolderByName,
  loadSuggestionFeedback,
  pickFolderSuggestion,
  loadDismissedSuggestions,
  recordFolderFeedback,
  SUGGESTION_KIND,
  suggestionId,
  TITLE_SUGGEST_MIN_CHARS
} from '../services/noteSuggestions.js'
import { setEditorContent, setEditorTitle } from '../slices/editorSlice.js'
import { getFoldersData } from '../slices/foldersSlice.js'
import {
  acceptFolderSuggestion,
  clearNoteSuggestion,
  dismissNoteSuggestion,
  getAiSuggestions,
  getLocalAiFeatureConfig,
  getMeaningSearchReady,
  getNoteSuggestions,
  getUpcomingSuggestionState,
  acceptUpcomingTitle,
  loadAiSuggestionPrefs,
  loadDuplicateNotes,
  loadUpcomingSuggestions,
  setUpcomingTitle,
  localAiAppResumed,
  noteSuggestionAccepted,
  selectAiSuggestionOn,
  selectCanUseLinkedDesktop,
  selectIsLocalAiFeatureReady,
  setAiSuggestion,
  setAiSuggestions,
  setNoteSuggestions
} from '../slices/localAiSlice.js'
import {
  getNotes,
  getNotesData,
  getSelectedNote,
  moveNotes,
  selectNote,
  setSelectedNote,
  updateNote,
  upcomingTitleId
} from '../slices/notesSlice.js'
import { RECENTLY_DELETED_KEY } from '../../constant.js'
import { initApp } from '../slices/uiSlice.js'
import { vaultEntered } from '../slices/vaultsSlice.js'

const SETTLE_MS = 1500
const TITLE_IDLE_MS = 5000

const isEdit = (action) =>
  action.type === setEditorContent.type || action.type === setEditorTitle.type

function* waitForIdleEdits() {
  while (true) {
    const { edit } = yield race({ edit: take(isEdit), idle: delay(TITLE_IDLE_MS) })
    if (!edit) return
  }
}

const titleCache = new Map()

function* noteText(noteKey) {
  const stored = (yield select(getNotesData))?.[noteKey]
  if (!stored || stored.locked) return null
  let html = stored.bodyOmitted ? null : stored.note
  if (typeof html !== 'string') {
    const response = yield call(backendApi.getSingleNote, { key: noteKey })
    html = response?.data?.note
  }
  const text = htmlToNoteText(String(html ?? '')).trim()
  return { text, version: `${stored.updatedAt ?? 0}:${text.length}` }
}

function* noteForTitle(noteKey) {
  const stored = (yield select(getNotesData))?.[noteKey]
  if (String(stored?.title ?? '').trim()) return null
  return yield call(noteText, noteKey)
}

function* generateNoteTask(noteKey, task, text) {
  const featureConfig = yield select(getLocalAiFeatureConfig, LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS)
  const adapter = getLocalAiAdapter()
  const localReady = yield select(
    selectIsLocalAiFeatureReady,
    LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS
  )
  if (!localReady || !adapter?.runNoteTaskInBackground) {
    if (!(yield select(selectCanUseLinkedDesktop))) return null
    const { text: raw } = yield call(runOnLinkedDesktop, {
      kind: AI_OFFLOAD_KIND.NOTE_TASK,
      payload: { task, text }
    })
    return raw
  }
  const jobKey = `${task}-suggestion:${noteKey}`
  try {
    return yield call(() =>
      getAiJobScheduler().enqueue({
        key: jobKey,
        label: 'Note suggestion',
        priority: AI_JOB_PRIORITY.USER,
        models: getFeatureRegistryNames(
          LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS,
          featureConfig,
          LOCAL_AI_TEXT_TASK.WRITE
        ),
        run: ({ signal }) => {
          signal.addEventListener('abort', () => adapter.cancelTask?.()?.catch?.(() => {}), {
            once: true
          })
          return adapter.runNoteTaskInBackground(task, text, featureConfig)
        }
      })
    )
  } finally {
    if (yield cancelled()) getAiJobScheduler().cancel(jobKey)
  }
}

const TITLE_ATTEMPT = Object.freeze({ DONE: 'done', RETRY: 'retry' })

/** DONE once a title was suggested or tried; RETRY while the note is too short or titled. */
function* suggestTitle(noteKey, dismissed) {
  if (!(yield select(selectAiSuggestionOn, AI_SUGGESTION.TITLES))) return TITLE_ATTEMPT.DONE
  if (dismissed.has(suggestionId(noteKey, SUGGESTION_KIND.TITLE))) return TITLE_ATTEMPT.DONE
  const note = yield call(noteForTitle, noteKey)
  if (!note || note.text.length < TITLE_SUGGEST_MIN_CHARS) return TITLE_ATTEMPT.RETRY
  const cached = titleCache.get(noteKey)
  let title = cached?.version === note.version ? cached.title : null
  if (!title) {
    const raw = yield call(generateNoteTask, noteKey, NOTE_TASK.TITLE, note.text)
    if (raw === null) return TITLE_ATTEMPT.RETRY
    title = cleanTitleSuggestion(raw, note.text)
    if (!title) return TITLE_ATTEMPT.DONE
    titleCache.set(noteKey, { version: note.version, title })
  }
  if ((yield select(getSelectedNote)) !== noteKey) return TITLE_ATTEMPT.DONE
  const latest = (yield select(getNotesData))?.[noteKey]
  if (String(latest?.title ?? '').trim()) return TITLE_ATTEMPT.RETRY
  yield put(setNoteSuggestions({ noteKey, title }))
  return TITLE_ATTEMPT.DONE
}

const folderCache = new Map()

/**
 * For a note left in the default "Untitled" folder: the folder its nearest
 * notes share, or else a new folder named by the model ("Travel").
 */
function* suggestFolder(noteKey, dismissed) {
  if (!(yield select(selectAiSuggestionOn, AI_SUGGESTION.FOLDERS))) return TITLE_ATTEMPT.DONE
  if (dismissed.has(suggestionId(noteKey, SUGGESTION_KIND.FOLDER))) return TITLE_ATTEMPT.DONE
  const folderData = yield select(getFoldersData)
  const defaultKeys = defaultFolderKeys(folderData)
  const stored = (yield select(getNotesData))?.[noteKey]
  if (!stored) return TITLE_ATTEMPT.RETRY
  if (stored.locked || !defaultKeys.has(stored.folderKey)) return TITLE_ATTEMPT.DONE
  let suggestion = null
  if (yield select(getMeaningSearchReady)) {
    const hits = yield call(findRelatedNotes, { api: backendApi, noteKey })
    const notesData = yield select(getNotesData)
    const feedback = yield call(loadSuggestionFeedback, backendApi)
    const folderKey = pickFolderSuggestion(hits, (key) => notesData?.[key]?.folderKey, {
      feedback,
      defaultKeys
    })
    if (folderKey && folderData[folderKey]) suggestion = { folderKey }
  }
  if (!suggestion) {
    const note = yield call(noteText, noteKey)
    if (!note || note.text.length < TITLE_SUGGEST_MIN_CHARS) return TITLE_ATTEMPT.RETRY
    const cached = folderCache.get(noteKey)
    let name = cached?.version === note.version ? cached.name : null
    if (!name) {
      const raw = yield call(generateNoteTask, noteKey, NOTE_TASK.FOLDER_NAME, note.text)
      if (raw === null) return TITLE_ATTEMPT.RETRY
      name = cleanFolderName(raw)
      if (!name) return TITLE_ATTEMPT.DONE
      folderCache.set(noteKey, { version: note.version, name })
    }
    const existing = findFolderByName(folderData, name)
    suggestion = existing && !defaultKeys.has(existing) ? { folderKey: existing } : { name }
  }
  if ((yield select(getSelectedNote)) !== noteKey) return TITLE_ATTEMPT.DONE
  yield put(setNoteSuggestions({ noteKey, folder: suggestion }))
  return TITLE_ATTEMPT.DONE
}

function* attempt(suggest, noteKey, dismissed, label) {
  try {
    return yield call(suggest, noteKey, dismissed)
  } catch (e) {
    log.debug(`[ai-suggest] ${label}`, e?.code ?? e?.message ?? e)
    return TITLE_ATTEMPT.DONE
  }
}

function* handleSelected({ payload }) {
  const noteKey = typeof payload === 'string' ? payload : yield select(getSelectedNote)
  yield put(setNoteSuggestions({ noteKey: noteKey ?? null, reset: true }))
  if (!noteKey) return
  yield delay(SETTLE_MS)
  let dismissed = new Set()
  try {
    dismissed = yield call(loadDismissedSuggestions, backendApi)
  } catch (e) {
    log.debug('[ai-suggest] dismissed list unavailable', e?.message)
  }
  // A new note is empty when it opens: check again each time typing pauses.
  let titleDone = false
  let folderDone = false
  while (true) {
    yield call(waitForIdleEdits)
    if (!titleDone) {
      titleDone =
        (yield call(attempt, suggestTitle, noteKey, dismissed, 'title')) === TITLE_ATTEMPT.DONE
    }
    if (!folderDone) {
      folderDone =
        (yield call(attempt, suggestFolder, noteKey, dismissed, 'folder')) === TITLE_ATTEMPT.DONE
    }
    if (titleDone && folderDone) return
    yield take(isEdit)
  }
}

const UPCOMING_TITLE_CANDIDATES = 5

function* handleLoadUpcoming() {
  yield put(loadDuplicateNotes())
  if (!(yield select(selectAiSuggestionOn, AI_SUGGESTION.TITLES))) return
  const upcoming = yield select(getUpcomingSuggestionState)
  const notesData = yield select(getNotesData)
  const current = upcoming.title
  if (current && !String(notesData?.[current.noteKey]?.title ?? '').trim()) return
  let dismissed = new Set()
  try {
    dismissed = yield call(loadDismissedSuggestions, backendApi)
  } catch (e) {
    log.debug('[ai-suggest] dismissed list unavailable', e?.message)
  }
  const snoozed = new Set(upcoming.snoozed)
  const candidates = (yield select(getNotes))
    .filter(
      ({ key, value }) =>
        !value.locked &&
        value.folderKey !== RECENTLY_DELETED_KEY &&
        !String(value.title ?? '').trim() &&
        !dismissed.has(suggestionId(key, SUGGESTION_KIND.TITLE)) &&
        !snoozed.has(upcomingTitleId(key))
    )
    .sort((a, b) => (b.value.updatedAt ?? 0) - (a.value.updatedAt ?? 0))
    .slice(0, UPCOMING_TITLE_CANDIDATES)
  for (const { key } of candidates) {
    try {
      const note = yield call(noteForTitle, key)
      if (!note || note.text.length < TITLE_SUGGEST_MIN_CHARS) continue
      const cached = titleCache.get(key)
      let title = cached?.version === note.version ? cached.title : null
      if (!title) {
        const raw = yield call(generateNoteTask, key, NOTE_TASK.TITLE, note.text)
        title = raw === null ? null : cleanTitleSuggestion(raw, note.text)
        if (!title) return
        titleCache.set(key, { version: note.version, title })
      }
      yield put(setUpcomingTitle({ noteKey: key, title }))
      return
    } catch (e) {
      log.debug('[ai-suggest] upcoming title', e?.code ?? e?.message ?? e)
      return
    }
  }
}

function* handleAcceptUpcomingTitle({ payload }) {
  const { noteKey, title } = payload || {}
  if (!noteKey || !title) return
  yield put(setUpcomingTitle(null))
  const stored = (yield select(getNotesData))?.[noteKey]
  if (!stored || stored.locked || String(stored.title ?? '').trim()) return
  yield put(updateNote({ key: noteKey, title }))
}

function* handleAcceptFolder({ payload }) {
  const noteKey = payload?.noteKey
  const { folder } = yield select(getNoteSuggestions)
  if (!noteKey || !folder) return
  yield put(clearNoteSuggestion({ noteKey, kind: SUGGESTION_KIND.FOLDER }))
  try {
    let folderKey = folder.folderKey
    if (!folderKey && folder.name) {
      folderKey = findFolderByName(yield select(getFoldersData), folder.name)
      if (!folderKey) folderKey = (yield call(backendApi.insertFolder, { title: folder.name }))?.key
    }
    if (!folderKey) return
    yield put(moveNotes({ keys: [noteKey], folderKey }))
    if (folder.folderKey) {
      yield put(noteSuggestionAccepted({ kind: SUGGESTION_KIND.FOLDER, folderKey }))
    }
  } catch (e) {
    log.warn('[ai-suggest] folder move failed', e?.message ?? e)
  }
}

function* handleAccepted({ payload }) {
  if (payload?.kind !== SUGGESTION_KIND.FOLDER) return
  try {
    yield call(recordFolderFeedback, backendApi, payload.folderKeys ?? payload.folderKey, true)
  } catch (e) {
    log.warn('[ai-suggest] feedback not saved', e?.message ?? e)
  }
}

function* handleDismiss({ payload }) {
  const { noteKey, kind } = payload || {}
  if (!noteKey || !kind) return
  yield put(clearNoteSuggestion({ noteKey, kind }))
  try {
    if (!(yield call(dismissSuggestion, backendApi, noteKey, kind))) {
      log.warn('[ai-suggest] dismissal not saved')
    }
  } catch (e) {
    log.warn('[ai-suggest] dismissal not saved', e?.message ?? e)
  }
}

function* handleLoadAiSuggestions() {
  try {
    yield put(setAiSuggestions(yield call(loadAiSuggestions, backendApi)))
  } catch (e) {
    log.debug('[ai-suggest] switches unavailable', e?.message)
  }
}

function* handleSetAiSuggestion({ payload }) {
  const previous = yield select(getAiSuggestions)
  const next = { ...previous, [payload.kind]: payload.on !== false }
  yield put(setAiSuggestions(next))
  const { noteKey } = yield select(getNoteSuggestions)
  if (noteKey && !next[AI_SUGGESTION.TITLES]) {
    yield put(clearNoteSuggestion({ noteKey, kind: SUGGESTION_KIND.TITLE }))
  }
  if (noteKey && !next[AI_SUGGESTION.FOLDERS]) {
    yield put(clearNoteSuggestion({ noteKey, kind: SUGGESTION_KIND.FOLDER }))
  }
  try {
    yield call(saveAiSuggestions, backendApi, next)
  } catch (e) {
    log.warn('[ai-suggest] could not save switches', e?.message)
    yield put(setAiSuggestions(previous))
  }
}

function* serializeAiSuggestionChanges() {
  const changes = yield actionChannel(setAiSuggestion.type)
  while (true) yield call(handleSetAiSuggestion, yield take(changes))
}

export function* watchNoteSuggestions() {
  yield takeLatest(
    [initApp.type, vaultEntered.type, localAiAppResumed.type, loadAiSuggestionPrefs.type],
    handleLoadAiSuggestions
  )
  yield fork(serializeAiSuggestionChanges)
  yield takeLatest([selectNote.type, setSelectedNote.type], handleSelected)
  yield takeEvery(dismissNoteSuggestion.type, handleDismiss)
  yield takeLatest(loadUpcomingSuggestions.type, handleLoadUpcoming)
  yield takeEvery(acceptUpcomingTitle.type, handleAcceptUpcomingTitle)
  yield takeEvery(noteSuggestionAccepted.type, handleAccepted)
  yield takeEvery(acceptFolderSuggestion.type, handleAcceptFolder)
}
