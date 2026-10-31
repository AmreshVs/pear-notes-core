import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'
import { HYPERDRIVE_URL_PREFIX } from '../../constant.js'

const initialState = {
  searchQuery: '',
  showSettings: false,
  askVault: null,
  shouldAutoRenameNextFolder: false,
  editor: null,
  isLoading: false,
  error: null,
  hyperdriveServerAddress: ''
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSearchQuery: (state, action) => {
      state.searchQuery = action.payload
    },

    setShowSettings: (state, action) => {
      state.showSettings = action.payload
    },
    // null when closed, else { question } to start the Ask bar with.
    openAskVault: (state, action) => {
      state.askVault = { question: String(action.payload?.question ?? '') }
    },
    closeAskVault: (state) => {
      state.askVault = null
    },
    setShouldAutoRenameNextFolder: (state, action) => {
      state.shouldAutoRenameNextFolder = action.payload
    },

    setEditor: (state, action) => {
      state.editor = action.payload
    },

    setLoading: (state, action) => {
      state.isLoading = action.payload
    },

    setHyperdriveServerAddress: (state, action) => {
      state.hyperdriveServerAddress = action.payload
    }
  }
})

export const {
  setSearchQuery,
  setShowSettings,
  openAskVault,
  closeAskVault,
  setShouldAutoRenameNextFolder,
  setEditor,
  setLoading,
  setHyperdriveServerAddress
} = uiSlice.actions

const uiState = (state) => state.ui

export const getSearchQuery = (state) => uiState(state).searchQuery
export const getShowSettings = (state) => uiState(state).showSettings
export const getAskVault = (state) => uiState(state).askVault
export const getShouldAutoRenameNextFolder = (state) => uiState(state).shouldAutoRenameNextFolder
export const getIsLoading = (state) => uiState(state).isLoading
export const getHyperdriveServerAddress = (state) => uiState(state).hyperdriveServerAddress

export const getHyperdriveAddress = createSelector(
  [getHyperdriveServerAddress, (_, url) => url],
  (address, url) => {
    if (!url) return
    if (!address) {
      if (url && url.includes(HYPERDRIVE_URL_PREFIX)) return null
      return url
    }
    return url.replace(HYPERDRIVE_URL_PREFIX, address.replace(/\/$/, ''))
  }
)

export const initApp = createAction('ui/init-app')
export const resyncApp = createAction('ui/resync-app')
export const refreshHyperdriveAddress = createAction('ui/refresh-hyperdrive-address')
export const appSuspended = createAction('ui/app-suspended')
export const appResumed = createAction('ui/app-resumed')
export const appReady = createAction('ui/app-ready')
// Drops every slice back to its initial state. The store outlives a soft reload on
// mobile, so after the backend's storage is wiped this is what stands in for the
// fresh store a real app restart would build.
export const resetAppState = createAction('ui/reset-app-state')
export const clearVaultState = createAction('ui/clear-vault-state')
export const loadTheme = createAction('ui/load-theme') // Redundant but kept for safety if needed, though we should transition to loadSettings

export default uiSlice.reducer
