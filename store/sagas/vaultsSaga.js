import { call, delay, put, race, select, takeLatest } from 'redux-saga/effects'

import { backendApi } from '../../backend/api.js'
import { VAULT_ERROR, isMultiVaultEnabled } from '../../constant.js'
import * as log from '../../log.js'
import { clearVaultState, initApp } from '../slices/uiSlice.js'
import {
  createVault,
  getVaultPending,
  loadVaults,
  moveToVault,
  removeVault,
  renameVault,
  setForceRemovalId,
  setVaultError,
  setVaultPending,
  setVaults,
  switchVault,
  vaultEntered
} from '../slices/vaultsSlice.js'
import { flushNoteSaves } from '../slices/notesSlice.js'
import { noteSavesSettled } from './notesSaga.js'
import { nextVaultEpoch } from './utils.js'

// Lets an editor save that was just typed reach the backend before the vault closes.
const SETTLE_BEFORE_SWITCH_MS = 300
const FLUSH_BEFORE_SWITCH_TIMEOUT_MS = 5000

function* loadVaultsSaga() {
  if (!isMultiVaultEnabled()) return
  try {
    const list = yield call(backendApi.listVaults)
    yield put(setVaults(list))
  } catch (error) {
    log.error('loadVaultsSaga', error)
  }
}

// init's takeLatest subscriptions cancel the old vault's streams and their per-item forks.
export function* enterVaultInPlace() {
  nextVaultEpoch()
  yield put(clearVaultState())
  yield put(initApp())
  yield put(vaultEntered())
}

function* runVaultChange(action, id, request, isHandledFailure = () => false) {
  if (!isMultiVaultEnabled()) return
  if (yield select(getVaultPending)) return
  yield put(setVaultPending({ action, id }))
  try {
    if (action !== 'rename') {
      yield delay(SETTLE_BEFORE_SWITCH_MS)
      yield put(flushNoteSaves())
      yield race([call(noteSavesSettled), delay(FLUSH_BEFORE_SWITCH_TIMEOUT_MS)])
    }
    const result = yield call(request)
    if (result?.done !== true) {
      if (isHandledFailure(result)) yield put(setVaultPending(null))
      else yield put(setVaultError(result?.code || VAULT_ERROR.OPEN_FAILED))
      yield call(loadVaultsSaga)
      return result
    }
    if (action === 'rename') {
      yield call(loadVaultsSaga)
      yield put(setVaultPending(null))
      return result
    }
    yield call(loadVaultsSaga)
    yield call(enterVaultInPlace)
    return result
  } catch (error) {
    log.error(`vault ${action} failed`, error)
    yield put(setVaultError(error?.code || VAULT_ERROR.OPEN_FAILED))
    return null
  }
}

function* createVaultSaga({ payload }) {
  yield call(runVaultChange, 'create', null, () =>
    backendApi.createVault({ name: payload?.name || '' })
  )
}

function* switchVaultSaga({ payload }) {
  const id = payload?.id
  if (!id) return
  yield call(runVaultChange, 'switch', id, () => backendApi.switchVault({ id }))
}

function* renameVaultSaga({ payload }) {
  const id = payload?.id
  if (!id) return
  yield call(runVaultChange, 'rename', id, () =>
    backendApi.renameVault({ id, name: payload?.name || '' })
  )
}

function* removeVaultSaga({ payload }) {
  const id = payload?.id
  if (!id) return
  const force = !!payload?.force
  yield put(setForceRemovalId(null))
  const result = yield call(
    runVaultChange,
    'remove',
    id,
    () => backendApi.removeVault({ id, force }),
    (failure) => !force && failure?.code === VAULT_ERROR.SYNC_LEADER
  )
  if (!force && result?.code === VAULT_ERROR.SYNC_LEADER) yield put(setForceRemovalId(id))
  if (result?.done === true && !result.replicated && result.left) {
    log.warn('vault removed before a sync leader confirmed the departure')
  }
}

function* moveToVaultSaga({ payload }) {
  const targetId = payload?.targetId
  if (!targetId) return
  yield call(runVaultChange, 'move', targetId, () =>
    backendApi.moveToVault({
      targetId,
      noteKeys: payload?.noteKeys || [],
      folderKeys: payload?.folderKeys || []
    })
  )
}

export function* watchVaultsSaga() {
  yield takeLatest(loadVaults, loadVaultsSaga)
  yield takeLatest(createVault, createVaultSaga)
  yield takeLatest(switchVault, switchVaultSaga)
  yield takeLatest(renameVault, renameVaultSaga)
  yield takeLatest(removeVault, removeVaultSaga)
  yield takeLatest(moveToVault, moveToVaultSaga)
}
