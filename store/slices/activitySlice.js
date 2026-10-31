import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'
import { ACTIVITY_FILTER } from '../../constant.js'

const initialState = {
  entries: [],
  cursor: '',
  hasMore: false,
  filter: ACTIVITY_FILTER.ALL,
  deviceKey: '',
  noteKey: '',
  historyNoteKey: null,
  noteEntries: {},
  diffs: {},
  recovering: {},
  stats: { count: 0, bytes: 0, oldestAt: 0 },
  isLoading: false,
  isLoadingMore: false,
  isClearing: false,
  error: null
}

const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    setActivityLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setActivityLoadingMore: (state, action) => {
      state.isLoadingMore = action.payload
    },
    setActivityEntries: (state, action) => {
      const { entries, cursor, hasMore, append } = action.payload
      state.entries = append ? [...state.entries, ...entries] : entries
      state.cursor = cursor || ''
      state.hasMore = !!hasMore
      state.isLoading = false
      state.isLoadingMore = false
      state.error = null
    },
    setNoteActivityEntries: (state, action) => {
      const { noteKey, entries } = action.payload
      state.noteEntries[noteKey] = entries
      state.isLoading = false
      state.error = null
    },
    setActivityFilter: (state, action) => {
      state.filter = action.payload
      state.cursor = ''
    },
    setActivityDeviceFilter: (state, action) => {
      state.deviceKey = action.payload
      state.cursor = ''
    },
    openNoteHistory: (state, action) => {
      state.historyNoteKey = action.payload
    },
    closeNoteHistory: (state) => {
      state.historyNoteKey = null
    },
    setActivityDiff: (state, action) => {
      state.diffs[action.payload.id] = action.payload.data
    },
    setActivityRecovering: (state, action) => {
      const { id, value } = action.payload
      if (value) {
        state.recovering[id] = true
      } else {
        delete state.recovering[id]
      }
    },
    setActivityStats: (state, action) => {
      state.stats = action.payload
    },
    setActivityClearing: (state, action) => {
      state.isClearing = action.payload
    },
    setActivityError: (state, action) => {
      state.error = action.payload
      state.isLoading = false
      state.isLoadingMore = false
    },
    resetActivity: () => initialState
  }
})

export const {
  setActivityLoading,
  setActivityLoadingMore,
  setActivityEntries,
  setNoteActivityEntries,
  setActivityFilter,
  setActivityDeviceFilter,
  openNoteHistory,
  closeNoteHistory,
  setActivityDiff,
  setActivityRecovering,
  setActivityStats,
  setActivityClearing,
  setActivityError,
  resetActivity
} = activitySlice.actions

export const fetchActivity = createAction('activity/fetch')
export const fetchMoreActivity = createAction('activity/fetch-more')
export const fetchNoteActivity = createAction('activity/fetch-note')
export const fetchActivityDiff = createAction('activity/fetch-diff')
export const fetchActivityStats = createAction('activity/fetch-stats')
export const recoverDiscardedWrite = createAction('activity/recover-discarded-write')
export const clearActivity = createAction('activity/clear')
export const subscribeActivity = createAction('activity/subscribe')
export const unsubscribeActivity = createAction('activity/unsubscribe')

const EMPTY_ENTRIES = []

const activityState = (state) => state.activity

export const getActivityEntries = (state) => activityState(state).entries
export const getActivityCursor = (state) => activityState(state).cursor
export const getActivityHasMore = (state) => activityState(state).hasMore
export const getActivityFilter = (state) => activityState(state).filter
export const getActivityDeviceFilter = (state) => activityState(state).deviceKey
export const getActivityIsLoading = (state) => activityState(state).isLoading
export const getActivityIsLoadingMore = (state) => activityState(state).isLoadingMore
export const getActivityIsClearing = (state) => activityState(state).isClearing
export const getActivityError = (state) => activityState(state).error
export const getActivityStats = (state) => activityState(state).stats
export const getActivityDiffs = (state) => activityState(state).diffs
export const getHistoryNoteKey = (state) => activityState(state).historyNoteKey
export const getActivityDiff = (id) => (state) => activityState(state).diffs[id] || null
export const getIsRecoveringWrite = (id) => (state) => !!activityState(state).recovering[id]
export const getNoteActivityEntries = (noteKey) => (state) =>
  activityState(state).noteEntries[noteKey] || EMPTY_ENTRIES

export const getActivityDayGroups = createSelector([getActivityEntries], (entries) => {
  const groups = []
  let current = null
  for (const entry of entries) {
    const day = new Date(entry.lastAt || entry.at).toDateString()
    if (!current || current.day !== day) {
      current = { day, at: entry.lastAt || entry.at, entries: [] }
      groups.push(current)
    }
    current.entries.push(entry)
  }
  return groups
})

export default activitySlice.reducer
