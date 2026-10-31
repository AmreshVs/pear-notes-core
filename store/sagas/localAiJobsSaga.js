import { eventChannel } from 'redux-saga'
import {
  actionChannel,
  call,
  debounce,
  delay,
  fork,
  put,
  race,
  select,
  take,
  takeEvery,
  takeLeading
} from 'redux-saga/effects'

import { backendApi } from '../../backend/api.js'
import { HYPERDRIVE_URL_PREFIX } from '../../constant.js'
import * as log from '../../log.js'
import { getLocalAiAdapter } from '../services/localAiAdapter.js'
import {
  INDEX_BATTERY_NEW_NOTES,
  INDEX_JOB_KEY,
  INDEX_NAMESPACE,
  indexApiFrom,
  isIndexModelMissing,
  runVaultIndex
} from '../services/localAiIndex.js'
import {
  AI_JOBS_IDLE_MS,
  enqueueSchedulerProbe,
  getAiJobScheduler
} from '../services/localAiJobs.js'
import { LOCAL_AI_ERROR, LOCAL_AI_MODEL_STATUS } from '../services/localAiCatalog.js'
import { AI_JOB_ERROR, AI_JOB_PRIORITY } from '../services/localAiScheduler.js'
import {
  DUPLICATE_PAIRS_NAMESPACE,
  DUPLICATES_DISMISSED_NAMESPACE,
  updateDuplicatePairs
} from '../services/localAiSearch.js'
import { LOCAL_AI_EMBEDDING_MODEL } from '../services/localAiTiers.js'
import {
  clearVaultSimilarity,
  enableLocalAiIndex,
  rebuildLocalAiIndex,
  indexLocalAiInBackground,
  indexLocalAiNow,
  getLocalAiIndex,
  getLocalAiLoaded,
  getLocalAiState,
  getSearchByMeaningEnabled,
  localAiConditionsChanged,
  localAiUserActivity,
  runLocalAiSchedulerProbe,
  setLocalAiConfig,
  setLocalAiIndexState,
  setLocalAiLoaded,
  setLocalAiModel
} from '../slices/localAiSlice.js'
import {
  clearState,
  getNoteKeys,
  getNotesData,
  setNoteData,
  setNoteKeys,
  setNotesDataBatch,
  updateNote
} from '../slices/notesSlice.js'
import { refreshSearch } from '../slices/searchSlice.js'
import {
  appResumed,
  appSuspended,
  getHyperdriveServerAddress,
  getSearchQuery
} from '../slices/uiSlice.js'
import { vaultEntered } from '../slices/vaultsSlice.js'

const INDEX_DEBOUNCE_MS = 15_000
const EMBEDDING_NAME = LOCAL_AI_EMBEDDING_MODEL.model
const selectEmbeddingStatus = (state) => getLocalAiState(state).models?.[EMBEDDING_NAME]?.status
const INDEX_SKIP_CODES = new Set([AI_JOB_ERROR.CANCELLED, AI_JOB_ERROR.DESTROYED])
let vaultEpoch = 0
let indexPromise = null
let rebuildIndex = false
let indexHostReady = false

const INDEX_CLEAR_NAMESPACES = [
  INDEX_NAMESPACE.META,
  INDEX_NAMESPACE.VECTORS,
  INDEX_NAMESPACE.CHUNKS,
  DUPLICATE_PAIRS_NAMESPACE,
  DUPLICATES_DISMISSED_NAMESPACE
]

const selectTotalMemory = (state) => state.localAi?.device?.totalMemoryBytes || 0

function* syncMemory() {
  getAiJobScheduler().setTotalMemory(yield select(selectTotalMemory))
}

function* handleConditions({ payload }) {
  yield call(syncMemory)
  getAiJobScheduler().setConditions(payload || {})
}

// Idle means no note edit or reported user activity for AI_JOBS_IDLE_MS.
function* watchIdle() {
  const scheduler = getAiJobScheduler()
  while (true) {
    scheduler.setConditions({ idle: false })
    const { activity } = yield race({
      activity: take([localAiUserActivity, updateNote]),
      quiet: delay(AI_JOBS_IDLE_MS)
    })
    if (activity) continue
    scheduler.setConditions({ idle: true })
    yield take([localAiUserActivity, updateNote])
  }
}

function* handleSuspended() {
  const settled = yield call(() => getAiJobScheduler().suspend())
  if (!settled) log.warn('[ai-jobs] a job was still running at suspend')
}

function* handleResumed() {
  yield call(() => getAiJobScheduler().resume())
}

function* handleProbe() {
  yield call(syncMemory)
  enqueueSchedulerProbe().catch((error) => log.warn('[ai-jobs] probe ended', error?.code ?? error))
}

const selectIndexNotes = (state) => {
  const data = getNotesData(state)
  return getNoteKeys(state).map((key) => ({ key, value: data[key] }))
}

const indexProgressChannel = () =>
  eventChannel((emit) =>
    getAiJobScheduler().subscribe(({ running, queued }) => {
      if (running?.key === INDEX_JOB_KEY) {
        emit({ status: 'running', ...(running.progress ?? {}) })
      } else if (queued.some((job) => job.key === INDEX_JOB_KEY)) emit({ status: 'waiting' })
    })
  )

function* watchIndexProgress() {
  const channel = yield call(indexProgressChannel)
  while (true) {
    const next = yield take(channel)
    const current = yield select(getLocalAiIndex)
    if (Object.keys(next).some((key) => current[key] !== next[key])) {
      yield put(setLocalAiIndexState(next))
    }
  }
}

function* finishIndex(promise) {
  try {
    const stats = yield call(() => promise)
    if (stats.stopped) {
      if (stats.stopped === LOCAL_AI_ERROR.MODEL_MISSING) {
        yield put(setLocalAiIndexState({ status: 'model-missing', error: stats.stopped }))
      }
      return
    }
    if (stats.duplicatesChecked) {
      log.info(
        `[ai-duplicates] checked ${stats.duplicatesChecked} notes in ${stats.duplicatesMs} ms`
      )
    }
    if (stats.notes || stats.removed || stats.rebuilt) {
      const steadyMs = stats.embedMs - stats.firstEmbedMs
      const steady = steadyMs > 0 ? ((stats.chunks - stats.firstChunks) / steadyMs) * 1000 : 0
      log.info(
        `[ai-index] ${stats.notes} notes, ${stats.chunks} chunks, ${stats.removed} removed, ` +
          `${stats.skipped} skipped in ${(stats.ms / 1000).toFixed(1)}s ` +
          `(first batch incl. model load ${(stats.firstEmbedMs / 1000).toFixed(1)}s for ` +
          `${stats.firstChunks} chunks, then ${steady.toFixed(1)} chunks/s, ${stats.total} indexable` +
          `${stats.deferred ? `, ${stats.deferred} wait for charging` : ''})`
      )
    }
    const at = Date.now()
    const changed = !!(stats.notes || stats.removed || stats.rebuilt || stats.duplicatesChecked)
    yield put(
      setLocalAiIndexState({
        status: 'idle',
        error: null,
        deferred: stats.deferred || 0,
        lastRun: { ...stats, at },
        ...(changed ? { changedAt: at } : {})
      })
    )
    if (changed && ((yield select(getSearchQuery)) || '').trim()) yield put(refreshSearch())
    if (stats.deferred) yield call(enqueueIndexJob, true)
  } catch (error) {
    if (INDEX_SKIP_CODES.has(error?.code)) return
    log.warn('[ai-index] failed', error?.code ?? error?.message ?? error)
    yield put(setLocalAiIndexState({ status: 'failed', error: error?.code ?? 'failed' }))
  }
}

function* enqueueIndex() {
  yield call(enqueueIndexJob, false)
}

// A phone on battery indexes edits and new notes only; the backlog waits for charging.
function* enqueueIndexJob(requiresCharging) {
  const { enabled, waitForCharging } = yield select(getLocalAiIndex)
  const embed = getLocalAiAdapter()?.embedTexts
  if (!enabled || !embed) return
  if ((yield select(selectEmbeddingStatus)) !== LOCAL_AI_MODEL_STATUS.READY) return
  const notes = yield select(selectIndexNotes)
  if (!notes.length) return
  const readAttachments = getLocalAiAdapter()?.attachmentText
  const serverAddress = yield select(getHyperdriveServerAddress)
  const resolveUrl = (url) =>
    serverAddress && url?.startsWith(HYPERDRIVE_URL_PREFIX)
      ? url.replace(HYPERDRIVE_URL_PREFIX, serverAddress.replace(/\/$/, ''))
      : null
  const epoch = vaultEpoch
  const promise = getAiJobScheduler().enqueue({
    key: INDEX_JOB_KEY,
    label: 'Vault index',
    priority: AI_JOB_PRIORITY.INDEXING,
    models: [EMBEDDING_NAME],
    requiresCharging,
    run: async ({ signal, progress }) => {
      const isCurrent = () => epoch === vaultEpoch
      const checkpoint = () => {
        if (signal.aborted)
          throw signal.reason ?? Object.assign(new Error('aborted'), { code: 'aborted' })
        if (!isCurrent()) throw Object.assign(new Error('vault changed'), { code: 'VAULT_CHANGED' })
      }
      try {
        // Without the format record, the run wipes the index and embeds every note again.
        if (
          rebuildIndex &&
          (await backendApi.derivedClear({ namespace: INDEX_NAMESPACE.META }))?.ok
        ) {
          rebuildIndex = false
        }
        const onBattery = waitForCharging && !getAiJobScheduler().snapshot().conditions.charging
        const stats = await runVaultIndex({
          api: indexApiFrom(backendApi),
          embed,
          notes,
          signal,
          progress,
          isCurrent,
          newNoteLimit: onBattery ? INDEX_BATTERY_NEW_NOTES : Infinity,
          attachmentText: readAttachments ? (value) => readAttachments(value, { resolveUrl }) : null
        })
        const duplicatesStarted = Date.now()
        const duplicatesChecked = await updateDuplicatePairs({ api: backendApi, checkpoint })
        if (duplicatesChecked === null) log.warn('[ai-duplicates] derived store unavailable')
        return {
          ...stats,
          duplicatesChecked: duplicatesChecked || 0,
          duplicatesMs: Date.now() - duplicatesStarted
        }
      } catch (error) {
        // Retrying cannot help these, and the scheduler retries every background failure.
        if (error?.code === 'VAULT_CHANGED' || isIndexModelMissing(error))
          return { stopped: error.code }
        throw error
      }
    }
  })
  if (promise === indexPromise) return
  indexPromise = promise
  yield fork(finishIndex, promise)
}

// The user asked to index the backlog on battery: this session stops waiting for charging.
function* handleIndexNow() {
  yield put(setLocalAiIndexState({ waitForCharging: false }))
  yield call(enqueueIndexJob, false)
}

function* handleVaultChanged() {
  vaultEpoch += 1
  getAiJobScheduler().cancel(INDEX_JOB_KEY)
  yield put(setLocalAiIndexState({ status: 'idle', done: 0, total: 0, deferred: 0, error: null }))
}

function* handleIndexEnabled({ payload }) {
  if (payload?.rebuild) rebuildIndex = true
  indexHostReady = true
  yield put(setLocalAiIndexState({ waitForCharging: payload?.waitForCharging === true }))
  yield call(syncMemory)
}

function* watchIndexEnabled() {
  const channel = yield actionChannel([enableLocalAiIndex, setLocalAiConfig, setLocalAiLoaded])
  while (true) {
    const action = yield take(channel)
    if (action.type === enableLocalAiIndex.type) yield call(handleIndexEnabled, action)
    yield call(syncIndexEnabled)
  }
}

function* syncIndexEnabled() {
  if (!indexHostReady || !(yield select(getLocalAiLoaded))) return
  const enabled = yield select(getSearchByMeaningEnabled)
  if ((yield select(getLocalAiIndex)).enabled === enabled) return
  yield put(setLocalAiIndexState({ enabled }))
  if (enabled) yield call(enqueueIndex)
  else yield call(clearIndex)
}

function* handleRebuildIndex() {
  if (!(yield select(getLocalAiIndex)).enabled) return
  yield call(clearIndex)
  yield call(enqueueIndex)
}

function* clearIndex() {
  vaultEpoch += 1
  getAiJobScheduler().cancel(INDEX_JOB_KEY)
  if (indexPromise) yield call(() => indexPromise.catch(() => {}))
  for (const namespace of INDEX_CLEAR_NAMESPACES) {
    const response = yield call(backendApi.derivedClear, { namespace })
    if (!response?.ok) log.warn('[ai-index] could not clear', namespace)
  }
  yield put(
    setLocalAiIndexState({
      status: 'idle',
      done: 0,
      total: 0,
      deferred: 0,
      error: null,
      lastRun: null,
      changedAt: Date.now()
    })
  )
  yield put(clearVaultSimilarity())
  if (((yield select(getSearchQuery)) || '').trim()) yield put(refreshSearch())
}

function* handleModelChanged({ payload }) {
  if (payload?.name === EMBEDDING_NAME && payload.status === LOCAL_AI_MODEL_STATUS.READY) {
    yield call(enqueueIndex)
  }
}

export function* watchLocalAiJobs() {
  yield fork(watchIdle)
  yield takeEvery(localAiConditionsChanged, handleConditions)
  yield takeEvery(appSuspended, handleSuspended)
  yield takeEvery(appResumed, handleResumed)
  yield takeEvery(runLocalAiSchedulerProbe, handleProbe)
  yield fork(watchIndexProgress)
  yield fork(watchIndexEnabled)
  yield takeEvery([vaultEntered, clearState], handleVaultChanged)
  yield takeEvery(setLocalAiModel, handleModelChanged)
  yield takeLeading(rebuildLocalAiIndex, handleRebuildIndex)
  yield takeLeading(indexLocalAiNow, handleIndexNow)
  yield takeLeading(indexLocalAiInBackground, enqueueIndex)
  yield debounce(
    INDEX_DEBOUNCE_MS,
    [setNoteKeys, setNoteData, setNotesDataBatch, vaultEntered],
    enqueueIndex
  )
}
