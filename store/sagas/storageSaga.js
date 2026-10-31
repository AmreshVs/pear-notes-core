import { call, put, race, take, takeLatest } from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import {
  deleteNoteMedia,
  pauseDownload,
  reclaimStorage,
  removeMediaFromNote,
  retryDownload,
  setNotesStorageInfo,
  setReclaiming,
  setStorageError,
  subscribeStorageInfo,
  unsubscribeStorageInfo
} from '../slices/storageSlice.js'
import { apiSubscribeCall, isChannelClosed } from './utils.js'
import * as log from '../../log.js'

function* streamStorageInfo() {
  try {
    yield apiSubscribeCall(
      backendApi.subscribeStorageInfo,
      function* ({
        data,
        totalBlobBytes,
        totalOnDiskBytes,
        reclaimableBytes,
        downloads,
        uploads,
        sealWaiting
      }) {
        if (data)
          yield put(
            setNotesStorageInfo({
              notes: data,
              totalBlobBytes: totalBlobBytes ?? 0,
              totalOnDiskBytes: totalOnDiskBytes ?? 0,
              reclaimableBytes: reclaimableBytes ?? 0,
              downloads: downloads ?? [],
              uploads: uploads ?? [],
              sealWaiting: sealWaiting ?? []
            })
          )
      }
    )
  } catch (error) {
    log.error('Error in handleSubscribeStorageInfo:', error)
    yield put(setStorageError(error.message))
  }
}

function* handleSubscribeStorageInfo() {
  yield race({
    stream: call(streamStorageInfo),
    stopped: take(unsubscribeStorageInfo)
  })
}

function* handleRetryDownload({ payload: { url } }) {
  try {
    yield call(backendApi.retryDownload, { url })
  } catch (error) {
    log.error('Error in handleRetryDownload:', error)
    yield put(setStorageError(error.message))
  }
}

function* handlePauseDownload({ payload: { url } }) {
  try {
    yield call(backendApi.pauseDownload, { url })
  } catch (error) {
    log.error('Error in handlePauseDownload:', error)
    yield put(setStorageError(error.message))
  }
}

function* handleReclaimStorage() {
  try {
    yield put(setReclaiming(true))
    yield call(backendApi.reclaimOrphanedBlobs)
  } catch (error) {
    if (isChannelClosed(error)) return
    log.error('Error in handleReclaimStorage:', error)
    yield put(setStorageError(error.message))
  } finally {
    yield put(setReclaiming(false))
  }
}

function* handleDeleteNoteMedia({ payload: { noteKey, mediaPath } }) {
  try {
    yield put(removeMediaFromNote({ noteKey, mediaPath }))
    const response = yield call(backendApi.deleteNoteFile, { noteKey, mediaPath })
    // A sealed note refuses while the lock session is closed; restart the stream to restore the row.
    if (!response?.done) yield put(subscribeStorageInfo())
  } catch (error) {
    log.error('Error in handleDeleteNoteMedia:', error)
    yield put(setStorageError(error.message))
  }
}

export function* watchStorageSaga() {
  yield takeLatest(subscribeStorageInfo, handleSubscribeStorageInfo)
  yield takeLatest(deleteNoteMedia, handleDeleteNoteMedia)
  yield takeLatest(reclaimStorage, handleReclaimStorage)
  yield takeLatest(retryDownload, handleRetryDownload)
  yield takeLatest(pauseDownload, handlePauseDownload)
}
