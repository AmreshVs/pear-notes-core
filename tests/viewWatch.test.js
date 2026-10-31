import test from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import HyperDB from 'hyperdb'
import definition from '../spec/db/index.js'
import { watchHyperdbChanges, watchHyperdbKey } from '../backend/viewWatch.js'
import { watchHyperbeeChanges, watchHyperbeeKey } from './helpers/hyperbeeWatch.js'

const FOLDERS = '@notes/folders'
const QUIET_MS = 200
const UPDATE_TIMEOUT_MS = 3000

async function openStore(t) {
  const storage = path.join(
    tmpdir(),
    'pear-notes-view-watch-' + Math.random().toString(36).slice(7)
  )
  const store = new Corestore(storage)
  t.teardown(async () => {
    await store.close().catch(() => {})
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  })
  const core = store.get({ name: 'view' })
  await core.ready()
  return { store, core }
}

const ADAPTERS = {
  'hyperbee-native': {
    identicalRewriteFires: true,
    async make(t) {
      const { store, core } = await openStore(t)
      const bee = new Hyperbee(core, {
        keyEncoding: 'utf-8',
        valueEncoding: 'json',
        extension: false
      })
      await bee.ready()
      return {
        store,
        core,
        put: (key, value) => bee.put(key, value),
        watchKey: (key) => bee.getAndWatch(key),
        watchAll: async () => bee.watch(),
        title: (node) => node?.value?.title ?? null,
        listeners: () => bee._entryWatchers.length + bee._watchers.length,
        close: () => bee.close()
      }
    }
  },
  hyperbee: {
    identicalRewriteFires: true,
    async make(t) {
      const { store, core } = await openStore(t)
      const bee = new Hyperbee(core, {
        keyEncoding: 'utf-8',
        valueEncoding: 'json',
        extension: false
      })
      await bee.ready()
      return {
        store,
        core,
        put: (key, value) => bee.put(key, value),
        watchKey: (key) => watchHyperbeeKey(bee, key),
        watchAll: () => watchHyperbeeChanges(bee),
        title: (node) => node?.value?.title ?? null,
        listeners: () => core.listenerCount('append'),
        close: () => bee.close()
      }
    }
  },
  hyperdb: {
    identicalRewriteFires: false,
    async make(t) {
      const { store, core } = await openStore(t)
      const db = HyperDB.bee(core, definition, { extension: false, autoUpdate: true })
      await db.ready()
      return {
        store,
        core,
        put: async (key, value) => {
          await db.insert(FOLDERS, { key, ...value })
          await db.flush()
        },
        watchKey: (key) => watchHyperdbKey(db, FOLDERS, { key }),
        watchAll: () => watchHyperdbChanges(db),
        title: (node) => node?.value?.title ?? null,
        listeners: () => (db.watchers ? db.watchers.size : 0),
        close: () => db.close()
      }
    }
  }
}

function nextUpdate(watcher) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no update')), UPDATE_TIMEOUT_MS)
    watcher.once('update', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function countUpdates(watcher, action) {
  let count = 0
  const onUpdate = () => count++
  watcher.on('update', onUpdate)
  await action()
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  watcher.off('update', onUpdate)
  return count
}

for (const [name, adapter] of Object.entries(ADAPTERS)) {
  test(`${name} - the current record is on node before ready() resolves`, async (t) => {
    const view = await adapter.make(t)
    await view.put('f1', { title: 'first' })
    const watcher = await view.watchKey('f1')
    t.is(view.title(watcher.node), 'first', 'subscribeNote serves the body from this')
    await watcher.close()
  })

  test(`${name} - a key that does not exist yet starts null, then fills in`, async (t) => {
    const view = await adapter.make(t)
    const watcher = await view.watchKey('later')
    t.is(watcher.node, null, 'no record yet')
    const updated = nextUpdate(watcher)
    await view.put('later', { title: 'now here' })
    await updated
    t.is(view.title(watcher.node), 'now here', 'the new record is on node')
    await watcher.close()
  })

  test(`${name} - a change to the watched key fires once`, async (t) => {
    const view = await adapter.make(t)
    await view.put('f1', { title: 'v1' })
    const watcher = await view.watchKey('f1')
    const n = await countUpdates(watcher, () => view.put('f1', { title: 'v2' }))
    t.is(n, 1, 'exactly one update')
    t.is(view.title(watcher.node), 'v2', 'and node is current')
    await watcher.close()
  })

  test(`${name} - a change to a DIFFERENT key does not fire`, async (t) => {
    const view = await adapter.make(t)
    await view.put('f1', { title: 'mine' })
    const watcher = await view.watchKey('f1')
    const n = await countUpdates(watcher, async () => {
      await view.put('f2', { title: 'someone else' })
      await view.put('f3', { title: 'and another' })
    })
    t.is(n, 0, 'no update for unrelated writes')
    await watcher.close()
  })

  test(`${name} - rewriting an identical value: ${adapter.identicalRewriteFires ? 'fires' : 'does not fire'}`, async (t) => {
    const view = await adapter.make(t)
    await view.put('f1', { title: 'same' })
    const watcher = await view.watchKey('f1')
    const n = await countUpdates(watcher, () => view.put('f1', { title: 'same' }))
    t.is(n, adapter.identicalRewriteFires ? 1 : 0)
    await watcher.close()
  })

  test(`${name} - a burst of writes never loses the last one`, async (t) => {
    const view = await adapter.make(t)
    await view.put('f1', { title: 'v0' })
    const watcher = await view.watchKey('f1')
    let updates = 0
    watcher.on('update', () => updates++)
    for (let i = 1; i <= 20; i++) await view.put('f1', { title: 'v' + i })
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
    t.ok(updates >= 1, `fired (${updates} updates for 20 writes)`)
    t.is(view.title(watcher.node), 'v20', 'node is the LAST write')
    await watcher.close()
  })

  test(`${name} - close() stops updates and detaches every listener`, async (t) => {
    const view = await adapter.make(t)
    const baseline = view.listeners()
    const watcher = await view.watchKey('f1')
    const all = await view.watchAll()
    t.ok(view.listeners() > baseline, 'watchers attached')

    await watcher.close()
    await all.close()
    t.is(view.listeners(), baseline, 'no listener left behind (the watcher leak)')

    let fired = 0
    watcher.on('update', () => fired++)
    all.on('update', () => fired++)
    await view.put('f1', { title: 'after close' })
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
    t.is(fired, 0, 'nothing fires after close')
  })

  test(`${name} - the whole-view watcher fires on any write`, async (t) => {
    const view = await adapter.make(t)
    const all = await view.watchAll()
    const updated = nextUpdate(all)
    await view.put('anything', { title: 'x' })
    await updated
    t.pass('fired')
    await all.close()
  })

  test(`${name} - closing the view ends the watcher, and close() stays safe`, async (t) => {
    const view = await adapter.make(t)
    await view.put('f1', { title: 'v1' })
    const watcher = await view.watchKey('f1')
    let errors = 0
    watcher.on('error', () => errors++)

    await view.close()
    await view.core.close()
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS))

    await watcher.close()
    t.ok(watcher.closed, 'watcher is closed')
    t.is(errors, 0, 'a shutdown is not reported as an error')
  })
}
