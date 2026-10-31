import { combineReducers, configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'
import notesReducer from './slices/notesSlice.js'
import foldersReducer from './slices/foldersSlice.js'
import uiReducer from './slices/uiSlice.js'
import editorReducer from './slices/editorSlice.js'
import syncReducer from './slices/syncSlice.js'
import settingsReducer from './slices/settingsSlice.js'
import syncedDevicesReducer from './slices/syncedDevicesSlice.js'
import backupReducer from './slices/backupSlice.js'
import storageReducer from './slices/storageSlice.js'
import activityReducer from './slices/activitySlice.js'
import localAiReducer from './slices/localAiSlice.js'
import vaultsReducer from './slices/vaultsSlice.js'
import searchReducer from './slices/searchSlice.js'
import rootSaga from './sagas/rootSaga.js'
import { clearVaultState, resetAppState } from './slices/uiSlice.js'

const sagaMiddleware = createSagaMiddleware()

const appReducer = combineReducers({
  notes: notesReducer,
  folders: foldersReducer,
  ui: uiReducer,
  editor: editorReducer,
  sync: syncReducer,
  settings: settingsReducer,
  syncedDevices: syncedDevicesReducer,
  backup: backupReducer,
  storage: storageReducer,
  activity: activityReducer,
  localAi: localAiReducer,
  vaults: vaultsReducer,
  search: searchReducer
})

// Handing the slices `undefined` is how they rebuild their initial state.
export const VAULT_SCOPED_SLICES = [
  'notes',
  'folders',
  'editor',
  'sync',
  'settings',
  'syncedDevices',
  'backup',
  'storage',
  'activity',
  'search'
]

const withoutVaultState = (state) => {
  const next = { ...state }
  for (const name of VAULT_SCOPED_SLICES) next[name] = undefined
  next.ui = { ...state.ui, searchQuery: '' }
  return next
}

/** @type {typeof appReducer} */
const rootReducer = (state, action) => {
  if (action.type === resetAppState.type) return appReducer(undefined, action)
  if (action.type === clearVaultState.type && state) {
    return appReducer(withoutVaultState(state), action)
  }
  return appReducer(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          'ui/setEditor',
          'editor/setEditorInstance',
          'backup/setExportBuffer',
          'backup/start-import'
        ],
        ignoredPaths: ['ui.editor', 'editor.editorInstance', 'backup.exportBuffer']
      }
    }).concat(sagaMiddleware)
})

sagaMiddleware.run(rootSaga)
