import { call, put, takeEvery, takeLatest, select } from 'redux-saga/effects'
import { themeStorage } from '../services/storageService.js'
import {
  loadSettingsSuccess,
  getSettings,
  updateSetting,
  setTheme,
  clearLockPassword,
  loadSettings
} from '../slices/settingsSlice.js'
import { backendApi } from '../../backend/api.js'
import { apiSubscribeCall } from './utils.js'
import { subscribeSettings } from '../slices/settingsSlice.js'
import * as log from '../../log.js'

function* loadSettingsSaga() {
  try {
    const response = yield call(backendApi.getSettings)
    if (response && response.data) {
      const settings = response.data
      yield put(loadSettingsSuccess(settings))
      yield call(themeStorage.apply, settings.theme || 'system')
    }
  } catch (error) {
    log.error('Error loading settings:', error)
  }
}

function* saveSettingsSaga() {
  try {
    const settings = yield select(getSettings)
    const persistedSettings = { ...settings }
    delete persistedSettings.isLoading
    yield call(backendApi.updateSettings, { settings: persistedSettings })
  } catch (error) {
    log.error('Error saving settings:', error)
  }
}

function* themeChangedSaga(action) {
  const theme = action.payload || 'system'
  yield call(themeStorage.apply, theme)
}

export function* subscribeGeneralSettings() {
  yield call(
    apiSubscribeCall,
    backendApi.subscribeSettings,
    function* (data) {
      if (data && data.data) {
        const settings = data.data
        yield put(loadSettingsSuccess(settings))
        yield call(themeStorage.apply, settings.theme || 'system')
      }
    },
    { retry: true }
  )
}

export function* watchSettingsSaga() {
  yield takeLatest(subscribeSettings, subscribeGeneralSettings)
  yield takeEvery(loadSettings, loadSettingsSaga)
  yield takeEvery([updateSetting, setTheme, clearLockPassword], saveSettingsSaga)
  yield takeEvery(setTheme, themeChangedSaga)
}
