import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { setRPC } from '../rpc.js'
import { VAULT_ERROR } from '../constant.js'
import { watchVaultsSaga } from '../store/sagas/vaultsSaga.js'
import reducer, {
  createVault,
  loadVaults,
  moveToVault,
  renameVault,
  switchVault
} from '../store/slices/vaultsSlice.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function run(rpc, { dev = true } = {}) {
  const previous = globalThis.__PEAR_DEV__
  globalThis.__PEAR_DEV__ = dev
  setRPC(rpc)
  const channel = stdChannel()
  const store = { vaults: reducer(undefined, { type: 'init' }) }
  const dispatched = []
  const task = runSaga(
    {
      channel,
      dispatch: (action) => {
        dispatched.push(action.type)
        store.vaults = reducer(store.vaults, action)
        channel.put(action)
      },
      getState: () => store
    },
    watchVaultsSaga
  )
  return {
    store,
    dispatched,
    put: (action) => channel.put(action),
    stop: () => {
      task.cancel()
      globalThis.__PEAR_DEV__ = previous
    }
  }
}

const LIST = [
  { id: 'a', name: '', addedAt: 0, current: true },
  { id: 'b', name: 'Shared', addedAt: 1, current: false }
]

test('vaults saga - release builds load vaults now that multi-vault has shipped', async (t) => {
  let listed = 0
  const app = run(
    {
      commandListVaults: async () => {
        listed++
        return { data: LIST }
      }
    },
    { dev: false }
  )
  app.put(loadVaults())
  await wait(50)
  t.is(listed, 1, 'the backend is asked outside dev builds')
  t.alike(app.store.vaults.list, LIST, 'and the vaults reach the store')
  app.stop()
})

test('vaults saga - switching enters the vault and reloads the list', async (t) => {
  let current = 'a'
  const app = run({
    commandListVaults: async () => ({
      data: LIST.map((v) => ({ ...v, current: v.id === current }))
    }),
    commandSwitchVault: async ({ id }) => {
      current = id
      return { done: true }
    }
  })
  app.put(loadVaults())
  await wait(50)
  t.is(app.store.vaults.list.length, 2, 'listed')

  app.put(switchVault({ id: 'b' }))
  t.is(app.store.vaults.pending, 'switch', 'pending while the backend works')
  await wait(500)
  t.is(app.store.vaults.pending, null, 'no longer pending')
  t.ok(app.store.vaults.enteredAt > 0, 'the apps are told to rebuild')
  t.is(app.store.vaults.list.find((v) => v.current)?.id, 'b', 'the list follows')
  app.stop()
})

test('vaults saga - a refused change reports its code and enters nothing', async (t) => {
  const app = run({
    commandListVaults: async () => ({ data: LIST }),
    commandCreateVault: async () => ({ done: false, code: VAULT_ERROR.MAX_VAULTS }),
    commandRenameVault: async () => ({ done: true })
  })
  app.put(createVault({ name: 'Too many' }))
  await wait(500)
  t.is(app.store.vaults.error, VAULT_ERROR.MAX_VAULTS, 'error code kept for the UI')
  t.is(app.store.vaults.failedAction, 'create', 'and which action failed')
  t.is(app.store.vaults.enteredAt, 0, 'no rebuild')

  app.put(renameVault({ id: 'b', name: 'Family' }))
  await wait(100)
  t.is(app.store.vaults.error, null, 'a new action clears the old error')
  t.is(app.store.vaults.enteredAt, 0, 'a rename does not rebuild the app')
  t.is(app.store.vaults.pending, null, 'and is not left pending')
  app.stop()
})

test('vaults saga - moving sends the selection and rebuilds the app', async (t) => {
  let sent = null
  const app = run({
    commandListVaults: async () => ({ data: LIST }),
    commandMoveToVault: async (args) => {
      sent = args
      return { done: true, moved: 2 }
    }
  })
  app.put(moveToVault({ targetId: 'b', noteKeys: ['n1'], folderKeys: ['f1'] }))
  t.is(app.store.vaults.pending, 'move', 'pending while moving')
  await wait(500)
  t.alike(sent, { targetId: 'b', noteKeys: ['n1'], folderKeys: ['f1'] }, 'selection sent')
  t.ok(app.store.vaults.enteredAt > 0, 'the app rebuilds after the vault round trip')
  app.stop()
})
