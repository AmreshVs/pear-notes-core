import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'
import { ALL_NOTES_KEY, DEFAULT_FOLDER_ICON, RECENTLY_DELETED_KEY } from '../../constant.js'

const FOLDERS_KEY = 'folders'

const DEFAULT_FOLDERS = [
  { id: ALL_NOTES_KEY, name: 'All Notes', icon: 'allNotes', isSystem: true, isAll: true },
  {
    id: RECENTLY_DELETED_KEY,
    name: 'Recently Deleted',
    icon: 'trash',
    isSystem: true,
    isTrash: true
  }
]

const initialState = {
  folderKeys: [],
  folderData: {},
  selectedFolder: ALL_NOTES_KEY,
  isLoading: true,
  error: null
}

const foldersSlice = createSlice({
  name: FOLDERS_KEY,
  initialState,
  reducers: {
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setFolderKeys: (state, action) => {
      state.folderKeys = action.payload
    },
    setFolderData: (state, { payload }) => {
      state.folderData = {
        ...state.folderData,
        [payload.key]: payload.data
      }
    },
    setFoldersData: (state, { payload }) => {
      state.folderData = { ...state.folderData, ...payload }
    },
    setSelectedFolder: (state, action) => {
      state.selectedFolder = action.payload
    },
    clearState: (state) => {
      state.folderKeys = []
      state.folderData = {}
      state.selectedFolder = ALL_NOTES_KEY
      state.isLoading = true
    }
  },
  extraReducers: (builder) => {
    builder.addCase(updateFolder, (state, { payload }) => {
      const { id, name, icon } = payload
      const existing = state.folderData[id]
      if (existing) {
        state.folderData[id] = {
          ...existing,
          title: name === undefined ? existing.title : name,
          icon: icon === undefined ? existing.icon : icon,
          updatedAt: Date.now()
        }
      }
    })
    builder.addCase(deleteFolder, (state, { payload: key }) => {
      // Optimistically remove from keys and data
      state.folderKeys = state.folderKeys.filter((k) => k !== key)
      delete state.folderData[key]

      // If we deleted the currently selected folder, go back to All Notes
      if (state.selectedFolder === key) {
        state.selectedFolder = ALL_NOTES_KEY
      }
    })
  }
})

export const {
  setLoading,
  setFolderKeys,
  setFolderData,
  setFoldersData,
  setSelectedFolder,
  clearState
} = foldersSlice.actions

const foldersState = (state) => state[FOLDERS_KEY]

export const getFolderKeys = (state) => foldersState(state).folderKeys
export const getFoldersData = (state) => foldersState(state).folderData
export const getSelectedFolder = (state) => foldersState(state).selectedFolder
export const getFoldersLoading = (state) => foldersState(state).isLoading

const systemFolders = DEFAULT_FOLDERS

export const getFolders = createSelector([getFolderKeys, getFoldersData], (keys, data) => {
  const customFolders = keys.map((key) => {
    const folder = data[key]
    return {
      id: key,
      name: folder?.title || 'Untitled Folder',
      icon: folder?.icon || DEFAULT_FOLDER_ICON,
      isSystem: false,
      createdAt: folder?.addedAt || Number.MAX_SAFE_INTEGER,
      updatedAt: folder?.updatedAt || 0
    }
  })
  const sortedCustomFolders = [...customFolders].sort((a, b) => b.createdAt - a.createdAt)
  return [...systemFolders, ...sortedCustomFolders]
})

export const createFolder = createAction('folders/create-folder')
export const updateFolder = createAction('folders/update-folder')
export const deleteFolder = createAction('folders/delete-folder')
export const subscribeAllFolderKeys = createAction('folders/subscribe-all-folder-keys')
export const subscribeAllFolders = createAction('folders/subscribe-all-folders')

export default foldersSlice.reducer
