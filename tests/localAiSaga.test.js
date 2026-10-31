import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'
import { fork, spawn, take } from 'redux-saga/effects'

import { setRPC } from '../rpc.js'
import { setLocalAiAdapter } from '../store/services/localAiAdapter.js'
import {
  LOCAL_AI_CONFIG_KEY,
  LOCAL_AI_FEATURE,
  LOCAL_AI_FEATURE_STATUS,
  LOCAL_AI_MODEL_STATUS,
  LOCAL_AI_NETWORK,
  LOCAL_AI_NOTICE
} from '../store/services/localAiCatalog.js'
import { watchLocalAiSaga } from '../store/sagas/localAiSaga.js'
import localAiReducer, {
  computeFeatureStatus,
  disableLocalAiFeature,
  enableLocalAiFeature,
  initLocalAi,
  localAiNetworkChanged,
  pauseLocalAiDownload,
  setLocalAiFeatureTier
} from '../store/slices/localAiSlice.js'

const GB = 1024 * 1024 * 1024
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function createFakeAdapter(overrides = {}) {
  const pending = new Map()
  const adapter = {
    started: [],
    cancels: [],
    deleted: [],
    getDeviceSupport: async () => ({ status: 'supported' }),
    getNetworkKind: async () => LOCAL_AI_NETWORK.WIFI,
    getDiskSpace: async () => ({ freeBytes: 50 * GB, totalBytes: 128 * GB }),
    download(name) {
      adapter.started.push(name)
      let resolve
      let reject
      const done = new Promise((resolveDone, rejectDone) => {
        resolve = resolveDone
        reject = rejectDone
      })
      pending.set(name, { resolve, reject })
      return { requestId: `request-${name}`, done }
    },
    finish(name, bytes = 1000) {
      pending.get(name).resolve({ bytes })
    },
    cancel: async (requestId, options) => {
      adapter.cancels.push({ requestId, ...options })
    },
    deleteModel: async (name) => {
      adapter.deleted.push(name)
    },
    closeAndWipe: async () => {},
    ...overrides
  }
  return adapter
}

function startHarness(adapter, stored = null, root = watchLocalAiSaga) {
  setLocalAiAdapter(adapter)
  const prefs = new Map()
  if (stored) prefs.set(LOCAL_AI_CONFIG_KEY, stored)
  setRPC({
    commandGetPreference: async ({ key }) => ({ data: prefs.get(key) ?? null }),
    commandUpdatePreference: async ({ key, value }) => {
      prefs.set(key, value)
      return {}
    }
  })

  const channel = stdChannel()
  let state = { localAi: localAiReducer(undefined, { type: 'test/init' }) }
  const dispatch = (action) => {
    state = { localAi: localAiReducer(state.localAi, action) }
    channel.put(action)
  }
  const task = runSaga({ channel, dispatch, getState: () => state }, root)

  return {
    dispatch,
    task,
    getState: () => state.localAi,
    storedConfig: () => JSON.parse(prefs.get(LOCAL_AI_CONFIG_KEY) ?? 'null')
  }
}

const readyVoiceConfig = (features) =>
  JSON.stringify({
    wifiOnly: true,
    features: Object.fromEntries(features.map((feature) => [feature, { enabled: true }])),
    downloaded: {
      WHISPER_BASE_Q8_0: { bytes: 81768585 },
      VAD_SILERO_5_1_2: { bytes: 885098 }
    }
  })

test('local ai saga - nothing loads without an adapter', async (t) => {
  const harness = startHarness(null)
  harness.dispatch(initLocalAi())
  await settle()
  t.is(harness.getState().loaded, false)
  harness.task.cancel()
})

test('local ai saga - turning a feature on downloads its models one at a time and saves them', async (t) => {
  const adapter = createFakeAdapter()
  const harness = startHarness(adapter)
  harness.dispatch(initLocalAi())
  await settle()

  harness.dispatch(enableLocalAiFeature({ feature: LOCAL_AI_FEATURE.VOICE_TYPING }))
  await settle()
  t.alike(adapter.started, ['WHISPER_BASE_Q8_0'])
  t.is(harness.getState().models.VAD_SILERO_5_1_2.status, LOCAL_AI_MODEL_STATUS.QUEUED)

  adapter.finish('WHISPER_BASE_Q8_0', 81768585)
  await settle()
  t.alike(adapter.started, ['WHISPER_BASE_Q8_0', 'VAD_SILERO_5_1_2'])

  adapter.finish('VAD_SILERO_5_1_2', 885098)
  await settle()
  t.is(computeFeatureStatus(harness.getState(), 'voiceTyping'), LOCAL_AI_FEATURE_STATUS.READY)

  const stored = harness.storedConfig()
  t.is(stored.features.voiceTyping.enabled, true)
  t.alike(Object.keys(stored.downloaded).sort(), ['VAD_SILERO_5_1_2', 'WHISPER_BASE_Q8_0'])
  harness.task.cancel()
})

test('local ai saga - a shared model stays when one of its features is turned off', async (t) => {
  const adapter = createFakeAdapter()
  const harness = startHarness(
    adapter,
    readyVoiceConfig([LOCAL_AI_FEATURE.VOICE_TYPING, LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS])
  )
  harness.dispatch(initLocalAi())
  await settle()
  t.alike(adapter.started, [])

  harness.dispatch(
    disableLocalAiFeature({ feature: LOCAL_AI_FEATURE.VOICE_TYPING, deleteModels: true })
  )
  await settle()
  t.alike(adapter.deleted, [])
  t.is(computeFeatureStatus(harness.getState(), 'voiceTyping'), LOCAL_AI_FEATURE_STATUS.OFF)
  t.is(
    computeFeatureStatus(harness.getState(), 'transcribeRecordings'),
    LOCAL_AI_FEATURE_STATUS.READY
  )
  harness.task.cancel()
})

test('local ai saga - turning off the last user with delete removes its models', async (t) => {
  const adapter = createFakeAdapter()
  const harness = startHarness(adapter, readyVoiceConfig([LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS]))
  harness.dispatch(initLocalAi())
  await settle()

  harness.dispatch(
    disableLocalAiFeature({ feature: LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS, deleteModels: true })
  )
  await settle()
  t.alike(adapter.deleted.sort(), ['VAD_SILERO_5_1_2', 'WHISPER_BASE_Q8_0'])
  t.alike(harness.getState().models, {})
  t.alike(harness.storedConfig().downloaded, {})
  harness.task.cancel()
})

test('local ai saga - not enough space raises a notice and leaves the feature off', async (t) => {
  const adapter = createFakeAdapter({
    getDiskSpace: async () => ({ freeBytes: 1.05 * GB, totalBytes: 8 * GB })
  })
  const harness = startHarness(adapter)
  harness.dispatch(initLocalAi())
  await settle()

  harness.dispatch(enableLocalAiFeature({ feature: LOCAL_AI_FEATURE.DESCRIBE_IMAGES }))
  await settle()
  t.is(harness.getState().notice?.type, LOCAL_AI_NOTICE.INSUFFICIENT_SPACE)
  t.is(computeFeatureStatus(harness.getState(), 'describeImages'), LOCAL_AI_FEATURE_STATUS.OFF)
  t.alike(adapter.started, [])
  harness.task.cancel()
})

test('local ai saga - on cellular with wifi only the download waits, then starts on wifi', async (t) => {
  const adapter = createFakeAdapter({ getNetworkKind: async () => LOCAL_AI_NETWORK.CELLULAR })
  const harness = startHarness(adapter)
  harness.dispatch(initLocalAi())
  await settle()

  harness.dispatch(enableLocalAiFeature({ feature: LOCAL_AI_FEATURE.DESCRIBE_IMAGES }))
  await settle()
  t.alike(adapter.started, [])
  t.is(
    harness.getState().models.QWEN3_5_0_8B_MULTIMODAL_Q4_K_M.status,
    LOCAL_AI_MODEL_STATUS.WAITING_NETWORK
  )

  harness.dispatch(localAiNetworkChanged(LOCAL_AI_NETWORK.WIFI))
  await settle()
  t.alike(adapter.started, ['QWEN3_5_0_8B_MULTIMODAL_Q4_K_M'])
  harness.task.cancel()
})

test('local ai saga - pausing a running download cancels it but keeps the partial file', async (t) => {
  const adapter = createFakeAdapter()
  const harness = startHarness(adapter)
  harness.dispatch(initLocalAi())
  await settle()

  harness.dispatch(enableLocalAiFeature({ feature: LOCAL_AI_FEATURE.DESCRIBE_IMAGES }))
  await settle()
  harness.dispatch(pauseLocalAiDownload({ name: 'QWEN3_5_0_8B_MULTIMODAL_Q4_K_M' }))
  await settle()

  t.alike(adapter.cancels, [
    { requestId: 'request-QWEN3_5_0_8B_MULTIMODAL_Q4_K_M', discard: false }
  ])
  t.is(
    harness.getState().models.QWEN3_5_0_8B_MULTIMODAL_Q4_K_M.status,
    LOCAL_AI_MODEL_STATUS.PAUSED
  )
  t.is(adapter.started[1], 'MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0')
  harness.task.cancel()
})

test('local ai saga - an adapter that throws does not stop sibling sagas', async (t) => {
  let pings = 0
  const adapter = createFakeAdapter({
    getDeviceSupport: async () => {
      throw new Error('device check failed')
    }
  })
  function* root() {
    yield spawn(watchLocalAiSaga)
    yield fork(function* () {
      while (true) {
        yield take('test/ping')
        pings++
      }
    })
  }
  const harness = startHarness(adapter, null, root)
  harness.dispatch(initLocalAi())
  await settle()
  harness.dispatch({ type: 'test/ping' })
  await settle()

  t.is(pings, 1)
  t.is(harness.getState().loaded, false)
  harness.task.cancel()
})

test('local ai saga - a quality tier the device is too small for is the users choice to keep', async (t) => {
  const adapter = createFakeAdapter({
    getDeviceSupport: async () => ({ status: 'limited', totalMemoryBytes: 3.7 * GB })
  })
  const stored = JSON.stringify({
    wifiOnly: false,
    features: { summarizeRecordings: { enabled: true, tier: 'best' } },
    downloaded: {}
  })
  const harness = startHarness(adapter, stored)
  harness.dispatch(initLocalAi())
  await settle()
  // Startup used to quietly rewrite this back to 'standard', which made the
  // setting look like it had not taken.
  t.is(harness.getState().config.features.summarizeRecordings.tier, 'best')
  t.is(harness.storedConfig().features.summarizeRecordings.tier, 'best')
  t.alike(adapter.started, ['QWEN3_1_7B_INST_Q4'])

  harness.dispatch(
    setLocalAiFeatureTier({ feature: LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS, tier: 'standard' })
  )
  await settle()
  t.is(harness.getState().config.features.summarizeRecordings.tier, 'standard')

  harness.dispatch(
    setLocalAiFeatureTier({ feature: LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS, tier: 'best' })
  )
  await settle()
  t.is(harness.getState().config.features.summarizeRecordings.tier, 'best')
  harness.task.cancel()
})

test('local ai saga - a feature that cannot fit in memory at any quality stays unavailable and downloads nothing', async (t) => {
  const adapter = createFakeAdapter({
    getDeviceSupport: async () => ({ status: 'limited', totalMemoryBytes: 1.9 * GB })
  })
  const harness = startHarness(adapter)
  harness.dispatch(initLocalAi())
  await settle()
  t.is(
    computeFeatureStatus(harness.getState(), 'summarizeRecordings'),
    LOCAL_AI_FEATURE_STATUS.NEEDS_MEMORY
  )
  harness.dispatch(enableLocalAiFeature({ feature: LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS }))
  await settle()
  t.is(harness.getState().config.features.summarizeRecordings.enabled, false)
  t.alike(adapter.started, [])
  harness.task.cancel()
})
