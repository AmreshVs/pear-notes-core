import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'
import { DEFAULT_AI_SUGGESTIONS } from '../services/aiSuggestionPrefs.js'
import {
  LOCAL_AI_DEVICE_STATUS,
  LOCAL_AI_FEATURE,
  LOCAL_AI_FEATURE_STATUS,
  LOCAL_AI_MODEL_STATUS,
  canRunAnyTier,
  createDefaultLocalAiConfig,
  getFeatureRegistryNames,
  getOnDemandModelNames,
  getTextAskFallback,
  getTextTaskModel,
  LOCAL_AI_TEXT_TASK,
  isOnDemandFeature,
  isOnDemandModelFor,
  getModelDownloadBytes
} from '../services/localAiCatalog.js'
import { LOCAL_AI_EMBEDDING_MODEL } from '../services/localAiTiers.js'

const initialState = {
  loaded: false,
  device: {
    status: LOCAL_AI_DEVICE_STATUS.UNKNOWN,
    reason: null,
    totalMemoryBytes: 0,
    freeDiskBytes: 0
  },
  network: 'unknown',
  config: createDefaultLocalAiConfig(),
  models: {},
  notice: null,
  index: {
    enabled: false,
    waitForCharging: false,
    status: 'idle',
    done: 0,
    total: 0,
    deferred: 0,
    error: null,
    lastRun: null,
    changedAt: 0
  },
  related: { noteKey: null, status: 'idle', forKey: null, hits: [], indexAt: -1 },
  duplicates: { status: 'idle', pairs: [], indexAt: -1 },
  upcoming: { title: null, snoozed: [] },
  offloadStatus: { available: false, deviceTitle: '' },
  offloadServing: { active: false, activeDevice: '', lastDevice: '', lastAt: 0 },
  suggestions: { noteKey: null, title: null, folder: null },
  aiSuggestions: DEFAULT_AI_SUGGESTIONS
}

const VAULT_SIMILARITY = {
  related: initialState.related,
  duplicates: initialState.duplicates,
  upcoming: initialState.upcoming
}

const localAiSlice = createSlice({
  name: 'localAi',
  initialState,
  reducers: {
    setLocalAiLoaded: (state, action) => {
      const { config, models } = action.payload
      state.config = config
      state.models = models ?? {}
      state.loaded = true
    },
    setLocalAiDevice: (state, action) => {
      state.device = { ...state.device, ...action.payload }
    },
    setNoteSuggestions: (state, action) => {
      const { noteKey, reset, ...fields } = action.payload || {}
      if (reset || state.suggestions.noteKey !== noteKey) {
        state.suggestions = { noteKey: noteKey ?? null, title: null, folder: null }
      }
      Object.assign(state.suggestions, fields)
    },
    clearNoteSuggestion: (state, action) => {
      const { noteKey, kind } = action.payload || {}
      if (kind === 'title' && state.upcoming.title?.noteKey === noteKey) state.upcoming.title = null
      if (state.suggestions.noteKey !== noteKey) return
      if (kind === 'title') state.suggestions.title = null
      if (kind === 'folder') state.suggestions.folder = null
    },
    setLocalAiOffloadStatus: (state, action) => {
      state.offloadStatus = action.payload
    },
    setLocalAiOffloadServing: (state, action) => {
      state.offloadServing = { ...state.offloadServing, ...action.payload }
    },
    setLocalAiNetwork: (state, action) => {
      state.network = action.payload
    },
    setLocalAiConfig: (state, action) => {
      state.config = action.payload
    },
    setLocalAiModel: (state, action) => {
      const { name, ...fields } = action.payload
      state.models[name] = { ...(state.models[name] ?? {}), ...fields }
    },
    setLocalAiModelsProgress: (state, action) => {
      for (const [name, progress] of Object.entries(action.payload)) {
        if (!state.models[name]) continue
        state.models[name].downloadedBytes = progress.downloadedBytes
        if (progress.totalBytes) state.models[name].totalBytes = progress.totalBytes
      }
    },
    removeLocalAiModel: (state, action) => {
      delete state.models[action.payload]
    },
    setLocalAiNotice: (state, action) => {
      state.notice = action.payload
    },
    clearLocalAiNotice: (state) => {
      state.notice = null
    },
    setLocalAiIndexState: (state, action) => {
      state.index = { ...state.index, ...action.payload }
    },
    openRelatedNotes: (state, action) => {
      state.related = { ...initialState.related, noteKey: action.payload }
    },
    closeRelatedNotes: (state) => {
      state.related = initialState.related
    },
    relatedNotesLoading: (state, action) => {
      if (state.related.noteKey === action.payload) state.related.status = 'loading'
    },
    relatedNotesLoaded: (state, action) => {
      const { noteKey, hits, indexAt } = action.payload
      if (state.related.noteKey !== noteKey) return
      state.related = { ...state.related, status: 'done', forKey: noteKey, hits, indexAt }
    },
    relatedNotesFailed: (state, action) => {
      if (state.related.noteKey === action.payload) state.related.status = 'failed'
    },
    duplicatesLoading: (state) => {
      state.duplicates.status = 'loading'
    },
    duplicatesLoaded: (state, action) => {
      const { pairs, indexAt } = action.payload
      state.duplicates = { status: 'done', pairs, indexAt }
    },
    duplicatesFailed: (state) => {
      state.duplicates.status = 'failed'
    },
    duplicatePairDismissed: (state, action) => {
      const { a, b } = action.payload
      state.duplicates.pairs = state.duplicates.pairs.filter(
        (pair) => !((pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))
      )
    },
    setUpcomingTitle: (state, action) => {
      state.upcoming.title = action.payload
    },
    snoozeUpcomingSuggestion: (state, action) => {
      if (!state.upcoming.snoozed.includes(action.payload))
        state.upcoming.snoozed.push(action.payload)
      if (state.upcoming.title && `title:${state.upcoming.title.noteKey}` === action.payload) {
        state.upcoming.title = null
      }
    },
    setAiSuggestions: (state, action) => {
      state.aiSuggestions = { ...DEFAULT_AI_SUGGESTIONS, ...action.payload }
    },
    clearVaultSimilarity: (state) => ({ ...state, ...VAULT_SIMILARITY }),
    resetLocalAi: (state) => ({
      ...initialState,
      index: {
        ...initialState.index,
        enabled: state.index.enabled,
        waitForCharging: state.index.waitForCharging
      }
    })
  }
})

export const {
  setAiSuggestions,
  setLocalAiLoaded,
  setLocalAiDevice,
  setLocalAiNetwork,
  setLocalAiOffloadStatus,
  setLocalAiOffloadServing,
  setNoteSuggestions,
  clearNoteSuggestion,
  setLocalAiConfig,
  setLocalAiModel,
  setLocalAiModelsProgress,
  removeLocalAiModel,
  setLocalAiNotice,
  clearLocalAiNotice,
  setLocalAiIndexState,
  openRelatedNotes,
  closeRelatedNotes,
  relatedNotesLoading,
  relatedNotesLoaded,
  relatedNotesFailed,
  duplicatesLoading,
  duplicatesLoaded,
  duplicatesFailed,
  duplicatePairDismissed,
  setUpcomingTitle,
  snoozeUpcomingSuggestion,
  clearVaultSimilarity,
  resetLocalAi
} = localAiSlice.actions

export const initLocalAi = createAction('localAi/init')
export const enableLocalAiFeature = createAction('localAi/enable-feature')
export const disableLocalAiFeature = createAction('localAi/disable-feature')
export const setLocalAiFeatureTier = createAction('localAi/set-feature-tier')
export const setLocalAiFeatureModel = createAction('localAi/set-feature-model')
export const setLocalAiOffload = createAction('localAi/set-offload')
export const dismissNoteSuggestion = createAction('localAi/dismiss-note-suggestion')
export const noteSuggestionAccepted = createAction('localAi/note-suggestion-accepted')
export const acceptFolderSuggestion = createAction('localAi/accept-folder-suggestion')
export const setLocalAiFeatureLanguage = createAction('localAi/set-feature-language')
export const setLocalAiWifiOnly = createAction('localAi/set-wifi-only')
export const pauseLocalAiDownload = createAction('localAi/pause-download')
export const resumeLocalAiDownload = createAction('localAi/resume-download')
export const downloadLocalAiModelNow = createAction('localAi/download-now')
export const cancelLocalAiFeatureDownload = createAction('localAi/cancel-feature-download')
export const deleteLocalAiModel = createAction('localAi/delete-model')
export const deleteAllLocalAiModels = createAction('localAi/delete-all-models')
export const localAiNetworkChanged = createAction('localAi/network-changed')
export const localAiAppResumed = createAction('localAi/app-resumed')
export const downloadLocalAiModels = createAction('localAi/download-models')
export const setLocalAiTranslationTarget = createAction('localAi/set-translation-target')
export const queueLocalAiDownload = createAction('localAi/queue-download')
export const holdLocalAiDownload = createAction('localAi/hold-download')
export const localAiConditionsChanged = createAction('localAi/conditions-changed')
export const localAiUserActivity = createAction('localAi/user-activity')
export const runLocalAiSchedulerProbe = createAction('localAi/run-scheduler-probe')
export const enableLocalAiIndex = createAction('localAi/enable-index')
export const rebuildLocalAiIndex = createAction('localAi/rebuild-index')
export const indexLocalAiNow = createAction('localAi/index-now')
export const indexLocalAiInBackground = createAction('localAi/index-in-background')
export const loadRelatedNotes = createAction('localAi/load-related-notes')
export const loadDuplicateNotes = createAction('localAi/load-duplicate-notes')
export const dismissDuplicateNotes = createAction('localAi/dismiss-duplicate-notes')
export const loadUpcomingSuggestions = createAction('localAi/load-upcoming-suggestions')
export const acceptUpcomingTitle = createAction('localAi/accept-upcoming-title')
export const setAiSuggestion = createAction('localAi/set-ai-suggestion')
export const loadAiSuggestionPrefs = createAction('localAi/load-ai-suggestions')

const FEATURE_STATUS_PRECEDENCE = [
  [LOCAL_AI_MODEL_STATUS.FAILED, LOCAL_AI_FEATURE_STATUS.FAILED],
  [LOCAL_AI_MODEL_STATUS.DOWNLOADING, LOCAL_AI_FEATURE_STATUS.DOWNLOADING],
  [LOCAL_AI_MODEL_STATUS.QUEUED, LOCAL_AI_FEATURE_STATUS.DOWNLOADING],
  [LOCAL_AI_MODEL_STATUS.WAITING_NETWORK, LOCAL_AI_FEATURE_STATUS.WAITING_NETWORK],
  [LOCAL_AI_MODEL_STATUS.PAUSED, LOCAL_AI_FEATURE_STATUS.PAUSED]
]

const featureNames = (config, feature) =>
  getFeatureRegistryNames(feature, config?.features?.[feature])

export function computeFeatureStatus({ config, models, device }, feature) {
  if (device?.status === LOCAL_AI_DEVICE_STATUS.UNSUPPORTED) {
    return LOCAL_AI_FEATURE_STATUS.UNSUPPORTED
  }
  if (!canRunAnyTier(feature, config?.features?.[feature], device?.totalMemoryBytes)) {
    return LOCAL_AI_FEATURE_STATUS.NEEDS_MEMORY
  }
  if (!config?.features?.[feature]?.enabled) return LOCAL_AI_FEATURE_STATUS.OFF
  const featureConfig = config?.features?.[feature]
  const fallback =
    feature === LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS ? getTextAskFallback(featureConfig) : null
  const preferredAsk = fallback ? getTextTaskModel(featureConfig, LOCAL_AI_TEXT_TASK.ASK) : null
  const isReady = (name) => models?.[name]?.status === LOCAL_AI_MODEL_STATUS.READY
  const statuses = featureNames(config, feature)
    .filter((name) => !(name === preferredAsk && !isReady(name) && isReady(fallback)))
    .map((name) => models?.[name]?.status ?? LOCAL_AI_MODEL_STATUS.NONE)
  if (statuses.every((status) => status === LOCAL_AI_MODEL_STATUS.READY)) {
    return LOCAL_AI_FEATURE_STATUS.READY
  }
  for (const [modelStatus, featureStatus] of FEATURE_STATUS_PRECEDENCE) {
    if (statuses.includes(modelStatus)) return featureStatus
  }
  return LOCAL_AI_FEATURE_STATUS.PAUSED
}

export function computeFeatureProgress({ config, models }, feature) {
  let downloadedBytes = 0
  let totalBytes = 0
  for (const name of featureNames(config, feature)) {
    const model = models?.[name]
    const expected = model?.totalBytes || getModelDownloadBytes(name) || 0
    totalBytes += expected
    downloadedBytes +=
      model?.status === LOCAL_AI_MODEL_STATUS.READY
        ? expected
        : Math.min(model?.downloadedBytes ?? 0, expected)
  }
  return { downloadedBytes, totalBytes }
}

export function computeModelUsers(config, name, exceptFeature = null) {
  return Object.entries(config?.features ?? {})
    .filter(([feature, featureConfig]) => {
      if (feature === exceptFeature || !featureConfig?.enabled) return false
      return (
        isOnDemandModelFor(feature, name) ||
        getFeatureRegistryNames(feature, featureConfig).includes(name)
      )
    })
    .map(([feature]) => feature)
}

export function computeModelsStatus(models, names) {
  const statuses = names.map((name) => models?.[name]?.status ?? LOCAL_AI_MODEL_STATUS.NONE)
  let downloadedBytes = 0
  let totalBytes = 0
  for (const name of names) {
    const model = models?.[name]
    const expected = model?.totalBytes || getModelDownloadBytes(name) || 0
    totalBytes += expected
    downloadedBytes +=
      model?.status === LOCAL_AI_MODEL_STATUS.READY
        ? expected
        : Math.min(model?.downloadedBytes ?? 0, expected)
  }
  const failed = names.find((name) => models?.[name]?.status === LOCAL_AI_MODEL_STATUS.FAILED)
  const status = statuses.every((entry) => entry === LOCAL_AI_MODEL_STATUS.READY)
    ? LOCAL_AI_MODEL_STATUS.READY
    : ([
        LOCAL_AI_MODEL_STATUS.FAILED,
        LOCAL_AI_MODEL_STATUS.DOWNLOADING,
        LOCAL_AI_MODEL_STATUS.QUEUED,
        LOCAL_AI_MODEL_STATUS.WAITING_NETWORK,
        LOCAL_AI_MODEL_STATUS.PAUSED
      ].find((entry) => statuses.includes(entry)) ?? LOCAL_AI_MODEL_STATUS.NONE)
  return {
    status,
    error: failed ? (models[failed].error ?? null) : null,
    downloadedBytes,
    totalBytes,
    missingBytes: Math.max(0, totalBytes - downloadedBytes),
    percent: totalBytes > 0 ? Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100)) : 0
  }
}

export function computeMissingNames({ config, models }, feature) {
  return featureNames(config, feature).filter(
    (name) => models?.[name]?.status !== LOCAL_AI_MODEL_STATUS.READY
  )
}

export function computeReleasableNames({ config, models }, feature) {
  return [...featureNames(config, feature), ...getOnDemandModelNames(feature, models)].filter(
    (name) => models?.[name] && computeModelUsers(config, name, feature).length === 0
  )
}

export function computeBytesOnDisk(models) {
  return Object.entries(models ?? {}).reduce((sum, [name, model]) => {
    if (model.status === LOCAL_AI_MODEL_STATUS.READY) {
      return sum + (model.totalBytes || getModelDownloadBytes(name) || 0)
    }
    return sum + (model.downloadedBytes ?? 0)
  }, 0)
}

const ACTIVE_MODEL_ORDER = [
  LOCAL_AI_MODEL_STATUS.DOWNLOADING,
  LOCAL_AI_MODEL_STATUS.QUEUED,
  LOCAL_AI_MODEL_STATUS.FAILED,
  LOCAL_AI_MODEL_STATUS.PAUSED,
  LOCAL_AI_MODEL_STATUS.WAITING_NETWORK
]

const expectedModelBytes = (name, model) =>
  model?.totalBytes || getModelDownloadBytes(name) || 0

export function computeFeatureRow(state, feature) {
  const models = state?.models ?? {}
  const status = computeFeatureStatus(state, feature)
  const { downloadedBytes, totalBytes } = computeFeatureProgress(state, feature)
  const missing = computeMissingNames(state, feature)
  const missingBytes = missing.reduce(
    (sum, name) =>
      sum +
      Math.max(0, expectedModelBytes(name, models[name]) - (models[name]?.downloadedBytes ?? 0)),
    0
  )
  const activeModel =
    ACTIVE_MODEL_ORDER.map((modelStatus) =>
      missing.find((name) => models[name]?.status === modelStatus)
    ).find(Boolean) ??
    missing[0] ??
    null
  const onDemandBytes = getOnDemandModelNames(feature, models).reduce(
    (sum, name) =>
      sum +
      (models[name]?.status === LOCAL_AI_MODEL_STATUS.READY
        ? expectedModelBytes(name, models[name])
        : 0),
    0
  )
  return {
    feature,
    enabled: !!state?.config?.features?.[feature]?.enabled,
    onDemand: isOnDemandFeature(feature),
    onDemandBytes,
    status,
    percent: totalBytes > 0 ? Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100)) : 0,
    downloadedBytes,
    totalBytes,
    missingBytes,
    activeModel
  }
}

export function computeReleasableBytes(state, feature) {
  return computeReleasableNames(state, feature).reduce((sum, name) => {
    const model = state.models[name]
    return (
      sum +
      (model?.status === LOCAL_AI_MODEL_STATUS.READY
        ? expectedModelBytes(name, model)
        : (model?.downloadedBytes ?? 0))
    )
  }, 0)
}

export const getLocalAiState = (state) => state.localAi
export const getLocalAiLoaded = (state) => getLocalAiState(state).loaded
export const getLocalAiDevice = (state) => getLocalAiState(state).device
export const getLocalAiNetwork = (state) => getLocalAiState(state).network
export const getLocalAiConfig = (state) => getLocalAiState(state).config
export const getNoteSuggestions = (state) => getLocalAiState(state).suggestions
export const getLocalAiIndex = (state) => getLocalAiState(state).index
export const getSearchByMeaningEnabled = (state) =>
  !!getLocalAiConfig(state)?.features?.[LOCAL_AI_FEATURE.SEARCH_BY_MEANING]?.enabled
export const getLocalAiModels = (state) => getLocalAiState(state).models
export const getLocalAiNotice = (state) => getLocalAiState(state).notice
export const getLocalAiIndexEnabled = (state) => getLocalAiIndex(state).enabled
export const getRelatedNotesState = (state) => getLocalAiState(state).related
export const getRelatedNotesKey = (state) => getRelatedNotesState(state).noteKey
export const getAiSuggestions = (state) => getLocalAiState(state).aiSuggestions
export const getUpcomingSuggestionState = (state) => getLocalAiState(state).upcoming
export const selectAiSuggestionOn = (state, kind) => getAiSuggestions(state)?.[kind] !== false
export const getDuplicateNotesState = (state) => getLocalAiState(state).duplicates
export const getLocalAiOffloadServing = (state) => getLocalAiState(state).offloadServing
export const getLinkedDesktopTitle = (state) =>
  selectCanUseLinkedDesktop(state) ? getLocalAiState(state).offloadStatus?.deviceTitle || '' : ''

/** Notes in the index after the last run, out of the notes that can be indexed. */
export const selectIndexCoverage = (state) => {
  const lastRun = getLocalAiIndex(state).lastRun
  if (!lastRun || typeof lastRun.total !== 'number') return null
  return { indexed: Math.max(0, lastRun.total - (lastRun.deferred || 0)), total: lastRun.total }
}

/** Below this many notes left, an index run is routine upkeep and gets no notice. */
const MEANING_NOTICE_MIN_NOTES = 10
const PREPARING_NOTICE = { kind: 'preparing' }

export const getEmbeddingModelStatus = (state) =>
  getLocalAiModels(state)?.[LOCAL_AI_EMBEDDING_MODEL.model]?.status

export const getMeaningSearchReady = (state) =>
  getLocalAiIndex(state).enabled && getEmbeddingModelStatus(state) === LOCAL_AI_MODEL_STATUS.READY

/**
 * null, `{ kind: 'preparing' }`, `{ kind: 'indexing', done, total }` or
 * `{ kind: 'charging', total }` (notes waiting for the phone to charge).
 */
export const getMeaningSearchNotice = (state) => {
  const index = getLocalAiIndex(state)
  if (!index.enabled) return null
  const modelStatus = getEmbeddingModelStatus(state)
  if (!modelStatus || modelStatus === LOCAL_AI_MODEL_STATUS.FAILED) return null
  if (modelStatus !== LOCAL_AI_MODEL_STATUS.READY) return PREPARING_NOTICE
  if (index.status !== 'running') {
    return index.deferred >= MEANING_NOTICE_MIN_NOTES
      ? { kind: 'charging', total: index.deferred }
      : null
  }
  if (index.total - index.done < MEANING_NOTICE_MIN_NOTES) return null
  return { kind: 'indexing', done: index.done, total: index.total }
}

/**
 * Why Ask may miss notes: null once every note is indexed, else
 * `{ kind: 'indexing', done, total }`, `{ kind: 'charging', total }`,
 * `{ kind: 'waiting' }` (no index pass yet this session) or `{ kind: 'failed' }`.
 */
export const selectAskIndexNotice = createSelector(
  [getMeaningSearchReady, getLocalAiIndex],
  (ready, index) => {
    if (!ready) return null
    if (index.status === 'running') {
      return { kind: 'indexing', done: index.done, total: index.total }
    }
    if (index.status === 'failed' || index.status === 'model-missing') return { kind: 'failed' }
    if (index.deferred > 0) return { kind: 'charging', total: index.deferred }
    if (!index.lastRun) return { kind: 'waiting' }
    return null
  }
)

export const getLocalAiFeatureConfig = (state, feature) => getLocalAiConfig(state).features[feature]
export const getLocalAiTranslationTarget = (state) =>
  getLocalAiConfig(state).translation?.lastTarget ?? null
export const selectLocalAiModelsStatus = (state, names) =>
  computeModelsStatus(getLocalAiModels(state), names)
export const selectLocalAiFeatureDisplayNames = (state, feature) => [
  ...featureNames(getLocalAiConfig(state), feature),
  ...getOnDemandModelNames(feature, getLocalAiModels(state))
]
export const selectLocalAiFeatureStatus = (state, feature) =>
  computeFeatureStatus(getLocalAiState(state), feature)
export const selectLocalAiFeatureProgress = (state, feature) =>
  computeFeatureProgress(getLocalAiState(state), feature)
export const selectIsLocalAiFeatureReady = (state, feature) =>
  selectLocalAiFeatureStatus(state, feature) === LOCAL_AI_FEATURE_STATUS.READY

/** "Use my Mac" is on and a linked desktop is answering right now. */
export const selectCanUseLinkedDesktop = (state) =>
  getLocalAiConfig(state)?.offload?.useMac === true &&
  getLocalAiState(state).offloadStatus?.available === true

/** Ask, summaries and writing tools work here, or through a linked desktop. */
export const selectIsTextAiAvailable = (state) =>
  selectIsLocalAiFeatureReady(state, LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS) ||
  selectCanUseLinkedDesktop(state)
export const selectLocalAiFeatureModelNames = (state, feature) =>
  featureNames(getLocalAiConfig(state), feature)
export const selectLocalAiModelUsers = (state, name) =>
  computeModelUsers(getLocalAiConfig(state), name)
export const selectLocalAiBytesOnDisk = (state) => computeBytesOnDisk(getLocalAiModels(state))

export default localAiSlice.reducer
