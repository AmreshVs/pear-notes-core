import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'

const initialState = {
  notesStorageInfo: [],
  totalBlobBytes: 0,
  totalOnDiskBytes: 0,
  reclaimableBytes: 0,
  isReclaiming: false,
  downloads: [],
  uploads: [],
  sealWaiting: [],
  isLoading: false,
  error: null
}

const storageSlice = createSlice({
  name: 'storage',
  initialState,
  reducers: {
    setNotesStorageInfo: (state, action) => {
      const {
        notes,
        totalBlobBytes,
        totalOnDiskBytes,
        reclaimableBytes,
        downloads,
        uploads,
        sealWaiting
      } = action.payload
      state.notesStorageInfo = notes
      state.totalBlobBytes = totalBlobBytes ?? 0
      state.totalOnDiskBytes = totalOnDiskBytes ?? 0
      state.reclaimableBytes = reclaimableBytes ?? 0
      state.downloads = downloads ?? []
      state.uploads = uploads ?? []
      state.sealWaiting = sealWaiting ?? []
      state.isLoading = false
      state.error = null
    },
    setReclaiming: (state, action) => {
      state.isReclaiming = action.payload
    },
    setStorageLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setStorageError: (state, action) => {
      state.error = action.payload
      state.isLoading = false
    },
    removeMediaFromNote: (state, action) => {
      const { noteKey, mediaPath } = action.payload
      const note = state.notesStorageInfo.find((n) => n.key === noteKey)
      if (!note) return
      const removed = note.media.find((m) => m.path === mediaPath)
      if (!removed) return
      note.media = note.media.filter((m) => m.path !== mediaPath)
      note.mediaSize -= removed.size
      note.totalSize -= removed.size
      state.totalBlobBytes = Math.max(0, state.totalBlobBytes - removed.size)
      state.totalOnDiskBytes = Math.max(0, state.totalOnDiskBytes - removed.size)
    }
  }
})

export const {
  setNotesStorageInfo,
  setStorageLoading,
  setStorageError,
  setReclaiming,
  removeMediaFromNote
} = storageSlice.actions

export const subscribeStorageInfo = createAction('storage/subscribe-storage-info')
export const unsubscribeStorageInfo = createAction('storage/unsubscribe-storage-info')
export const deleteNoteMedia = createAction('storage/delete-note-media')
export const reclaimStorage = createAction('storage/reclaim-storage')
export const retryDownload = createAction('storage/retry-download')
export const pauseDownload = createAction('storage/pause-download')

export const getStorageState = (state) => state.storage
export const getNotesStorageInfo = (state) => getStorageState(state).notesStorageInfo
export const getStorageIsLoading = (state) => getStorageState(state).isLoading
export const getStorageError = (state) => getStorageState(state).error
export const getTotalBlobBytes = (state) => getStorageState(state).totalBlobBytes
export const getTotalOnDiskBytes = (state) => getStorageState(state).totalOnDiskBytes
export const getReclaimableBytes = (state) => getStorageState(state).reclaimableBytes
export const getIsReclaiming = (state) => getStorageState(state).isReclaiming
export const getActiveDownloads = (state) => getStorageState(state).downloads
export const getActiveDownloadsCount = (state) => getStorageState(state).downloads.length
export const getActiveUploads = (state) => getStorageState(state).uploads
export const getActiveUploadsCount = (state) => getStorageState(state).uploads.length
export const getFilesWaitingToSeal = (state) => getStorageState(state).sealWaiting
export const getTotalStorageSize = (state) => {
  const blobBytes = getStorageState(state).totalBlobBytes
  const contentBytes = getNotesStorageInfo(state).reduce((sum, n) => sum + n.contentSize, 0)
  return blobBytes + contentBytes
}

export function mediaKind(name = '') {
  const ext = name.toLowerCase().split('.').pop()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'm4a', 'wav', 'ogg', 'opus', 'aac', 'flac'].includes(ext)) return 'audio'
  return 'file'
}

export const selectStorageByKind = createSelector(getNotesStorageInfo, (notes) => {
  const buckets = {
    image: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    file: { count: 0, size: 0 }
  }
  let textSize = 0
  for (const n of notes) {
    textSize += n.contentSize
    for (const m of n.media) {
      const k = mediaKind(m.name)
      buckets[k].count++
      buckets[k].size += m.size
    }
  }
  return { ...buckets, text: { count: notes.length, size: textSize } }
})

export default storageSlice.reducer
