import { call, put, takeLatest, select, take, race, delay } from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import { apiSubscribeCall, forkItemSubscriptions } from './utils.js'
import { getActivityLogEnabled, updateSetting } from '../slices/settingsSlice.js'
import {
  INDEXER_ERROR,
  INDEXER_TRANSFER_STEP,
  INDEXER_TRANSFER_TIMEOUT_MS
} from '../../constant.js'
import {
  getRemoteSyncedDevices,
  setDevicesKeys,
  setDeviceData,
  setLocalPreference,
  setError,
  updateSyncedDevice,
  deleteSyncedDevice,
  fetchLocalPreference,
  saveLocalPreference,
  checkAndInsertLocalDevice,
  getDevicesKeys,
  subscribeAllSyncedDevicesKeys,
  subscribeAllSyncedDevices,
  setDeviceIndexer,
  setIndexerPending,
  setIndexerError,
  getSyncedDevices,
  getDevicesData
} from '../slices/syncedDevicesSlice.js'
import * as log from '../../log.js'

function isSameKeyOrder(prevKeys, nextKeys) {
  if (prevKeys.length === 0) return false
  if (prevKeys.length !== nextKeys.length) return false
  for (let i = 0; i < prevKeys.length; i++) {
    if (prevKeys[i] !== nextKeys[i]) return false
  }
  return true
}

function isSameDeviceData(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.title === b.title &&
    a.platform === b.platform &&
    a.deviceType === b.deviceType &&
    a.localKey === b.localKey &&
    a.swarmKey === b.swarmKey &&
    a.isLocal === b.isLocal &&
    a.isOnline === b.isOnline &&
    a.presenceKnown === b.presenceKnown &&
    a.isIndexer === b.isIndexer &&
    a.sealedNotes === b.sealedNotes &&
    a.compatLevel === b.compatLevel &&
    a.appVersion === b.appVersion &&
    a.lastSeenAt === b.lastSeenAt
  )
}

function* handleUpdateSyncedDevice({ payload: { key, title } }) {
  try {
    yield call(backendApi.updateSyncedDevice, { key, title })
  } catch (error) {
    yield put(setError(error.message))
  }
}

function* handleDeleteSyncedDevice({ payload: { key } }) {
  try {
    yield call(backendApi.deleteSyncedDevice, key)
    const remaining = yield select(getRemoteSyncedDevices)
    const activityEnabled = yield select(getActivityLogEnabled)
    if (activityEnabled && remaining.filter((device) => device.key !== key).length === 0) {
      yield put(updateSetting({ key: 'activityLogEnabled', value: false }))
    }
  } catch (error) {
    yield put(setError(error.message))
  }
}

function* subscribeAllSyncedDevicesSaga() {
  try {
    const deviceTasks = {}

    const initialKeys = yield select(getDevicesKeys)
    if (initialKeys?.length > 0) {
      yield* forkItemSubscriptions(deviceTasks, initialKeys, subscribeToDevice)
    }

    while (true) {
      const action = yield take(setDevicesKeys)
      const keys = action.payload
      yield* forkItemSubscriptions(deviceTasks, keys, subscribeToDevice)
    }
  } catch (error) {
    log.error('Error in subscribeAllSyncedDevicesSaga:', error)
  }
}

function* subscribeAllSyncedDevicesKeysSaga() {
  try {
    yield apiSubscribeCall(
      backendApi.subscribeAllSyncedDeviceKeys,
      function* ({ data: keys }) {
        const next = keys || []
        const current = yield select(getDevicesKeys)
        if (isSameKeyOrder(current, next)) return
        yield put(setDevicesKeys(next))
      },
      { retry: true }
    )
  } catch (error) {
    log.error('Error subscribing to synced devices:', error)
  }
}

function* subscribeToDevice(key) {
  try {
    yield apiSubscribeCall(
      () => backendApi.subscribeSyncedDevice({ key }),
      function* ({ data: device }) {
        const current = yield select(getDevicesData)
        if (isSameDeviceData(current[key], device)) return
        yield put(setDeviceData({ key, data: device }))
      },
      { retry: true }
    )
  } catch (error) {
    log.error(`Error subscribing to device ${key}:`, error)
  }
}

function* handleFetchLocalPreference({ payload: { key } }) {
  try {
    const value = yield call(backendApi.getPreference, { key })
    yield put(setLocalPreference({ key, value }))
  } catch (error) {
    log.error('Error fetching local preference:', error)
  }
}

function* handleSaveLocalPreference({ payload: { key, value } }) {
  try {
    yield call(backendApi.updatePreference, { key, value })
    yield put(setLocalPreference({ key, value }))
  } catch (error) {
    log.error('Error saving local preference:', error)
  }
}

function* isIndexerSettled(localKey, isIndexer) {
  const devices = yield select(getSyncedDevices)
  const target = devices.find((device) => device.localKey === localKey)
  if (!target) return false
  return (target.isIndexer === true) === isIndexer
}

function* waitForIndexerChange(localKey, isIndexer) {
  while (true) {
    if (yield call(isIndexerSettled, localKey, isIndexer)) return true
    yield take(setDeviceData)
  }
}

function* handleSetDeviceIndexer({ payload: { key, localKey, isIndexer } }) {
  try {
    yield put(setIndexerPending({ key, step: INDEXER_TRANSFER_STEP.SUBMITTING }))
    const result = yield call(backendApi.setDeviceIndexer, { localKey, isIndexer })
    if (result?.error) {
      yield put(setIndexerError({ key, error: result.error }))
      return
    }

    if (yield call(isIndexerSettled, localKey, isIndexer)) {
      yield put(setIndexerPending({ key: null }))
      return
    }

    yield put(setIndexerPending({ key, step: INDEXER_TRANSFER_STEP.CONFIRMING }))
    const { settled } = yield race({
      settled: call(waitForIndexerChange, localKey, isIndexer),
      timeout: delay(INDEXER_TRANSFER_TIMEOUT_MS)
    })

    if (!settled) {
      yield put(setIndexerError({ key, error: INDEXER_ERROR.TRANSFER_TIMEOUT }))
      return
    }

    yield put(setIndexerPending({ key: null }))
  } catch (error) {
    yield put(setIndexerError({ key, error: error.message }))
  }
}

function* handleCheckAndInsertLocalDevice() {
  try {
    yield call(backendApi.checkAndInsertLocalDevice)
  } catch (error) {
    log.error('Error checking and inserting local device:', error)
  }
}

export function* watchSyncedDevicesSaga() {
  yield takeLatest(subscribeAllSyncedDevicesKeys, subscribeAllSyncedDevicesKeysSaga)
  yield takeLatest(subscribeAllSyncedDevices, subscribeAllSyncedDevicesSaga)
  yield takeLatest(updateSyncedDevice, handleUpdateSyncedDevice)
  yield takeLatest(deleteSyncedDevice, handleDeleteSyncedDevice)
  yield takeLatest(fetchLocalPreference, handleFetchLocalPreference)
  yield takeLatest(saveLocalPreference, handleSaveLocalPreference)
  yield takeLatest(checkAndInsertLocalDevice, handleCheckAndInsertLocalDevice)
  yield takeLatest(setDeviceIndexer, handleSetDeviceIndexer)
}
