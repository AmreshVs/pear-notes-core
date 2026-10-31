import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'
import { findTermRanges, parseSearchQuery } from '../../backend/noteSearch.js'

export const SEARCH_SCOPE = {
  FOLDER: 'folder',
  ALL: 'all'
}

export const SEARCH_STATUS = {
  IDLE: 'idle',
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed'
}

export const MEANING_STATUS = {
  IDLE: 'idle',
  PENDING: 'pending',
  DONE: 'done',
  UNAVAILABLE: 'unavailable'
}

const EMPTY_HITS = {}
const NO_MEANING_HITS = []
const initialMeaning = { status: MEANING_STATUS.IDLE, query: '', indexAt: 0, hits: NO_MEANING_HITS }

const initialState = {
  scope: SEARCH_SCOPE.FOLDER,
  includeLocked: false,
  status: SEARCH_STATUS.IDLE,
  pendingQuery: '',
  query: '',
  folderKey: '',
  hits: EMPTY_HITS,
  total: 0,
  meaning: initialMeaning
}

const sameRanges = (a, b) => a.length === b.length && a.every((value, i) => value === b[i])

const sameHit = (x, y) =>
  !!x && !!y && x.inTitle === y.inTitle && x.snippet === y.snippet && sameRanges(x.ranges, y.ranges)

function sameHits(a, b) {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((key) => a[key] === b[key] || sameHit(a[key], b[key]))
}

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setSearchScope: (state, action) => {
      state.scope = action.payload === SEARCH_SCOPE.ALL ? SEARCH_SCOPE.ALL : SEARCH_SCOPE.FOLDER
    },
    setSearchIncludeLocked: (state, action) => {
      state.includeLocked = action.payload === true
    },
    searchStarted: (state, action) => {
      state.status = SEARCH_STATUS.PENDING
      state.pendingQuery = action.payload
    },
    searchResultsReceived: (state, action) => {
      const { query, folderKey, results, total } = action.payload
      const previous = state.hits
      const hits = {}
      for (const result of results || []) {
        const hit = {
          inTitle: result.inTitle === true,
          snippet: result.snippet || '',
          ranges: Array.isArray(result.ranges) ? result.ranges : []
        }
        hits[result.key] = sameHit(previous[result.key], hit) ? previous[result.key] : hit
      }
      state.status = SEARCH_STATUS.DONE
      state.pendingQuery = ''
      state.total = total || 0
      if (state.query === query && state.folderKey === folderKey && sameHits(state.hits, hits)) {
        return
      }
      state.query = query
      state.folderKey = folderKey
      state.hits = hits
    },
    searchFailed: (state) => {
      state.status = SEARCH_STATUS.FAILED
      state.pendingQuery = ''
    },
    meaningSearchStarted: (state, action) => {
      const { query, indexAt } = action.payload
      state.meaning = { ...state.meaning, status: MEANING_STATUS.PENDING, query, indexAt }
    },
    meaningResultsReceived: (state, action) => {
      const { query, hits } = action.payload
      if (state.meaning.query !== query) return
      state.meaning = {
        ...state.meaning,
        status: MEANING_STATUS.DONE,
        query,
        hits: hits?.length ? hits : NO_MEANING_HITS
      }
    },
    meaningSearchUnavailable: (state, action) => {
      if (state.meaning.query !== action.payload) return
      state.meaning = {
        ...state.meaning,
        status: MEANING_STATUS.UNAVAILABLE,
        query: action.payload,
        hits: NO_MEANING_HITS
      }
    },
    clearSearchResults: (state) => {
      state.meaning = initialMeaning
      state.status = SEARCH_STATUS.IDLE
      state.pendingQuery = ''
      state.query = ''
      state.folderKey = ''
      state.hits = EMPTY_HITS
      state.total = 0
    }
  }
})

export const {
  setSearchScope,
  setSearchIncludeLocked,
  searchStarted,
  searchResultsReceived,
  searchFailed,
  meaningSearchStarted,
  meaningResultsReceived,
  meaningSearchUnavailable,
  clearSearchResults
} = searchSlice.actions

export const prewarmSearch = createAction('search/prewarm')
export const refreshSearch = createAction('search/refresh')

const searchState = (state) => state.search || initialState

export const getSearchScope = (state) => searchState(state).scope
export const getSearchIncludeLocked = (state) => searchState(state).includeLocked
export const getSearchStatus = (state) => searchState(state).status
export const getSearchTotal = (state) => searchState(state).total
export const getMeaningSearch = (state) => searchState(state).meaning || initialMeaning

const isRefinement = (a, b) => a.startsWith(b) || b.startsWith(a)

export const getSearchTerms = createSelector(
  [(state) => state.ui.searchQuery],
  (query) => parseSearchQuery(query)
)

export const getActiveSearchHits = createSelector(
  [(state) => state.ui.searchQuery, searchState],
  (rawQuery, search) => {
    const query = (rawQuery || '').trim()
    if (!query || !search.query) return EMPTY_HITS
    if (search.query === query) return search.hits
    if (search.status !== SEARCH_STATUS.FAILED && isRefinement(query, search.query)) {
      return search.hits
    }
    return EMPTY_HITS
  }
)

export const getSearchHit = (state, key) => getActiveSearchHits(state)[key] || null

export const getTitleHighlight = (title, terms) =>
  title && terms.length ? findTermRanges(title, terms).join(',') : ''

export const parseHighlight = (highlight) => (highlight ? highlight.split(',').map(Number) : [])

export const getSearchSettled = (state) => {
  const query = (state.ui.searchQuery || '').trim()
  if (!query) return true
  const search = searchState(state)
  return search.status === SEARCH_STATUS.FAILED || search.query === query
}

export default searchSlice.reducer
