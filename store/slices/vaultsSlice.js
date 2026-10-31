import { createAction, createSelector, createSlice } from '@reduxjs/toolkit'

import { MAX_VAULTS } from '../../constant.js'

const initialState = {
  list: [],
  // 'create' | 'switch' | 'rename' | 'remove' | 'move' while the backend works on it.
  pending: null,
  pendingId: null,
  error: null,
  failedAction: null,
  forceRemovalId: null,
  enteredAt: 0
}

const vaultsSlice = createSlice({
  name: 'vaults',
  initialState,
  reducers: {
    setVaults: (state, action) => {
      state.list = Array.isArray(action.payload) ? action.payload : []
    },
    setVaultPending: (state, { payload }) => {
      state.pending = payload?.action || null
      state.pendingId = payload?.id || null
      if (payload?.action) state.error = null
    },
    setVaultError: (state, action) => {
      state.error = action.payload || null
      state.failedAction = state.error ? state.pending : null
      state.pending = null
      state.pendingId = null
    },
    setForceRemovalId: (state, action) => {
      state.forceRemovalId = action.payload || null
    },
    clearVaultError: (state) => {
      state.error = null
      state.failedAction = null
    },
    vaultEntered: (state) => {
      state.enteredAt = Date.now()
      state.pending = null
      state.pendingId = null
    }
  }
})

export const {
  setVaults,
  setVaultPending,
  setVaultError,
  setForceRemovalId,
  clearVaultError,
  vaultEntered
} = vaultsSlice.actions

export const loadVaults = createAction('vaults/load')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ name: string }, 'vaults/create'>} */
export const createVault = createAction('vaults/create')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ id: string }, 'vaults/switch'>} */
export const switchVault = createAction('vaults/switch')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ id: string, name: string }, 'vaults/rename'>} */
export const renameVault = createAction('vaults/rename')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ id: string, force?: boolean }, 'vaults/remove'>} */
export const removeVault = createAction('vaults/remove')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ targetId: string, noteKeys?: string[], folderKeys?: string[] }, 'vaults/move'>} */
export const moveToVault = createAction('vaults/move')

const vaultsState = (state) => state.vaults

export const getVaults = (state) => vaultsState(state).list
export const getVaultPending = (state) => vaultsState(state).pending
export const getVaultPendingId = (state) => vaultsState(state).pendingId
export const getVaultError = (state) => vaultsState(state).error
export const getVaultFailedAction = (state) => vaultsState(state).failedAction
export const getVaultEnteredAt = (state) => vaultsState(state).enteredAt
export const getForceRemovalId = (state) => vaultsState(state).forceRemovalId

export const getCurrentVault = createSelector(
  [getVaults],
  (list) => list.find((vault) => vault.current) || null
)

export const getHasMultipleVaults = createSelector([getVaults], (list) => list.length > 1)

export const getOtherVaults = createSelector([getVaults], (list) =>
  list.filter((vault) => !vault.current)
)

export const getCanAddVault = createSelector([getVaults], (list) => list.length < MAX_VAULTS)

export default vaultsSlice.reducer
