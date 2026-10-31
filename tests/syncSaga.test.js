import test from 'brittle'
import { EventEmitter } from 'events'
import { runSaga, stdChannel } from 'redux-saga'

import { PAIRING_INVITE_REMOVED } from '../constant.js'
import { setRPC } from '../rpc.js'
import { watchSyncSaga } from '../store/sagas/syncSaga.js'
import syncReducer, { createInviteSuccess, subscribePairing } from '../store/slices/syncSlice.js'

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function startHarness() {
  const stream = new EventEmitter()
  stream.destroy = () => stream.emit('close')

  setRPC({
    commandSubscribePairing: async () => stream,
    commandUpdatePreference: async () => ({})
  })

  const channel = stdChannel()
  let state = { sync: syncReducer(undefined, { type: 'test/init' }) }
  const dispatch = (action) => {
    state = { sync: syncReducer(state.sync, action) }
    channel.put(action)
  }
  const task = runSaga({ channel, dispatch, getState: () => state }, watchSyncSaga)

  return {
    dispatch,
    task,
    emit: (data) => stream.emit('data', { data }),
    getState: () => state.sync
  }
}

const anInvite = {
  invite: 'pear-notes://pairing/abc',
  id: 'invite-id',
  publicKey: 'pk',
  expires: Date.now() + 60000
}

test('sync saga - a completed link stops the invite countdown but keeps the linked screen', async (t) => {
  const harness = startHarness()
  harness.dispatch(subscribePairing())
  harness.dispatch(createInviteSuccess(anInvite))
  await settle()

  harness.emit({ step: 'confirmation', progress: 70 })
  await settle()
  t.is(harness.getState().invite, anInvite.invite, 'the code is still on offer mid-pairing')

  harness.emit({ step: 'done', progress: 100 })
  await settle()

  t.absent(harness.getState().invite, 'the used invite is no longer shown')
  t.absent(harness.getState().expiresAt, 'so nothing is left to count down')
  t.is(harness.getState().inviterStatus.step, 'done', 'the linked overlay stays up')

  harness.task.cancel()
})

test('sync saga - an invite consumed on another device stops counting down here', async (t) => {
  const harness = startHarness()
  harness.dispatch(subscribePairing())
  harness.dispatch(createInviteSuccess(anInvite))
  await settle()

  harness.emit({ step: 'confirmation', progress: 70 })
  await settle()

  harness.emit({ step: 'idle', reason: PAIRING_INVITE_REMOVED })
  await settle()

  t.absent(harness.getState().invite, 'the invite another device used is dropped')
  t.absent(harness.getState().expiresAt, 'so nothing is left to count down')
  t.is(harness.getState().inviterStatus.step, 'idle', 'the confirmation prompt is dismissed')

  harness.task.cancel()
})

test('sync saga - an ordinary idle leaves a fresh invite alone', async (t) => {
  const harness = startHarness()
  harness.dispatch(subscribePairing())
  harness.dispatch(createInviteSuccess(anInvite))
  await settle()

  harness.emit({ step: 'idle' })
  await settle()

  t.is(harness.getState().invite, anInvite.invite, 'the invite is still usable')
  t.is(harness.getState().expiresAt, anInvite.expires, 'and still counting down')

  harness.task.cancel()
})
