import { all, call, fork, put, select, spawn, take, takeLatest } from 'redux-saga/effects'
import { watchLocalAiSaga } from './localAiSaga.js'
import { watchNotesSaga } from './notesSaga.js'
import { watchEditorSaga } from './editorSaga.js'
import { watchFolderSaga } from './folderSaga.js'
import { watchSyncSaga } from './syncSaga.js'
import { watchSettingsSaga } from './settingsSaga.js'
import { watchSyncedDevicesSaga } from './syncedDevicesSaga.js'
import { watchLocalPreferenceSaga, restoreSelectionsSaga } from './localPreferenceSaga.js'
import { watchBackupSaga } from './backupSaga.js'
import { watchStorageSaga } from './storageSaga.js'
import { watchActivitySaga } from './activitySaga.js'
import { watchVaultsSaga } from './vaultsSaga.js'
import { watchSearchSaga } from './searchSaga.js'
import { subscribeAllNoteKeys, subscribeAllNotes } from '../slices/notesSlice.js'
import { appReady, initApp, resyncApp, setHyperdriveServerAddress } from '../slices/uiSlice.js'
import { loadSettings, subscribeSettings } from '../slices/settingsSlice.js'
import { subscribeAllFolderKeys, subscribeAllFolders } from '../slices/foldersSlice.js'
import {
  fetchHeldMerge,
  getInviterStatus,
  subscribePairing,
  subscribeDeviceStatus
} from '../slices/syncSlice.js'
import {
  fetchLocalPreference,
  checkAndInsertLocalDevice,
  subscribeAllSyncedDevices,
  subscribeAllSyncedDevicesKeys
} from '../slices/syncedDevicesSlice.js'
import { loadVaults } from '../slices/vaultsSlice.js'
import { backendApi } from '../../backend/api.js'
import { appBoot } from '../../bootTimeline.js'

function* initSaga() {
  appBoot.mark('initApp dispatched')
  yield call(getChore)
  appBoot.mark('getChore answered')
  yield put(loadVaults())
  yield put(loadSettings())
  yield put(subscribeAllNoteKeys())
  yield put(subscribeAllNotes())
  yield put(subscribeAllFolderKeys())
  yield put(subscribeAllFolders())
  yield put(subscribePairing())
  yield put(subscribeDeviceStatus())
  yield put(subscribeSettings())
  yield put(subscribeAllSyncedDevicesKeys())
  yield put(subscribeAllSyncedDevices())
  yield put(fetchLocalPreference({ key: 'isSynced' }))
  yield put(checkAndInsertLocalDevice())
  yield put(fetchHeldMerge())
  yield fork(restoreSelectionsSaga)
}

const PAIRING_IDLE_STEPS = ['idle', 'generating', 'ready', 'searching']

function* resyncSaga() {
  yield call(getChore)
  yield put(subscribeAllNoteKeys())
  yield put(subscribeAllNotes())
  yield put(subscribeAllFolderKeys())
  yield put(subscribeAllFolders())
  yield put(subscribeDeviceStatus())
  yield put(subscribeSettings())
  yield put(subscribeAllSyncedDevicesKeys())
  yield put(subscribeAllSyncedDevices())

  const inviterStep = (yield select(getInviterStatus))?.step
  if (!inviterStep || PAIRING_IDLE_STEPS.includes(inviterStep)) {
    yield put(subscribePairing())
  }
}

function* getChore() {
  const chore = yield call(backendApi.getChore)
  if (!chore?.hyperdriveServerAddress) return
  yield put(setHyperdriveServerAddress(chore.hyperdriveServerAddress))
}

export default function* rootSaga() {
  yield spawn(watchLocalAiSaga)
  yield take(appReady)
  yield takeLatest(initApp, initSaga)
  yield takeLatest(resyncApp, resyncSaga)
  yield put(initApp())
  yield all([
    fork(watchNotesSaga),
    fork(watchEditorSaga),
    fork(watchFolderSaga),
    fork(watchSyncSaga),
    fork(watchSettingsSaga),
    fork(watchSyncedDevicesSaga),
    fork(watchLocalPreferenceSaga),
    fork(watchBackupSaga),
    fork(watchStorageSaga),
    fork(watchActivitySaga),
    fork(watchVaultsSaga),
    fork(watchSearchSaga)
  ])
}
