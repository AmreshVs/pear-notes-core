import { call, cancelled, delay, put, race, takeLatest } from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import {
  HELD_MERGE_CHANGED,
  PAIRING_INVITE_REMOVED,
  UPDATE_CLEARED,
  UPDATE_REQUIRED
} from '../../constant.js'
import * as log from '../../log.js'
import {
  clearInviteCode,
  clearStorage,
  combineHeldMerge,
  confirmPairing,
  dismissHeldMerge,
  fetchHeldMerge,
  rejectPairing,
  createInvite,
  createInviteFailure,
  createInviteSuccess,
  regenerateInvite,
  resetInvite,
  setDeviceRemoved,
  setHeldMerge,
  setInviterStatus,
  setNeedsReload,
  setVaultUpdateRequired,
  setReceiverStatus,
  subscribeDeviceStatus,
  subscribePairing,
  subscribePairUser
} from '../slices/syncSlice.js'
import {
  appResumed,
  appSuspended,
  initApp,
  refreshHyperdriveAddress,
  resyncApp,
  setHyperdriveServerAddress
} from '../slices/uiSlice.js'
import { resetLocalAi } from '../slices/localAiSlice.js'
import { wipeLocalAi } from '../services/localAiAdapter.js'
import { flushNoteSaves } from '../slices/notesSlice.js'
import { noteSavesSettled } from './notesSaga.js'
import { apiSubscribeCall } from './utils.js'
import { enterVaultInPlace } from './vaultsSaga.js'

function* handleCreateInvite(action) {
  try {
    const response = yield call(backendApi.createInvite, {
      regenerate: action.type === regenerateInvite.type
    })
    if (response) {
      yield put(createInviteSuccess(response))
    } else {
      yield put(createInviteFailure('Failed to generate invite'))
    }
  } catch (error) {
    log.error('Error in handleCreateInvite:', error)
    yield put(createInviteFailure(error.message))
  }
}

function* handleRefreshHyperdriveAddress() {
  try {
    const chore = yield call(backendApi.getChore)
    if (chore?.hyperdriveServerAddress) {
      yield put(setHyperdriveServerAddress(chore.hyperdriveServerAddress))
    }
  } catch (error) {
    log.error('Error refreshing hyperdrive address:', error)
  }
}

function* pairingSubscriptionTask() {
  try {
    yield apiSubscribeCall(backendApi.subscribePairing, function* ({ data }) {
      // `data` carries the peer public key, this device's local key and the
      // device name - log only the safe subset.
      log.debug('[pairingSubscriptionTask] Received data:', log.progress(data))
      yield put(setInviterStatus(data))
      // The vault deletes the invite the moment it is used, here or on another
      // linked device, so the QR and its countdown have to go with it.
      if (data?.step === 'done' || data?.reason === PAIRING_INVITE_REMOVED) {
        yield put(clearInviteCode())
      }
      if (data?.step === 'done') {
        yield call(backendApi.updatePreference, { key: 'isSynced', value: 'true' })
      }
      if (data?.step === 'expired') {
        yield put(resetInvite())
      }
    })
  } catch (error) {
    log.error('Error in pairingSubscriptionTask:', error)
  } finally {
    if (yield cancelled()) {
      log.debug('[pairingSubscriptionTask] Cancelled')
    }
  }
}

function* handleConfirmPairing() {
  try {
    yield call(backendApi.confirmPairing)
  } catch (error) {
    log.error('Error in handleConfirmPairing:', error)
  }
}

function* handleRejectPairing() {
  try {
    yield call(backendApi.rejectPairing)
    yield put(resetInvite())
  } catch (error) {
    log.error('Error in handleRejectPairing:', error)
  }
}

function* handleSubscribePairUser({ payload: { invite, mode, vaultName } }) {
  try {
    yield apiSubscribeCall(
      () => backendApi.subscribePairUser({ invite, mode, vaultName }),
      function* ({ data }) {
        // `data` carries the vault encryptionKey - never log the object.
        log.debug('[handleSubscribePairUser] Received data:', log.progress(data))
        yield put(setReceiverStatus(data))
        if (data?.step === 'merge_needs_confirm') yield put(setHeldMerge(data.blocking || []))
        if (data?.step === 'done') {
          yield call(backendApi.updatePreference, { key: 'isSynced', value: 'true' })
          if (mode === 'add') {
            yield call(enterVaultInPlace)
            return
          }
          yield call(handleRefreshHyperdriveAddress)
          yield put(initApp())
        }
        if (data?.step === 'error') {
          log.error('[handleSubscribePairUser] Pairing failed:', log.progress(data))
          yield call(handleRefreshHyperdriveAddress)
          yield put(initApp())
        }
        if (data?.step === 'rejected') {
          log.error(
            '[handleSubscribePairUser] Pairing rejected by other device:',
            log.progress(data)
          )
          yield call(handleRefreshHyperdriveAddress)
          yield put(initApp())
        }
        if (data?.step === 'expired') {
          log.error('[handleSubscribePairUser] Invite expired:', log.progress(data))
          yield call(handleRefreshHyperdriveAddress)
          yield put(initApp())
        }
      }
    )
  } catch (error) {
    log.error('Error in handleSubscribePairUser:', error)
  }
}

function* handleFetchHeldMerge() {
  try {
    const { held, blocking } = yield call(backendApi.getHeldMerge)
    yield put(setHeldMerge(held ? blocking : null))
  } catch (error) {
    log.error('Error in handleFetchHeldMerge:', error)
  }
}

function* handleCombineHeldMerge() {
  yield put(dismissHeldMerge())
  try {
    const done = yield call(backendApi.combineHeldMerge)
    if (!done) log.error('[handleCombineHeldMerge] Combining the held notes did not finish')
  } catch (error) {
    log.error('Error in handleCombineHeldMerge:', error)
  }
}

function* handleSubscribeDeviceStatus() {
  try {
    yield apiSubscribeCall(
      backendApi.subscribeDeviceStatus,
      function* ({ data }) {
        if (data === 'removed') {
          yield put(setDeviceRemoved(true))
        }
        if (data === 'member') {
          yield put(setDeviceRemoved(false))
        }
        if (data === 'unrecoverable') {
          log.error('[handleSubscribeDeviceStatus] Backend could not recover, reloading')
          yield put(setNeedsReload(true))
        }
        if (data === UPDATE_REQUIRED) {
          log.warn('[handleSubscribeDeviceStatus] This build is too old for the vault, read-only')
          yield put(setVaultUpdateRequired(true))
        }
        if (data === UPDATE_CLEARED) yield put(setVaultUpdateRequired(false))
        if (data === HELD_MERGE_CHANGED) yield put(fetchHeldMerge())
      },
      { retry: true }
    )
  } catch (error) {
    log.error('Error in handleSubscribeDeviceStatus:', error)
  }
}

function* handleClearStorage() {
  try {
    yield call(wipeLocalAi)
    yield put(resetLocalAi())
    yield call(backendApi.clearStorage)
    yield put(setNeedsReload(true))
  } catch (error) {
    log.error('Error in handleClearStorage:', error)
  }
}

const FLUSH_BEFORE_SUSPEND_TIMEOUT_MS = 2000

function* handleAppSuspended() {
  try {
    yield put(flushNoteSaves())
    yield race([call(noteSavesSettled), delay(FLUSH_BEFORE_SUSPEND_TIMEOUT_MS)])
    yield call(backendApi.suspendServices)
  } catch (error) {
    log.error('Error suspending network services:', error)
  }
}

function* handleAppResumed() {
  try {
    const result = yield call(backendApi.resumeServices)
    if (result?.hyperdriveServerAddress) {
      yield put(setHyperdriveServerAddress(result.hyperdriveServerAddress))
    }
  } catch (error) {
    log.error('Error resuming network services:', error)
  }
  yield put(resyncApp())
}

export function* watchSyncSaga() {
  yield takeLatest([createInvite, regenerateInvite], handleCreateInvite)
  yield takeLatest(subscribePairing, pairingSubscriptionTask)
  yield takeLatest(confirmPairing, handleConfirmPairing)
  yield takeLatest(rejectPairing, handleRejectPairing)
  yield takeLatest(subscribePairUser, handleSubscribePairUser)
  yield takeLatest(subscribeDeviceStatus, handleSubscribeDeviceStatus)
  yield takeLatest(clearStorage, handleClearStorage)
  yield takeLatest(fetchHeldMerge, handleFetchHeldMerge)
  yield takeLatest(combineHeldMerge, handleCombineHeldMerge)
  yield takeLatest(refreshHyperdriveAddress, handleRefreshHyperdriveAddress)
  yield takeLatest(appSuspended, handleAppSuspended)
  yield takeLatest(appResumed, handleAppResumed)
}
