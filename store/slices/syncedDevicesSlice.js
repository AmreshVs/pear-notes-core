import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'

import { MAX_SYNC_LEADERS } from '../../constant.js'

const SYNCED_DEVICES_KEY = 'syncedDevices'

const initialState = {
  devicesKeys: [],
  devicesData: {},
  localPreferences: {},
  isLoading: false,
  error: null,
  indexerPendingKey: null,
  indexerPendingStep: null,
  indexerError: null,
  indexerErrorDeviceKey: null
}

const syncedDevicesSlice = createSlice({
  name: SYNCED_DEVICES_KEY,
  initialState,
  reducers: {
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setDevicesKeys: (state, action) => {
      state.devicesKeys = [...new Set(action.payload)]
    },
    setDeviceData: (state, { payload }) => {
      state.devicesData = {
        ...state.devicesData,
        [payload.key]: payload.data
      }
    },
    setLocalPreference: (state, { payload }) => {
      // Still keep this for UI state if needed, but we'll use localStorage for persistence
      state.localPreferences = {
        ...state.localPreferences,
        [payload.key]: payload.value
      }
    },
    setError: (state, action) => {
      state.error = action.payload
      state.isLoading = false
    },
    setIndexerPending: (state, { payload }) => {
      state.indexerPendingKey = payload.key
      state.indexerPendingStep = payload.step || null
      state.indexerError = null
      state.indexerErrorDeviceKey = null
    },
    setIndexerError: (state, { payload }) => {
      state.indexerPendingKey = null
      state.indexerPendingStep = null
      state.indexerError = payload.error
      state.indexerErrorDeviceKey = payload.key
    },
    clearIndexerError: (state) => {
      state.indexerError = null
      state.indexerErrorDeviceKey = null
    }
  }
})

export const {
  setLoading,
  setDevicesKeys,
  setDeviceData,
  setLocalPreference,
  setError,
  setIndexerPending,
  setIndexerError,
  clearIndexerError
} = syncedDevicesSlice.actions

const syncedDevicesState = (state) => state[SYNCED_DEVICES_KEY]
export const getDevicesKeys = (state) => syncedDevicesState(state).devicesKeys
export const getDevicesData = (state) => syncedDevicesState(state).devicesData
export const getLocalPreferences = (state) => syncedDevicesState(state).localPreferences
export const getIsLoading = (state) => syncedDevicesState(state).isLoading

export const getSyncedDevices = createSelector([getDevicesKeys, getDevicesData], (keys, data) => {
  return keys
    .filter((key) => data[key])
    .map((key) => ({
      key,
      ...data[key]
    }))
})

export const getRemoteSyncedDevices = createSelector([getSyncedDevices], (devices) =>
  devices.filter((device) => !device.isLocal)
)

export const getLinkedDeviceCount = createSelector([getSyncedDevices], (devices) => devices.length)

export const getHasLinkedDevices = createSelector(
  [getRemoteSyncedDevices],
  (devices) => devices.length > 0
)

export const getIndexerPendingKey = (state) => syncedDevicesState(state).indexerPendingKey
export const getIndexerPendingStep = (state) => syncedDevicesState(state).indexerPendingStep
export const getIndexerError = (state) => syncedDevicesState(state).indexerError
export const getIndexerErrorDeviceKey = (state) => syncedDevicesState(state).indexerErrorDeviceKey

const isReachable = (device) => device?.isLocal === true || device?.isOnline === true

// iOS suspends the app in the background, so an iPhone is never suggested as a leader.
const canStayOn = (device) => device?.platform !== 'ios'

const leaderFitness = (a, b) =>
  (b.deviceType === 'desktop') - (a.deviceType === 'desktop') || (a.addedAt || 0) - (b.addedAt || 0)

// Autobase confirms a change once a majority of leaders have seen it, so every extra
// leader is one more device that has to be online. One always-on leader is the
// recommendation; up to three are allowed for people who want to survive one being off.
export function planSyncLeaders(devices = []) {
  const leaders = devices.filter((device) => device.isIndexer === true)
  const offlineLeaders = leaders.filter((device) => !isReachable(device))
  const max = Math.max(1, Math.min(MAX_SYNC_LEADERS, devices.length))
  const leadersOnline = offlineLeaders.length === 0
  const canAdd = leaders.length < max && leadersOnline
  const needsAlwaysOnLeader = !leaders.some(canStayOn)
  const suggested =
    canAdd && needsAlwaysOnLeader
      ? devices
          .filter((device) => device.isIndexer !== true && isReachable(device) && canStayOn(device))
          .sort(leaderFitness)[0] || null
      : null
  return {
    leaders,
    leaderCount: leaders.length,
    offlineLeaders,
    max,
    recommended: 1,
    leadersOnline,
    canAdd,
    canRemove: leaders.length > 1 && leadersOnline,
    needsBothOnline: leaders.length === 2,
    suggested
  }
}

export const canAddSyncLeader = (device, plan) =>
  !!device && device.isIndexer !== true && plan.canAdd && isReachable(device)

export const canRemoveSyncLeader = (device, plan) => device?.isIndexer === true && plan.canRemove

export const getSyncLeaderPlan = createSelector([getSyncedDevices], planSyncLeaders)

export const getIsLocalDeviceIndexer = createSelector([getSyncedDevices], (devices) =>
  devices.some((device) => device.isLocal === true && device.isIndexer === true)
)

export const fetchSyncedDevices = createAction('syncedDevices/fetch-all')
export const updateSyncedDevice = createAction('syncedDevices/update')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ key: string }, 'syncedDevices/delete'>} */
export const deleteSyncedDevice = createAction('syncedDevices/delete')
export const subscribeAllSyncedDevicesKeys = createAction(
  'syncedDevices/subscribe-all-synced-device-keys'
)
export const subscribeAllSyncedDevices = createAction('syncedDevices/subscribe-all-synced-device')
export const fetchLocalPreference = createAction('syncedDevices/fetch-preference')
export const saveLocalPreference = createAction('syncedDevices/save-preference')
export const checkAndInsertLocalDevice = createAction('syncedDevices/check-and-insert-local')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ key: string, localKey: string, isIndexer: boolean }, 'syncedDevices/set-indexer'>} */
export const setDeviceIndexer = createAction('syncedDevices/set-indexer')

export default syncedDevicesSlice.reducer
