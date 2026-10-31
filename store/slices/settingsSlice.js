import { createSlice } from '@reduxjs/toolkit'
import { ACTIVITY_DEFAULT_RETENTION_DAYS } from '../../constant.js'
import { normalizeActivityRetentionDays } from '../../activity.js'

const initialState = {
  theme: 'system',
  fontFamily: 'Inter',
  editorFontSize: 16,
  sortBy: 'updatedAt',
  lockMethod: 'biometric',
  lockPasswordSalt: '',
  lockPasswordHash: '',
  activityLogEnabled: false,
  activityRetentionDays: ACTIVITY_DEFAULT_RETENTION_DAYS,
  isLoading: false
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    loadSettings: (state) => {
      state.isLoading = true
    },
    loadSettingsSuccess: (state, action) => {
      state.isLoading = false
      if (action.payload) {
        Object.assign(state, action.payload)
      }
    },
    updateSetting: (state, action) => {
      const { key, value } = action.payload
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        state[key] = value
      }
    },
    setTheme: (state, action) => {
      state.theme = action.payload
    },
    clearLockPassword: (state) => {
      state.lockMethod = 'biometric'
      state.lockPasswordSalt = ''
      state.lockPasswordHash = ''
    },
    subscribeSettings: (state) => {
      state.isLoading = true
    }
  }
})

export const {
  loadSettings,
  loadSettingsSuccess,
  updateSetting,
  setTheme,
  clearLockPassword,
  subscribeSettings
} = settingsSlice.actions

const settingsState = (state) => state.settings

export const getSettings = (state) => settingsState(state)
export const getTheme = (state) => settingsState(state).theme
export const getFontFamily = (state) => settingsState(state).fontFamily
export const getEditorFontSize = (state) => {
  const size = settingsState(state).editorFontSize
  return typeof size === 'number' && size >= 8 ? size : 16
}
export const getSortBy = (state) => settingsState(state).sortBy
export const getLockMethod = (state) => settingsState(state).lockMethod || 'biometric'
export const hasCustomLockPassword = (state) => settingsState(state).lockMethod === 'password'
export const getActivityLogEnabled = (state) => !!settingsState(state).activityLogEnabled
export const getActivityRetentionDays = (state) =>
  normalizeActivityRetentionDays(settingsState(state).activityRetentionDays)

export default settingsSlice.reducer
