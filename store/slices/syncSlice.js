import { createAction, createSlice } from '@reduxjs/toolkit'

const initialPairingStatus = {
  step: 'idle', // idle | pairing | confirmed | syncing | done | error
  message: '',
  progress: 0
}

const initialState = {
  invite: null,
  inviteId: null,
  publicKey: null,
  expiresAt: null,
  isLoading: false,
  error: null,
  showPairingInput: false,
  inviterStatus: { ...initialPairingStatus },
  receiverStatus: { ...initialPairingStatus },
  deviceRemoved: false,
  needsReload: false,
  vaultUpdateRequired: false,
  heldMerge: null,
  heldMergeDismissed: false
}

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    createInvite: (state) => {
      state.isLoading = true
      state.error = null
    },
    regenerateInvite: (state) => {
      state.isLoading = true
      state.error = null
    },
    createInviteSuccess: (state, action) => {
      state.invite = action.payload.invite
      state.inviteId = action.payload.id
      state.publicKey = action.payload.publicKey
      state.expiresAt = action.payload.expires
      state.isLoading = false
      state.error = null
    },
    createInviteFailure: (state, action) => {
      state.isLoading = false
      state.error = action.payload
    },
    clearInviteCode: (state) => {
      state.invite = null
      state.inviteId = null
      state.publicKey = null
      state.expiresAt = null
    },
    resetInvite: (state) => {
      state.invite = null
      state.inviteId = null
      state.publicKey = null
      state.expiresAt = null
      state.isLoading = false
      state.error = null
      state.inviterStatus = { ...initialPairingStatus }
    },
    resetReceiverStatus: (state) => {
      state.receiverStatus = { ...initialPairingStatus }
    },
    setInviterStatus: (state, action) => {
      if (state.inviterStatus.step === 'done' && action.payload.step !== 'done') {
        return
      }
      const isInviteOwner = !!state.invite
      const wasConfirmation = state.inviterStatus.step === 'confirmation'
      const movingPastConfirmation = wasConfirmation && action.payload.step !== 'confirmation'
      if (!isInviteOwner && movingPastConfirmation) {
        state.inviterStatus = { ...initialPairingStatus }
        return
      }
      state.inviterStatus = {
        ...state.inviterStatus,
        ...action.payload
      }
    },
    setReceiverStatus: (state, action) => {
      if (state.receiverStatus.step === 'done' && action.payload.step !== 'done') {
        return
      }
      state.receiverStatus = {
        ...state.receiverStatus,
        ...action.payload
      }
    },
    setShowPairingInput: (state, action) => {
      state.showPairingInput = action.payload
    },
    setDeviceRemoved: (state, action) => {
      state.deviceRemoved = action.payload
    },
    setNeedsReload: (state, action) => {
      state.needsReload = action.payload
    },
    setVaultUpdateRequired: (state, action) => {
      state.vaultUpdateRequired = action.payload
    },
    setHeldMerge: (state, action) => {
      if (action.payload && state.heldMergeDismissed) return
      state.heldMerge = action.payload ? { blocking: action.payload } : null
    },
    dismissHeldMerge: (state) => {
      state.heldMerge = null
      state.heldMergeDismissed = true
    }
  }
})

export const {
  createInvite,
  regenerateInvite,
  createInviteSuccess,
  createInviteFailure,
  clearInviteCode,
  resetInvite,
  resetReceiverStatus,
  setInviterStatus,
  setReceiverStatus,
  setShowPairingInput,
  setDeviceRemoved,
  setNeedsReload,
  setVaultUpdateRequired,
  setHeldMerge,
  dismissHeldMerge
} = syncSlice.actions

export const subscribePairing = createAction('sync/subscribe-pairing')
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ invite: any, mode?: 'add' | 'replace', vaultName?: string }, 'sync/subscribe-pair-user'>} */
export const subscribePairUser = createAction('sync/subscribe-pair-user')
export const confirmPairing = createAction('sync/confirm-pairing')
export const rejectPairing = createAction('sync/reject-pairing')
export const subscribeDeviceStatus = createAction('sync/subscribe-device-status')
export const clearStorage = createAction('sync/clear-storage')
export const fetchHeldMerge = createAction('sync/fetch-held-merge')
export const combineHeldMerge = createAction('sync/combine-held-merge')

export const getSyncState = (state) => state.sync
export const getInvite = (state) => getSyncState(state).invite
export const getInviteExpiresAt = (state) => getSyncState(state).expiresAt
export const getSyncIsLoading = (state) => getSyncState(state).isLoading
export const getInviterStatus = (state) => getSyncState(state).inviterStatus
export const getReceiverStatus = (state) => getSyncState(state).receiverStatus
export const getShowPairingInput = (state) => getSyncState(state).showPairingInput
export const getDeviceRemoved = (state) => getSyncState(state).deviceRemoved
export const getVaultUpdateRequired = (state) => !!getSyncState(state).vaultUpdateRequired
export const getNeedsReload = (state) => getSyncState(state).needsReload
export const getHeldMerge = (state) => getSyncState(state).heldMerge

export default syncSlice.reducer
