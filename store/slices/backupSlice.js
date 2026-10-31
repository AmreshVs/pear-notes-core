import { createAction, createSlice } from '@reduxjs/toolkit'

const initialStatus = {
  step: 'idle', // idle | reading_data | encrypting_metadata | processing_media | building_archive | validating | decrypting | restoring_settings | restoring_folders | restoring_notes | restoring_media | done | error
  message: '',
  progress: 0,
  current: 0,
  total: 0
}

const initialState = {
  exportStatus: { ...initialStatus },
  importStatus: { ...initialStatus },
  exportBuffer: null
}

const backupSlice = createSlice({
  name: 'backup',
  initialState,
  reducers: {
    setExportStatus: (state, action) => {
      if (state.exportStatus.step === 'done' && action.payload.step !== 'idle') return
      state.exportStatus = { ...state.exportStatus, ...action.payload }
    },
    setImportStatus: (state, action) => {
      if (state.importStatus.step === 'done' && action.payload.step !== 'idle') return
      state.importStatus = { ...state.importStatus, ...action.payload }
    },
    setExportBuffer: (state, action) => {
      state.exportBuffer = action.payload
    },
    resetExport: (state) => {
      state.exportStatus = { ...initialStatus }
      state.exportBuffer = null
    },
    resetImport: (state) => {
      state.importStatus = { ...initialStatus }
    }
  }
})

export const { setExportStatus, setImportStatus, setExportBuffer, resetExport, resetImport } =
  backupSlice.actions

export const startExportBackup = createAction('backup/start-export')
export const startImportBackup = createAction('backup/start-import')
export const cancelExportBackup = createAction('backup/cancel-export')
export const cancelImportBackup = createAction('backup/cancel-import')

export const getBackupState = (state) => state.backup
export const getExportStatus = (state) => getBackupState(state).exportStatus
export const getImportStatus = (state) => getBackupState(state).importStatus
export const getExportBuffer = (state) => getBackupState(state).exportBuffer

export default backupSlice.reducer
