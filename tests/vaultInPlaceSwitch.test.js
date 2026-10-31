import test from 'brittle'
import { EventEmitter } from 'events'

import { setRPC } from '../rpc.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check, timeoutMs = 3000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (check()) return true
    await wait(20)
  }
  return false
}

// A fake backend: every subscription gets a stream the test can push into,
// tagged with the vault that was open when it was opened.
function fakeBackend({ closeOnSwitch = true } = {}) {
  const backend = { vault: 'a', streams: [] }
  const open = (name, args) => {
    const stream = new EventEmitter()
    stream.vault = backend.vault
    stream.name = name
    stream.args = args
    stream.destroy = () => {
      if (stream.closed) return
      stream.closed = true
      stream.emit('close')
    }
    backend.streams.push(stream)
    return stream
  }
  backend.live = (name, vault = backend.vault) =>
    backend.streams.filter((s) => s.name === name && s.vault === vault && !s.closed)
  const handlers = {
    commandChore: async () => ({ hyperdriveServerAddress: `http://127.0.0.1:${backend.vault}` }),
    commandListVaults: async () => ({
      data: [
        { id: 'a', name: 'Personal', addedAt: 1, current: backend.vault === 'a' },
        { id: 'b', name: 'Shared', addedAt: 2, current: backend.vault === 'b' }
      ]
    }),
    commandSwitchVault: async ({ id }) => {
      if (closeOnSwitch) {
        for (const stream of backend.streams) if (stream.vault !== id) stream.destroy()
      }
      backend.vault = id
      return { done: true }
    },
    commandGetSettings: async () => ({
      data: backend.vault === 'a' ? { theme: 'dark', lockPasswordHash: 'secret' } : {}
    })
  }
  const rpc = new Proxy(handlers, {
    get(target, name) {
      if (name in target) return target[name]
      if (typeof name === 'string' && name.startsWith('commandSubscribe')) {
        return async (args) => open(name, args)
      }
      return async () => ({})
    }
  })
  return { backend, rpc }
}

test('vault switch in place - old vault state and late stream data never reach the new vault', async (t) => {
  const previousDev = globalThis.__PEAR_DEV__
  globalThis.__PEAR_DEV__ = true
  t.teardown(() => {
    globalThis.__PEAR_DEV__ = previousDev
  })
  const { backend, rpc } = fakeBackend()
  setRPC(rpc)

  const { store } = await import('../store/store.js')
  const { appReady } = await import('../store/slices/uiSlice.js')
  const { switchVault } = await import('../store/slices/vaultsSlice.js')
  const { setLocalAiNotice } = await import('../store/slices/localAiSlice.js').catch(() => ({}))

  store.dispatch(appReady())
  t.ok(await until(() => backend.live('commandSubscribeNoteKeys').length === 1), 'subscribed')
  t.ok(await until(() => store.getState().vaults.list.length === 2), 'vault list loaded')
  if (setLocalAiNotice) store.dispatch(setLocalAiNotice('kept'))
  const localAiBefore = store.getState().localAi

  const [keysA] = backend.live('commandSubscribeNoteKeys')
  keysA.emit('data', { data: ['private-note'] })
  t.ok(
    await until(() =>
      backend
        .live('commandSubscribeNote')
        .some((s) => s.args?.key === 'private-note' && s.listenerCount('data') > 0)
    ),
    'per-note subscription listening'
  )
  const [noteA] = backend.live('commandSubscribeNote')
  noteA.emit('data', { data: { title: 'Private', note: 'x', updatedAt: 1 } })
  t.ok(await until(() => !!store.getState().notes.notesData['private-note']), 'vault A note shown')
  t.ok(await until(() => store.getState().settings.lockPasswordHash === 'secret'), 'A settings')

  store.dispatch(switchVault({ id: 'b' }))
  t.ok(await until(() => store.getState().vaults.enteredAt > 0), 'switched')
  t.is(backend.vault, 'b', 'backend switched')

  keysA.emit('data', { data: ['private-note', 'late-note'] })
  noteA.emit('data', { data: { title: 'Late', note: 'y', updatedAt: 2 } })
  await wait(100)

  const state = store.getState()
  t.alike(state.notes.notesKeys, [], 'no note keys from vault A')
  t.is(Object.keys(state.notes.notesData).length, 0, 'no note bodies from vault A, even late ones')
  t.is(state.settings.lockPasswordHash, '', 'vault A settings are gone')
  t.is(state.ui.hyperdriveServerAddress, 'http://127.0.0.1:b', 'the new blob server address')
  t.is(state.vaults.list.find((v) => v.current)?.id, 'b', 'the vault list follows')
  t.alike(state.localAi, localAiBefore, 'device state survives')

  t.ok(await until(() => backend.live('commandSubscribeNoteKeys', 'b').length >= 1), 'resubscribed')
  const keysB = backend.live('commandSubscribeNoteKeys', 'b').at(-1)
  await until(() => keysB.listenerCount('data') > 0)
  keysB.emit('data', { data: ['shared-note'] })
  t.ok(
    await until(() => store.getState().notes.notesKeys.includes('shared-note')),
    'vault B notes arrive'
  )
  t.absent(store.getState().notes.notesKeys.includes('private-note'), 'and only those')
  t.absent(
    backend.streams.some((s) => s.vault === 'a' && !s.closed),
    'every vault A stream was closed'
  )
})

test('vault switch in place - a screen subscription left open drops the old vault data', async (t) => {
  const previousDev = globalThis.__PEAR_DEV__
  globalThis.__PEAR_DEV__ = true
  t.teardown(() => {
    globalThis.__PEAR_DEV__ = previousDev
  })
  const { backend, rpc } = fakeBackend({ closeOnSwitch: false })
  setRPC(rpc)

  const { store } = await import('../store/store.js')
  const { switchVault } = await import('../store/slices/vaultsSlice.js')
  const { subscribeStorageInfo } = await import('../store/slices/storageSlice.js')

  store.dispatch(subscribeStorageInfo())
  t.ok(
    await until(() =>
      backend.live('commandSubscribeStorageInfo').some((s) => s.listenerCount('data') > 0)
    ),
    'storage screen subscribed'
  )
  const [storageA] = backend.live('commandSubscribeStorageInfo')
  store.dispatch(switchVault({ id: backend.vault === 'a' ? 'b' : 'a' }))
  const enteredBefore = store.getState().vaults.enteredAt
  t.ok(await until(() => store.getState().vaults.enteredAt > enteredBefore), 'switched')
  t.absent(storageA.closed, 'the old stream is still open, as a slow backend could leave it')

  storageA.emit('data', { data: [{ key: 'private-note', bytes: 10 }], totalBlobBytes: 10 })
  await wait(100)
  t.is(store.getState().storage.totalBlobBytes, 0, 'its data does not reach the new vault')
  t.alike(store.getState().storage.notesStorageInfo, [], 'nor its note list')
})

test('vault join as another vault - the joined vault starts from a clean state', async (t) => {
  const previousDev = globalThis.__PEAR_DEV__
  globalThis.__PEAR_DEV__ = true
  t.teardown(() => {
    globalThis.__PEAR_DEV__ = previousDev
  })
  const { backend, rpc } = fakeBackend()
  setRPC(rpc)

  const { store } = await import('../store/store.js')
  const { initApp } = await import('../store/slices/uiSlice.js')
  const { subscribePairUser } = await import('../store/slices/syncSlice.js')

  store.dispatch(initApp())
  const start = backend.vault
  t.ok(
    await until(() =>
      backend.live('commandSubscribeNoteKeys', start).some((s) => s.listenerCount('data') > 0)
    ),
    'subscribed'
  )
  const keys = backend.live('commandSubscribeNoteKeys', start).at(-1)
  keys.emit('data', { data: ['before-join'] })
  t.ok(
    await until(() => store.getState().notes.notesKeys.includes('before-join')),
    'the current vault notes are shown'
  )

  store.dispatch(subscribePairUser({ invite: 'x'.repeat(64), mode: 'add', vaultName: 'Shared' }))
  t.ok(
    await until(() =>
      backend.live('commandSubscribePairUser').some((s) => s.listenerCount('data') > 0)
    ),
    'joining'
  )
  const [pairing] = backend.live('commandSubscribePairUser')
  const joined = start === 'a' ? 'b' : 'a'
  for (const stream of backend.streams) if (stream !== pairing) stream.destroy()
  backend.vault = joined
  const enteredBefore = store.getState().vaults.enteredAt
  pairing.emit('data', { data: { step: 'done', progress: 100 } })

  t.ok(
    await until(() => store.getState().vaults.enteredAt > enteredBefore),
    'treated as a vault change'
  )
  t.absent(
    store.getState().notes.notesKeys.includes('before-join'),
    'nothing from the previous vault remains'
  )
  t.is(pairing.args?.mode, 'add', 'the backend was asked to add the vault')
  t.ok(
    await until(() => backend.live('commandSubscribeNoteKeys', joined).length > 0),
    'subscribed to the joined vault'
  )
})
