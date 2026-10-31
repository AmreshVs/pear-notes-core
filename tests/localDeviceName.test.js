import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import * as notesApi from '../backend/notesApi.js'

const storage = path.join(tmpdir(), 'pn-localdev-' + Math.random().toString(36).slice(7))
const encryption = b4a.toString(b4a.alloc(32).fill('test-encryption-key'), 'hex')

const localDevice = async () => {
  const localKeyHex = b4a.toString(notesApi.notesBase.localKey, 'hex')
  for (const key of await notesApi.getAllSyncedDeviceKeys()) {
    const d = await notesApi.getSyncedDevice({ key })
    if (d?.localKey === localKeyHex) return { ...d, key }
  }
  return null
}

test('local device is stored under the OS device name', async (t) => {
  if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  await notesApi.ready({ storage, encryption })

  await notesApi.checkAndInsertLocalDevice("Amresh's MacBook Pro")
  t.is((await localDevice())?.title, "Amresh's MacBook Pro", 'first insert uses the real name')

  // Second boot must not duplicate or rewrite anything.
  await notesApi.checkAndInsertLocalDevice("Amresh's MacBook Pro")
  t.is((await localDevice())?.title, "Amresh's MacBook Pro", 'idempotent on the next launch')

  // A name the user typed themselves must survive a later boot.
  const before = await localDevice()
  await notesApi.updateSyncedDevice({ key: before.key, title: 'Work Laptop' })
  await new Promise((r) => setTimeout(r, 1500))
  await notesApi.checkAndInsertLocalDevice("Amresh's MacBook Pro")
  t.is((await localDevice())?.title, 'Work Laptop', 'a user-chosen name is never overwritten')

  await notesApi.destroy()
  fs.rmSync(storage, { recursive: true, force: true })
})
