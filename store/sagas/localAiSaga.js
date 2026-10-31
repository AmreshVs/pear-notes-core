import { buffers, eventChannel } from 'redux-saga'
import {
  actionChannel,
  call,
  cancel,
  delay,
  fork,
  put,
  race,
  select,
  spawn,
  take,
  takeEvery,
  takeLatest,
  takeMaybe
} from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import * as log from '../../log.js'
import { getLocalAiAdapter } from '../services/localAiAdapter.js'
import { setAiOffloadUseMac } from '../services/localAiOffload.js'
import { watchAskCache } from './localAiAskCacheSaga.js'
import { watchLocalAiJobs } from './localAiJobsSaga.js'
import { watchLocalAiSimilarity } from './localAiSimilaritySaga.js'
import { watchNoteSuggestions } from './localAiSuggestionsSaga.js'
import {
  LOCAL_AI_CONFIG_KEY,
  LOCAL_AI_DEVICE_STATUS,
  LOCAL_AI_ERROR,
  LOCAL_AI_FEATURE_IDS,
  LOCAL_AI_MODEL_STATUS,
  LOCAL_AI_NETWORK,
  LOCAL_AI_NOTICE,
  LOCAL_AI_REGISTRY_MODELS,
  canRunAnyTier,
  configureLocalAiDevice,
  getFeatureRegistryNames,
  getFreeSpaceShortfall,
  isOnDemandFeature,
  parseLocalAiConfig,
  serializeLocalAiConfig,
  getModelDownloadBytes
} from '../services/localAiCatalog.js'
import { TRANSLATION_ALL_LANGUAGES } from '../services/localAiLanguage.js'
import { appReady } from '../slices/uiSlice.js'
import {
  cancelLocalAiFeatureDownload,
  computeMissingNames,
  computeReleasableNames,
  deleteAllLocalAiModels,
  deleteLocalAiModel,
  disableLocalAiFeature,
  downloadLocalAiModelNow,
  downloadLocalAiModels,
  enableLocalAiFeature,
  getLocalAiConfig,
  getLocalAiDevice,
  getLocalAiModels,
  getLocalAiNetwork,
  getLocalAiState,
  holdLocalAiDownload,
  initLocalAi,
  localAiAppResumed,
  localAiNetworkChanged,
  pauseLocalAiDownload,
  queueLocalAiDownload,
  removeLocalAiModel,
  resumeLocalAiDownload,
  setLocalAiConfig,
  setLocalAiDevice,
  setLocalAiFeatureLanguage,
  setLocalAiFeatureModel,
  setLocalAiFeatureTier,
  setLocalAiOffload,
  setLocalAiOffloadStatus,
  setLocalAiLoaded,
  setLocalAiModel,
  setLocalAiModelsProgress,
  setLocalAiNetwork,
  setLocalAiNotice,
  setLocalAiTranslationTarget,
  setLocalAiWifiOnly
} from '../slices/localAiSlice.js'

const PROGRESS_FLUSH_MS = 80
const HOLD_SETTLE_TIMEOUT_MS = 3000
const DOWNLOAD_OUTCOME = { DONE: 'done', HELD: 'held', FAILED: 'failed' }

const downloadOverrides = new Set()

const cloneConfig = (config) => JSON.parse(JSON.stringify(config))

const expectedBytes = (name, model) =>
  model?.totalBytes || getModelDownloadBytes(name) || 0

function* persistConfig() {
  const config = yield select(getLocalAiConfig)
  try {
    yield call(backendApi.updatePreference, {
      key: LOCAL_AI_CONFIG_KEY,
      value: serializeLocalAiConfig(config)
    })
  } catch (error) {
    log.error('localAi config save failed', error)
  }
}

function* updateConfig(mutate) {
  const next = cloneConfig(yield select(getLocalAiConfig))
  mutate(next)
  yield put(setLocalAiConfig(next))
  yield call(persistConfig)
  return next
}

function* canDownloadNow(name) {
  if (downloadOverrides.has(name)) return true
  const config = yield select(getLocalAiConfig)
  if (!config.wifiOnly) return true
  const network = yield select(getLocalAiNetwork)
  return (
    network !== LOCAL_AI_NETWORK.CELLULAR &&
    network !== LOCAL_AI_NETWORK.METERED &&
    network !== LOCAL_AI_NETWORK.OFFLINE
  )
}

function* queueName(name) {
  const model = (yield select(getLocalAiModels))[name]
  const status = model?.status
  if (
    status === LOCAL_AI_MODEL_STATUS.QUEUED ||
    status === LOCAL_AI_MODEL_STATUS.DOWNLOADING ||
    status === LOCAL_AI_MODEL_STATUS.READY
  ) {
    return
  }
  yield put(
    setLocalAiModel({
      name,
      status: LOCAL_AI_MODEL_STATUS.QUEUED,
      downloadedBytes: model?.downloadedBytes ?? 0,
      totalBytes: expectedBytes(name, model),
      error: null
    })
  )
  yield put(queueLocalAiDownload({ name }))
}

function* queueMissing(feature) {
  const state = yield select(getLocalAiState)
  if (!canRunAnyTier(feature, state.config.features[feature], state.device?.totalMemoryBytes))
    return
  for (const name of computeMissingNames(state, feature)) {
    yield call(queueName, name)
  }
}

function* holdName(name, status) {
  const model = (yield select(getLocalAiModels))[name]
  if (!model || model.status === LOCAL_AI_MODEL_STATUS.READY) return
  if (model.status === LOCAL_AI_MODEL_STATUS.DOWNLOADING) {
    yield put(holdLocalAiDownload({ name, status, discard: false }))
    return
  }
  yield put(setLocalAiModel({ name, status }))
}

function* runDownload(adapter, name) {
  let notify = null
  const handle = adapter.download(name, {
    onProgress: (progress) => notify?.({ type: 'progress', ...progress })
  })
  const channel = eventChannel((emit) => {
    notify = emit
    Promise.resolve(handle?.done).then(
      (result) => notify?.({ type: 'done', bytes: result?.bytes ?? 0 }),
      (error) => notify?.({ type: 'error', error })
    )
    return () => {
      notify = null
    }
  }, buffers.sliding(16))

  let lastFlush = 0
  try {
    while (true) {
      const { event, hold } = yield race({
        event: takeMaybe(channel),
        hold: take(
          (action) => action.type === holdLocalAiDownload.type && action.payload?.name === name
        )
      })
      if (hold) {
        try {
          yield call([adapter, adapter.cancel], handle?.requestId, {
            discard: !!hold.payload.discard
          })
        } catch (error) {
          log.warn('localAi cancel failed', error)
        }
        return {
          outcome: DOWNLOAD_OUTCOME.HELD,
          status: hold.payload.status,
          discard: !!hold.payload.discard
        }
      }
      if (!event || event.type === 'error') {
        return { outcome: DOWNLOAD_OUTCOME.FAILED, error: event?.error ?? null }
      }
      if (event.type === 'done') return { outcome: DOWNLOAD_OUTCOME.DONE, bytes: event.bytes }
      const now = Date.now()
      if (now - lastFlush >= PROGRESS_FLUSH_MS) {
        lastFlush = now
        yield put(
          setLocalAiModelsProgress({
            [name]: {
              downloadedBytes: event.downloadedBytes ?? 0,
              totalBytes: event.totalBytes ?? 0
            }
          })
        )
      }
    }
  } finally {
    channel.close()
  }
}

function* processDownload(name) {
  const adapter = getLocalAiAdapter()
  if (!adapter) return
  const model = (yield select(getLocalAiModels))[name]
  if (model?.status !== LOCAL_AI_MODEL_STATUS.QUEUED) return
  if (!(yield call(canDownloadNow, name))) {
    yield put(setLocalAiModel({ name, status: LOCAL_AI_MODEL_STATUS.WAITING_NETWORK }))
    return
  }
  yield put(setLocalAiModel({ name, status: LOCAL_AI_MODEL_STATUS.DOWNLOADING, error: null }))

  let result
  try {
    result = yield call(runDownload, adapter, name)
  } catch (error) {
    result = { outcome: DOWNLOAD_OUTCOME.FAILED, error }
  }

  if (result.outcome === DOWNLOAD_OUTCOME.DONE) {
    downloadOverrides.delete(name)
    const bytes = result.bytes || expectedBytes(name, model)
    yield put(
      setLocalAiModel({
        name,
        status: LOCAL_AI_MODEL_STATUS.READY,
        downloadedBytes: bytes,
        totalBytes: bytes,
        error: null
      })
    )
    yield call(updateConfig, (config) => {
      config.downloaded[name] = { bytes, downloadedAt: Date.now() }
    })
    return
  }

  if (result.outcome === DOWNLOAD_OUTCOME.HELD) {
    if (result.discard) yield put(removeLocalAiModel(name))
    else yield put(setLocalAiModel({ name, status: result.status }))
    return
  }

  const code = result.error?.code || LOCAL_AI_ERROR.DOWNLOAD_FAILED
  yield put(setLocalAiModel({ name, status: LOCAL_AI_MODEL_STATUS.FAILED, error: code }))
  if (code === LOCAL_AI_ERROR.INSUFFICIENT_SPACE) {
    yield put(setLocalAiNotice({ type: LOCAL_AI_NOTICE.INSUFFICIENT_SPACE, name }))
  }
}

function* downloadWorker() {
  const queue = yield actionChannel(queueLocalAiDownload.type, buffers.expanding(16))
  while (true) {
    const action = yield take(queue)
    try {
      yield call(processDownload, action.payload.name)
    } catch (error) {
      log.error('localAi download worker failed', error)
    }
  }
}

function* deleteNames(names) {
  const adapter = getLocalAiAdapter()
  for (const name of names) {
    downloadOverrides.delete(name)
    const model = (yield select(getLocalAiModels))[name]
    if (model?.status === LOCAL_AI_MODEL_STATUS.DOWNLOADING) {
      yield put(holdLocalAiDownload({ name, status: LOCAL_AI_MODEL_STATUS.NONE, discard: true }))
      yield race({
        removed: take(
          (action) => action.type === removeLocalAiModel.type && action.payload === name
        ),
        timeout: delay(HOLD_SETTLE_TIMEOUT_MS)
      })
    }
    try {
      if (adapter) yield call([adapter, adapter.deleteModel], name)
    } catch (error) {
      log.warn('localAi model delete failed', error)
    }
    yield put(removeLocalAiModel(name))
  }
  yield call(updateConfig, (config) => {
    for (const name of names) delete config.downloaded[name]
  })
}

function* handleInit() {
  const adapter = getLocalAiAdapter()
  if (!adapter) return
  const device = yield call([adapter, adapter.getDeviceSupport])
  configureLocalAiDevice(device)
  yield put(setLocalAiDevice(device))

  let raw = null
  try {
    raw = yield call(backendApi.getPreference, { key: LOCAL_AI_CONFIG_KEY })
  } catch (error) {
    log.warn('localAi config read failed', error)
  }
  const config = parseLocalAiConfig(raw)
  const models = {}
  for (const [name, entry] of Object.entries(config.downloaded)) {
    models[name] = {
      status: LOCAL_AI_MODEL_STATUS.READY,
      downloadedBytes: entry.bytes,
      totalBytes: entry.bytes,
      error: null
    }
  }
  let incomplete = []
  if (adapter.findIncompleteModels) {
    try {
      incomplete = yield call(
        [adapter, adapter.findIncompleteModels],
        Object.keys(config.downloaded)
      )
    } catch (error) {
      log.warn('localAi model check failed', error)
    }
  }
  for (const name of incomplete) {
    log.warn(`[ai-model] ${name} is missing files, marking it not downloaded`)
    delete models[name]
  }
  yield put(setLocalAiLoaded({ config, models }))
  if (incomplete.length) {
    yield call(updateConfig, (next) => {
      for (const name of incomplete) delete next.downloaded[name]
    })
  }
  yield call(applyOffload, config)

  if (adapter.getNetworkKind) {
    yield put(setLocalAiNetwork(yield call([adapter, adapter.getNetworkKind])))
  }
  if (device?.status === LOCAL_AI_DEVICE_STATUS.UNSUPPORTED) return
  for (const feature of LOCAL_AI_FEATURE_IDS) {
    if (config.features[feature]?.enabled) yield call(queueMissing, feature)
  }
}

function* handleEnable({ payload: { feature } }) {
  const adapter = getLocalAiAdapter()
  if (!adapter) return
  const device = yield select(getLocalAiDevice)
  if (device.status === LOCAL_AI_DEVICE_STATUS.UNSUPPORTED) return

  const state = yield select(getLocalAiState)
  if (!canRunAnyTier(feature, state.config.features[feature], device.totalMemoryBytes)) return
  const nextConfig = cloneConfig(state.config)
  nextConfig.features[feature].enabled = true
  const missing = computeMissingNames({ config: nextConfig, models: state.models }, feature)

  if (missing.length && adapter.getDiskSpace) {
    const disk = yield call([adapter, adapter.getDiskSpace])
    const requiredBytes = missing.reduce(
      (sum, name) =>
        sum +
        Math.max(
          0,
          expectedBytes(name, state.models[name]) - (state.models[name]?.downloadedBytes ?? 0)
        ),
      0
    )
    const shortBytes = getFreeSpaceShortfall(disk, requiredBytes)
    if (shortBytes > 0) {
      yield put(
        setLocalAiNotice({
          type: LOCAL_AI_NOTICE.INSUFFICIENT_SPACE,
          feature,
          requiredBytes,
          shortBytes
        })
      )
      return
    }
  }

  yield call(updateConfig, (config) => {
    config.features[feature].enabled = true
  })
  for (const name of missing) yield call(queueName, name)
}

function* handleDisable({ payload: { feature, deleteModels } }) {
  const releasable = computeReleasableNames(yield select(getLocalAiState), feature)
  yield call(updateConfig, (config) => {
    config.features[feature].enabled = false
  })
  if (deleteModels) {
    yield call(deleteNames, releasable)
    return
  }
  for (const name of releasable) {
    yield call(holdName, name, LOCAL_AI_MODEL_STATUS.PAUSED)
  }
}

function* handleCancelFeatureDownload({ payload: { feature } }) {
  const state = yield select(getLocalAiState)
  const partial = computeReleasableNames(state, feature).filter(
    (name) => state.models[name]?.status !== LOCAL_AI_MODEL_STATUS.READY
  )
  yield call(updateConfig, (config) => {
    config.features[feature].enabled = false
  })
  yield call(deleteNames, partial)
}

function* handleSetTier({ payload: { feature, tier } }) {
  // Quality is the user's call even when the device is under the memory bar
  // for it — the settings row says so plainly. Refusing here silently ignored
  // the tap, which read as the option being broken rather than risky.
  const config = yield call(updateConfig, (next) => {
    next.features[feature].tier = tier
  })
  if (config.features[feature].enabled) yield call(queueMissing, feature)
}

const OFFLOAD_STATUS_RETRY_MS = 2000
let offloadStatusTask = null

function offloadStatusChannel() {
  return eventChannel((emit) => {
    let stopped = false
    let stream = null
    ;(async () => {
      while (!stopped) {
        try {
          stream = backendApi.aiOffloadStatus()
          for await (const status of stream) {
            emit({ available: status?.available === true, deviceTitle: status?.deviceTitle ?? '' })
          }
        } catch (error) {
          log.debug('ai offload status stream ended', error?.message)
        }
        if (!stopped) await new Promise((resolve) => setTimeout(resolve, OFFLOAD_STATUS_RETRY_MS))
      }
    })()
    return () => {
      stopped = true
      try {
        stream?.destroy?.()
      } catch (error) {
        log.debug('ai offload status close', error?.message)
      }
    }
  }, buffers.sliding(1))
}

function* watchOffloadStatus() {
  const channel = offloadStatusChannel()
  try {
    while (true) yield put(setLocalAiOffloadStatus(yield take(channel)))
  } finally {
    channel.close()
    yield put(setLocalAiOffloadStatus({ available: false, deviceTitle: '' }))
  }
}

function* applyOffload(config) {
  const useMac = config.offload?.useMac === true
  setAiOffloadUseMac(useMac)
  if (useMac && !offloadStatusTask?.isRunning()) offloadStatusTask = yield spawn(watchOffloadStatus)
  if (!useMac && offloadStatusTask?.isRunning()) {
    yield cancel(offloadStatusTask)
    offloadStatusTask = null
  }
}

function* handleSetOffload({ payload }) {
  const config = yield call(updateConfig, (next) => {
    if (typeof payload?.useMac === 'boolean') next.offload.useMac = payload.useMac
    if (typeof payload?.serve === 'boolean') next.offload.serve = payload.serve
  })
  yield call(applyOffload, config)
}

function* handleSetModel({ payload: { feature, model } }) {
  const config = yield call(updateConfig, (next) => {
    next.features[feature].model = model ?? null
  })
  if (config.features[feature].enabled) yield call(queueMissing, feature)
}

function* handleSetLanguage({ payload: { feature, language } }) {
  yield call(updateConfig, (config) => {
    config.features[feature].language = language
  })
  const config = yield select(getLocalAiConfig)
  if (config.features[feature].enabled) yield call(queueMissing, feature)
}

function* reconcileNetwork() {
  const models = yield select(getLocalAiModels)
  for (const [name, model] of Object.entries(models)) {
    const allowed = yield call(canDownloadNow, name)
    if (allowed && model.status === LOCAL_AI_MODEL_STATUS.WAITING_NETWORK) {
      yield call(queueName, name)
    } else if (
      !allowed &&
      (model.status === LOCAL_AI_MODEL_STATUS.DOWNLOADING ||
        model.status === LOCAL_AI_MODEL_STATUS.QUEUED)
    ) {
      yield call(holdName, name, LOCAL_AI_MODEL_STATUS.WAITING_NETWORK)
    }
  }
}

function* handleSetWifiOnly({ payload }) {
  yield call(updateConfig, (config) => {
    config.wifiOnly = !!payload
  })
  yield call(reconcileNetwork)
}

function* handleNetworkChanged({ payload }) {
  yield put(setLocalAiNetwork(payload))
  yield call(reconcileNetwork)
}

function* handlePause({ payload: { name } }) {
  yield call(holdName, name, LOCAL_AI_MODEL_STATUS.PAUSED)
}

function* handleResume({ payload: { name } }) {
  yield call(queueName, name)
}

function* handleDownloadNow({ payload: { name } }) {
  downloadOverrides.add(name)
  yield call(queueName, name)
}

function* handleDownloadModels({ payload: { names } }) {
  const adapter = getLocalAiAdapter()
  if (!adapter) return
  const device = yield select(getLocalAiDevice)
  if (device.status === LOCAL_AI_DEVICE_STATUS.UNSUPPORTED) return
  const state = yield select(getLocalAiState)
  const missing = [...new Set(names ?? [])].filter(
    (name) =>
      LOCAL_AI_REGISTRY_MODELS[name] && state.models[name]?.status !== LOCAL_AI_MODEL_STATUS.READY
  )
  if (missing.length === 0) return
  for (const name of missing) {
    if (state.models[name]?.status === LOCAL_AI_MODEL_STATUS.FAILED) {
      yield put(setLocalAiModel({ name, status: LOCAL_AI_MODEL_STATUS.NONE, error: null }))
    }
  }
  if (adapter.getDiskSpace) {
    const disk = yield call([adapter, adapter.getDiskSpace])
    const requiredBytes = missing.reduce(
      (sum, name) =>
        sum +
        Math.max(
          0,
          expectedBytes(name, state.models[name]) - (state.models[name]?.downloadedBytes ?? 0)
        ),
      0
    )
    const shortBytes = getFreeSpaceShortfall(disk, requiredBytes)
    if (shortBytes > 0) {
      yield put(
        setLocalAiNotice({
          type: LOCAL_AI_NOTICE.INSUFFICIENT_SPACE,
          names: missing,
          requiredBytes,
          shortBytes
        })
      )
      return
    }
  }
  for (const name of missing) {
    yield call(queueName, name)
  }
}

function* handleSetTranslationTarget({ payload }) {
  if (!TRANSLATION_ALL_LANGUAGES.includes(payload)) return
  const config = yield select(getLocalAiConfig)
  if (config.translation?.lastTarget === payload) return
  yield call(updateConfig, (next) => {
    next.translation = { ...(next.translation ?? {}), lastTarget: payload }
  })
}

function* handleDeleteModel({ payload: { name } }) {
  const config = yield select(getLocalAiConfig)
  const users = LOCAL_AI_FEATURE_IDS.filter(
    (feature) =>
      !isOnDemandFeature(feature) &&
      getFeatureRegistryNames(feature, config.features[feature]).includes(name)
  )
  if (users.length) {
    yield call(updateConfig, (next) => {
      for (const feature of users) next.features[feature].enabled = false
    })
  }
  yield call(deleteNames, [name])
}

function* handleDeleteAll() {
  const state = yield select(getLocalAiState)
  const names = [
    ...new Set([...Object.keys(state.models), ...Object.keys(state.config.downloaded)])
  ]
  yield call(updateConfig, (config) => {
    for (const feature of LOCAL_AI_FEATURE_IDS) {
      if (config.features[feature]) config.features[feature].enabled = false
    }
  })
  yield call(deleteNames, names)
}

function* handleAppResumed() {
  const models = yield select(getLocalAiModels)
  for (const [name, model] of Object.entries(models)) {
    if (
      model.status === LOCAL_AI_MODEL_STATUS.FAILED &&
      model.error === LOCAL_AI_ERROR.INTERRUPTED
    ) {
      yield call(queueName, name)
    }
  }
}

const guarded = (label, worker) =>
  function* guardedWorker(action) {
    try {
      yield call(worker, action)
    } catch (error) {
      log.error(`localAi ${label} failed`, error)
    }
  }

export function* watchLocalAiSaga() {
  yield fork(downloadWorker)
  yield fork(watchAskCache)
  yield fork(watchLocalAiJobs)
  yield fork(watchLocalAiSimilarity)
  yield fork(watchNoteSuggestions)
  yield takeLatest([initLocalAi, appReady], guarded('init', handleInit))
  yield takeEvery(enableLocalAiFeature, guarded('enable', handleEnable))
  yield takeEvery(disableLocalAiFeature, guarded('disable', handleDisable))
  yield takeEvery(cancelLocalAiFeatureDownload, guarded('cancel', handleCancelFeatureDownload))
  yield takeEvery(setLocalAiFeatureTier, guarded('tier', handleSetTier))
  yield takeEvery(setLocalAiFeatureModel, guarded('model', handleSetModel))
  yield takeEvery(setLocalAiOffload, guarded('offload', handleSetOffload))
  yield takeEvery(setLocalAiFeatureLanguage, guarded('language', handleSetLanguage))
  yield takeEvery(setLocalAiWifiOnly, guarded('wifi-only', handleSetWifiOnly))
  yield takeEvery(localAiNetworkChanged, guarded('network', handleNetworkChanged))
  yield takeEvery(pauseLocalAiDownload, guarded('pause', handlePause))
  yield takeEvery(resumeLocalAiDownload, guarded('resume', handleResume))
  yield takeEvery(downloadLocalAiModelNow, guarded('download-now', handleDownloadNow))
  yield takeEvery(deleteLocalAiModel, guarded('delete', handleDeleteModel))
  yield takeEvery(deleteAllLocalAiModels, guarded('delete-all', handleDeleteAll))
  yield takeEvery(localAiAppResumed, guarded('resumed', handleAppResumed))
  yield takeEvery(downloadLocalAiModels, guarded('download-models', handleDownloadModels))
  yield takeEvery(
    setLocalAiTranslationTarget,
    guarded('translation-target', handleSetTranslationTarget)
  )
}
