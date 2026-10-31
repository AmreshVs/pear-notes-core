import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { watchLocalAiJobs } from '../store/sagas/localAiJobsSaga.js'
import {
  enqueueSchedulerProbe,
  getAiJobScheduler,
  resetAiJobSchedulerForTests,
  withAiJobHold
} from '../store/services/localAiJobs.js'
import { localAiConditionsChanged } from '../store/slices/localAiSlice.js'
import { appResumed, appSuspended } from '../store/slices/uiSlice.js'

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

function start() {
  const channel = stdChannel()
  const state = { localAi: { device: { totalMemoryBytes: 8 * 1024 ** 3 } } }
  const task = runSaga(
    { channel, dispatch: (action) => channel.put(action), getState: () => state },
    watchLocalAiJobs
  )
  return { put: (action) => channel.put(action), task }
}

test('lifecycle actions drive the scheduler conditions', async (t) => {
  resetAiJobSchedulerForTests()
  const { put, task } = start()
  const scheduler = getAiJobScheduler()
  put(localAiConditionsChanged({ foreground: false, charging: true }))
  t.alike(scheduler.snapshot().conditions, {
    foreground: false,
    idle: false,
    charging: true,
    suspended: false
  })
  put(appSuspended())
  await tick()
  t.ok(scheduler.snapshot().conditions.suspended)
  put(appResumed())
  t.absent(scheduler.snapshot().conditions.suspended)
  task.cancel()
  resetAiJobSchedulerForTests()
})

test('the probe runs in the background and yields to a held user action', async (t) => {
  resetAiJobSchedulerForTests()
  const scheduler = getAiJobScheduler()
  scheduler.setConditions({ foreground: false, charging: true })
  const probe = enqueueSchedulerProbe({ steps: 2 })
  await tick(50)
  t.is(scheduler.snapshot().running?.key, 'scheduler-probe')
  await withAiJobHold(async () => {
    await tick(20)
    t.is(scheduler.snapshot().running, null, 'paused while held')
  })
  const result = await probe
  t.is(result.runs, 2, 'resumed after the hold')
  resetAiJobSchedulerForTests()
})

test('search by meaning turns the index on and off, and turning it off clears the index', async (t) => {
  const { backendApi } = await import('../backend/api.js')
  const {
    default: localAi,
    enableLocalAiIndex,
    setLocalAiConfig,
    setLocalAiLoaded
  } = await import('../store/slices/localAiSlice.js')
  const { LOCAL_AI_FEATURE, createDefaultLocalAiConfig } =
    await import('../store/services/localAiCatalog.js')
  resetAiJobSchedulerForTests()
  const cleared = []
  const originalClear = backendApi.derivedClear
  backendApi.derivedClear = async ({ namespace }) => {
    cleared.push(namespace)
    return { ok: true }
  }
  const channel = stdChannel()
  const state = { localAi: localAi(undefined, { type: '@init' }), ui: { searchQuery: '' } }
  const dispatch = (action) => {
    state.localAi = localAi(state.localAi, action)
    channel.put(action)
  }
  const task = runSaga({ channel, dispatch, getState: () => state }, watchLocalAiJobs)
  const withFeature = (enabled) => {
    const config = createDefaultLocalAiConfig()
    config.features[LOCAL_AI_FEATURE.SEARCH_BY_MEANING].enabled = enabled
    return config
  }

  dispatch(enableLocalAiIndex({ waitForCharging: true }))
  dispatch(setLocalAiLoaded({ config: withFeature(false), models: {} }))
  await tick()
  t.absent(state.localAi.index.enabled, 'the host alone does not turn indexing on')
  t.ok(state.localAi.index.waitForCharging)

  dispatch(setLocalAiConfig(withFeature(true)))
  await tick()
  t.ok(state.localAi.index.enabled)
  t.alike(cleared, [])

  dispatch(setLocalAiConfig(withFeature(false)))
  await tick(10)
  t.absent(state.localAi.index.enabled)
  t.alike(cleared, ['index-meta', 'vectors', 'chunks', 'duplicate-pairs', 'duplicates-dismissed'])

  dispatch(setLocalAiConfig({ ...withFeature(false), wifiOnly: false }))
  await tick(10)
  t.is(cleared.length, 5, 'an unrelated config change clears nothing')

  backendApi.derivedClear = originalClear
  task.cancel()
  resetAiJobSchedulerForTests()
})
