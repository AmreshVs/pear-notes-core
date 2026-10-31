import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import HyperDB from 'hyperdb'
import { createApply } from '../backend/vault/apply.js'
import * as viewStore from '../backend/viewStore.js'
import viewDefinition from '../spec/db/index.js'

const host = { async addWriter() {}, async removeWriter() {}, removeable: () => true }
const addNote = (key) => ({
  value: {
    type: 'add_note',
    at: 1,
    key,
    value: { title: key, note: `<p>${key}</p>`, updatedAt: 1 }
  },
  from: { key: b4a.alloc(32).fill('w') },
  length: 1
})

function timeout() {
  const err = new Error('REQUEST_TIMEOUT')
  err.code = 'REQUEST_TIMEOUT'
  return err
}

async function setup(t) {
  const dir = path.join(tmpdir(), 'pear-notes-apply-tx-' + Math.random().toString(36).slice(7))
  const store = new Corestore(dir)
  const core = store.get({ name: 'view' })
  await core.ready()
  const db = HyperDB.bee(core, viewDefinition, { extension: false, autoUpdate: true })
  await db.ready()
  t.teardown(async () => {
    await db.close().catch(() => {})
    await store.close().catch(() => {})
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  })
  return { db, base: { apply: createApply() } }
}

function failReadOf(db, key) {
  const state = { failing: true }
  const makeTransaction = db.transaction.bind(db)
  db.transaction = () => {
    const tx = makeTransaction()
    const get = tx.get.bind(tx)
    tx.get = async (collection, query) => {
      if (state.failing && query?.key === key) throw timeout()
      return get(collection, query)
    }
    return tx
  }
  return state
}

test('an aborted apply leaves no write behind for the next apply to flush', async (t) => {
  const { db, base } = await setup(t)
  const fault = failReadOf(db, 'b')

  await t.exception(base.apply([addNote('a'), addNote('b')], db, host), /REQUEST_TIMEOUT/)
  t.absent(await viewStore.getNote(db, 'a'), 'nothing from the aborted apply is visible')

  fault.failing = false
  await base.apply([addNote('c')], db, host)

  t.ok(await viewStore.getNote(db, 'c'), 'the next apply landed')
  t.absent(
    await viewStore.getNote(db, 'a'),
    'and it did NOT carry the aborted write with it - no fork'
  )
})

test('control: writing straight onto the view DOES leak the aborted write', async (t) => {
  const { db, base } = await setup(t)
  let failing = true

  const get = db.get.bind(db)
  db.transaction = () => ({
    get: async (collection, query) => {
      if (failing && query?.key === 'b') throw timeout()
      return get(collection, query)
    },
    find: (...args) => db.find(...args),
    insert: (...args) => db.insert(...args),
    delete: (...args) => db.delete(...args),
    flush: () => db.flush(),
    close: async () => {}
  })

  await t.exception(base.apply([addNote('a'), addNote('b')], db, host), /REQUEST_TIMEOUT/)
  failing = false
  await base.apply([addNote('c')], db, host)

  t.ok(await viewStore.getNote(db, 'c'), 'the next apply landed')
  t.ok(
    await viewStore.getNote(db, 'a'),
    'LEAKED: the aborted write was flushed by the next apply - this is the fork'
  )
})
