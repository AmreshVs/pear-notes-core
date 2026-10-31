import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'
import {
  ALL_NOTES_KEY,
  LOCKED_NOTES_KEY,
  RECENTLY_DELETED_KEY,
  normalizeAttachmentUrls
} from '../../constant.js'
import { titleMatchesTerms } from '../../backend/noteSearch.js'
import {
  SEARCH_SCOPE,
  getActiveSearchHits,
  getMeaningSearch,
  getSearchIncludeLocked,
  getSearchScope,
  getSearchTerms
} from './searchSlice.js'
import {
  getDuplicateNotesState,
  getRelatedNotesState,
  getUpcomingSuggestionState,
  selectAiSuggestionOn
} from './localAiSlice.js'
import { AI_SUGGESTION } from '../services/aiSuggestionPrefs.js'

const NOTES_KEY = 'notes'

const normalizeNoteData = (data) =>
  data && typeof data.note === 'string'
    ? { ...data, note: normalizeAttachmentUrls(data.note) }
    : data
const initialState = {
  notes: [],
  notesKeys: [],
  notesData: [],
  selectedNote: null,
  isLoading: true,
  error: null
}

const notesSlice = createSlice({
  name: NOTES_KEY,
  initialState,
  reducers: {
    loadNotes: (state) => {
      state.isLoading = true
      state.error = null
    },
    loadNotesSuccess: (state) => {
      // The first note to open is picked in setNoteKeys, which is the only
      // place that knows whether the list just went from empty to filled.
      state.isLoading = false
      state.error = null
    },
    loadNotesFailure: (state, action) => {
      state.isLoading = false
      state.error = action.payload
    },
    setSelectedNote: (state, action) => {
      state.selectedNote = action.payload
    },
    setLastMerge: (state, action) => {
      state.lastMerge = action.payload
    },
    setMergePreview: (state, action) => {
      state.mergePreview = action.payload
    },
    setLockRefusal: (state, action) => {
      state.lockRefusal = action.payload
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setNoteKeys: (state, action) => {
      const previousKeys = state.notesKeys
      state.notesKeys = action.payload

      // The key list is authoritative. A key that dropped out of it was
      // deleted for good, so its cached body has to go too: consumers read
      // notesData by key, and a leftover row keeps a deleted note on screen
      // (the desktop editor kept rendering the note it was showing).
      const liveKeys = new Set(action.payload)
      for (const key of Object.keys(state.notesData)) {
        if (!liveKeys.has(key)) delete state.notesData[key]
      }
      if (state.selectedNote && !liveKeys.has(state.selectedNote)) {
        state.selectedNote = null
      }

      // Open the first note once the list arrives (boot, or a freshly paired
      // device syncing its first notes). Later updates must never move the
      // selection, or deleting the open note would jump to another one.
      if (!state.selectedNote && previousKeys.length === 0 && action.payload.length > 0) {
        state.selectedNote = action.payload[0]
      }
    },
    setNoteData: (state, { payload }) => {
      state.notesData = {
        ...state.notesData,
        [payload.key]: normalizeNoteData(payload.data)
      }
    },
    setNotesDataBatch: (state, { payload }) => {
      const next = { ...state.notesData }
      for (const { key, data } of payload || []) next[key] = normalizeNoteData(data)
      state.notesData = next
    },
    clearState: (state) => {
      state.notes = []
      state.notesKeys = []
      state.notesData = {}
      state.selectedNote = null
      state.mergePreview = null
      state.isLoading = true
    }
  }
})

export const {
  loadNotes,
  loadNotesSuccess,
  loadNotesFailure,
  setSelectedNote,
  setLastMerge,
  setMergePreview,
  setLockRefusal,
  setLoading,
  setNoteKeys,
  setNoteData,
  setNotesDataBatch,
  clearState
} = notesSlice.actions

const notesState = (state) => state[NOTES_KEY]
export const getNoteKeys = (state) => notesState(state).notesKeys
export const getNotesData = (state) => notesState(state).notesData
export const getNoteData = (key) => createSelector(getNotesData, (state) => state[key])
export const getSelectedNote = (state) => notesState(state).selectedNote
export const getLastMerge = (state) => notesState(state).lastMerge ?? null
export const getMergePreview = (state) => notesState(state).mergePreview ?? null
export const getLockRefusal = (state) => notesState(state).lockRefusal ?? null
export const getIsLoading = (state) => notesState(state).isLoading

export const getNotes = createSelector([getNoteKeys, getNotesData], (keys, data) => {
  return keys
    .map((key) => ({
      key,
      value: data[key]
    }))
    .filter((n) => n.value)
})

export const isSearchingAllNotes = (selectedFolder, searchTerms, scope) =>
  searchTerms.length > 0 &&
  scope === SEARCH_SCOPE.ALL &&
  selectedFolder !== ALL_NOTES_KEY &&
  selectedFolder !== LOCKED_NOTES_KEY &&
  selectedFolder !== RECENTLY_DELETED_KEY

export const getFilteredNotes = createSelector(
  [
    getNotes,
    (state) => state.folders.selectedFolder,
    getSearchTerms,
    getActiveSearchHits,
    getSearchScope,
    getSearchIncludeLocked,
    (state) => state.settings.sortBy
  ],
  (notes, selectedFolder, searchTerms, searchHits, searchScope, includeLocked, sortBy) => {
    let filtered = notes

    if (selectedFolder === LOCKED_NOTES_KEY) {
      filtered = filtered.filter(
        (note) => note.value?.locked === true && note.value?.folderKey !== RECENTLY_DELETED_KEY
      )
    } else if (
      selectedFolder !== ALL_NOTES_KEY &&
      !isSearchingAllNotes(selectedFolder, searchTerms, searchScope)
    ) {
      filtered = filtered.filter((note) => note.value?.folderKey === selectedFolder)
    } else {
      filtered = filtered.filter((note) => note.value?.folderKey !== RECENTLY_DELETED_KEY)
    }

    if (searchTerms.length) {
      filtered = filtered.filter((note) => {
        if (titleMatchesTerms(note.value?.title, searchTerms)) return true
        if (!searchHits[note.key]) return false
        return includeLocked || note.value?.locked !== true
      })
    }

    // Pinned notes are shown first (except in trash), then sorted by setting
    const pinnable = selectedFolder !== RECENTLY_DELETED_KEY

    return filtered.sort((a, b) => {
      if (pinnable) {
        const pinnedA = a.value?.pinned === true ? 1 : 0
        const pinnedB = b.value?.pinned === true ? 1 : 0
        if (pinnedA !== pinnedB) return pinnedB - pinnedA
      }

      if (sortBy === 'title') {
        const titleA = (a.value?.title || '').toLowerCase()
        const titleB = (b.value?.title || '').toLowerCase()
        return titleA < titleB ? -1 : titleA > titleB ? 1 : 0
      }

      if (sortBy === 'createdAt') {
        const timeA = a.value?.createdAt || 0
        const timeB = b.value?.createdAt || 0
        return timeB - timeA
      }

      // Default: updatedAt
      const timeA = a.value?.updatedAt || a.value?.createdAt || 0
      const timeB = b.value?.updatedAt || b.value?.createdAt || 0
      return timeB - timeA
    })
  }
)

const NO_MEANING_NOTES = []
const NO_RELATED_NOTES = []
const NO_DUPLICATE_PAIRS = []
export const RELATED_NOTES_SHOWN = 8

const isListedNote = (value) =>
  !!value && value.locked !== true && value.folderKey !== RECENTLY_DELETED_KEY

/** Related-notes panel rows: hits for the open note that are still listed (not locked or trashed). */
export const getRelatedNoteRows = createSelector(
  [getNotes, getRelatedNotesState],
  (notes, related) => {
    if (!related.noteKey || related.forKey !== related.noteKey || !related.hits.length)
      return NO_RELATED_NOTES
    const byKey = new Map(notes.map((note) => [note.key, note.value]))
    const out = related.hits
      .filter((hit) => hit.key !== related.noteKey && isListedNote(byKey.get(hit.key)))
      .slice(0, RELATED_NOTES_SHOWN)
      .map((hit) => ({ key: hit.key, snippet: hit.snippet }))
    return out.length ? out : NO_RELATED_NOTES
  }
)

/** Possible-duplicate pairs whose notes are both still listed. */
export const getDuplicatePairRows = createSelector(
  [getNotes, getDuplicateNotesState],
  (notes, duplicates) => {
    if (!duplicates.pairs.length) return NO_DUPLICATE_PAIRS
    const byKey = new Map(notes.map((note) => [note.key, note.value]))
    const out = duplicates.pairs.filter(
      (pair) => isListedNote(byKey.get(pair.a)) && isListedNote(byKey.get(pair.b))
    )
    return out.length ? out : NO_DUPLICATE_PAIRS
  }
)

export const getListedNoteCount = createSelector(
  [getNotes],
  (notes) => notes.filter((note) => isListedNote(note.value)).length
)

export const upcomingDuplicateId = (pair) => `dup:${pair.a}|${pair.b}`
export const upcomingTitleId = (noteKey) => `title:${noteKey}`
const NO_UPCOMING_SUGGESTIONS = Object.freeze({ duplicate: null, title: null })

/** The Upcoming suggestions card: the closest duplicate pair and one untitled note's title, each behind its switch. */
export const getUpcomingSuggestions = createSelector(
  [
    getDuplicatePairRows,
    getNotesData,
    getUpcomingSuggestionState,
    (state) => selectAiSuggestionOn(state, AI_SUGGESTION.RELATED),
    (state) => selectAiSuggestionOn(state, AI_SUGGESTION.TITLES)
  ],
  (pairs, notesData, upcoming, relatedOn, titlesOn) => {
    const snoozed = new Set(upcoming.snoozed)
    const duplicate = relatedOn
      ? (pairs.find((pair) => !snoozed.has(upcomingDuplicateId(pair))) ?? null)
      : null
    const candidate = upcoming.title
    const stored = candidate ? notesData?.[candidate.noteKey] : null
    const title =
      titlesOn &&
      candidate &&
      isListedNote(stored) &&
      !String(stored.title ?? '').trim() &&
      !snoozed.has(upcomingTitleId(candidate.noteKey))
        ? candidate
        : null
    return duplicate || title ? { duplicate, title } : NO_UPCOMING_SUGGESTIONS
  }
)
/**
 * "Related by meaning" rows for the current query: vector hits in the search
 * scope that exact search didn't find. Locked and trashed notes never show.
 */
export const getMeaningNotes = createSelector(
  [
    getNotes,
    getFilteredNotes,
    (state) => state.folders.selectedFolder,
    (state) => state.ui.searchQuery,
    getSearchScope,
    getMeaningSearch
  ],
  (notes, exact, selectedFolder, rawQuery, scope, meaning) => {
    const query = (rawQuery || '').trim()
    if (!query || meaning.query !== query || !meaning.hits.length) return NO_MEANING_NOTES
    if (selectedFolder === RECENTLY_DELETED_KEY) return NO_MEANING_NOTES
    const allFolders = selectedFolder === ALL_NOTES_KEY || scope === SEARCH_SCOPE.ALL
    const exactKeys = new Set(exact.map((note) => note.key))
    const byKey = new Map(notes.map((note) => [note.key, note]))
    const out = []
    for (const hit of meaning.hits) {
      const note = byKey.get(hit.key)
      const value = note?.value
      if (!value || exactKeys.has(hit.key) || value.locked === true) continue
      if (value.folderKey === RECENTLY_DELETED_KEY) continue
      if (!allFolders && value.folderKey !== selectedFolder) continue
      out.push({ key: hit.key, snippet: hit.snippet })
    }
    return out.length ? out : NO_MEANING_NOTES
  }
)

export const getPinnedNotes = createSelector(
  [getFilteredNotes, (state) => state.folders.selectedFolder],
  (notes, selectedFolder) => {
    if (selectedFolder === RECENTLY_DELETED_KEY) return []
    return notes.filter((note) => note.value?.pinned === true)
  }
)

export const getUnpinnedNotes = createSelector(
  [getFilteredNotes, (state) => state.folders.selectedFolder],
  (notes, selectedFolder) => {
    if (selectedFolder === RECENTLY_DELETED_KEY) return notes
    return notes.filter((note) => note.value?.pinned !== true)
  }
)

export const getNoteCountsPerFolder = createSelector([getNotes], (notes) => {
  const counts = {}
  let allNotesCount = 0
  let lockedCount = 0

  notes.forEach((note) => {
    const folderKey = note.value?.folderKey
    if (!folderKey) return
    counts[folderKey] = (counts[folderKey] || 0) + 1
    if (folderKey !== RECENTLY_DELETED_KEY) {
      allNotesCount++
      if (note.value.locked === true) lockedCount++
    }
  })

  counts[ALL_NOTES_KEY] = allNotesCount
  counts[LOCKED_NOTES_KEY] = lockedCount
  return counts
})

export const createNote = createAction(
  'notes/create-note',
  /** @param {{ title?: string, note?: string }} [content] */
  (content = {}) => ({ payload: content })
)
export const updateNote = createAction('notes/update-note')
export const flushNoteSaves = createAction('notes/flush-saves')
export const selectNote = createAction('notes/select-note')
export const setVisibleNotes = createAction('notes/set-visible-notes')
export const deleteNote = createAction('notes/delete-note')
export const deleteNotes = createAction('notes/delete-notes')
export const moveNotes = createAction('notes/move-notes')
export const restoreNote = createAction('notes/restore-note')
export const restoreNotes = createAction('notes/restore-notes')
export const mergeNotes = createAction('notes/merge-notes')
export const undoMergeNotes = createAction('notes/undo-merge-notes')
export const previewMergeNotes = createAction('notes/preview-merge-notes')
export const clearMergePreview = createAction('notes/clear-merge-preview')
export const splitNote = createAction('notes/split-note')
export const applyFolderMoves = createAction('notes/apply-folder-moves')
export const purgeExpiredTrash = createAction('notes/purge-expired-trash')
export const subscribeAllNoteKeys = createAction('notes/subscribe-all-notes-keys')
export const subscribeAllNotes = createAction('notes/subscribe-all-notes')

export default notesSlice.reducer
