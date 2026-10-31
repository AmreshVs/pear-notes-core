import { cancelled, put, race, take, takeLatest } from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import {
  cancelExportBackup,
  cancelImportBackup,
  resetExport,
  resetImport,
  setExportBuffer,
  setExportStatus,
  setImportStatus,
  startExportBackup,
  startImportBackup
} from '../slices/backupSlice.js'
import { apiSubscribeCall } from './utils.js'
import * as log from '../../log.js'

function* handleExportBackup({ payload }) {
  try {
    const { password, filePath } = payload || {}
    yield put(resetExport())
    const { cancel } = yield race({
      subscription: apiSubscribeCall(
        () => backendApi.exportBackup({ password, filePath }),
        function* ({ data, buffer }) {
          if (data) {
            yield put(setExportStatus(data))
          }
          if (buffer) {
            yield put(setExportBuffer(buffer))
          }
        }
      ),
      cancel: take(cancelExportBackup)
    })
    if (cancel) {
      yield put(resetExport())
    }
  } catch (error) {
    log.error('Error in handleExportBackup:', error)
    yield put(setExportStatus({ step: 'error', message: error.message, progress: 0 }))
  } finally {
    if (yield cancelled()) {
      log.debug('[handleExportBackup] Cancelled')
    }
  }
}

function* handleImportBackup({ payload: { buffer, filePath, recoveryKey, password } }) {
  try {
    yield put(resetImport())
    const { cancel } = yield race({
      subscription: apiSubscribeCall(
        () => backendApi.importBackup({ buffer, filePath, recoveryKey, password }),
        function* ({ data }) {
          if (data) {
            yield put(setImportStatus(data))
          }
        }
      ),
      cancel: take(cancelImportBackup)
    })
    if (cancel) {
      yield put(resetImport())
    }
  } catch (error) {
    log.error('Error in handleImportBackup:', error)
    yield put(setImportStatus({ step: 'error', message: error.message, progress: 0 }))
  } finally {
    if (yield cancelled()) {
      log.debug('[handleImportBackup] Cancelled')
    }
  }
}

export function* watchBackupSaga() {
  yield takeLatest(startExportBackup, handleExportBackup)
  yield takeLatest(startImportBackup, handleImportBackup)
}
