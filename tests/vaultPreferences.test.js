import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { MEDIA_SYNC_PAUSED_KEY } from '../constant.js'
import * as notesApi from '../backend/notesApi.js'
import { withTestnet } from './helpers/testnet.js'

test('notesApi - the saved selection belongs to each vault once there are two', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pn-vault-prefs-' + Math.random().toString(36).slice(2))
  const encryption = b4a.toString(b4a.alloc(32).fill(7), 'hex')
  t.teardown(async () => {
    await notesApi.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await notesApi.ready({ storage, encryption })

  await notesApi.updatePreference({ key: 'selectedFolder', value: 'journal' })
  t.is(
    await notesApi.preferenceBase.get('selectedFolder'),
    'journal',
    'one vault keeps the original preference key'
  )

  const firstId = notesApi.listVaults()[0].id
  const created = await notesApi.createVault({ name: 'Shared' })
  t.ok(created.done, 'second vault created')
  t.is(await notesApi.getPreference({ key: 'selectedFolder' }), null, 'a new vault starts clean')
  await notesApi.updatePreference({ key: 'selectedFolder', value: 'recipes' })
  await notesApi.updatePreference({ key: MEDIA_SYNC_PAUSED_KEY, value: 'true' })

  await notesApi.switchVault({ id: firstId })
  t.is(
    await notesApi.getPreference({ key: 'selectedFolder' }),
    'journal',
    'the original vault still reads what it saved before vaults were listed'
  )
  await notesApi.updatePreference({ key: 'selectedFolder', value: 'diary' })
  t.is(await notesApi.getPreference({ key: 'selectedFolder' }), 'diary', 'first vault has its own')
  t.is(
    await notesApi.getPreference({ key: MEDIA_SYNC_PAUSED_KEY }),
    'true',
    'device preferences are shared'
  )

  await notesApi.switchVault({ id: created.id })
  t.is(
    await notesApi.getPreference({ key: 'selectedFolder' }),
    'recipes',
    'switching back restores that vault selection'
  )
})

test('notesApi - a new vault lists this device', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pn-vault-device-' + Math.random().toString(36).slice(2))
  const encryption = b4a.toString(b4a.alloc(32).fill(8), 'hex')
  t.teardown(async () => {
    await notesApi.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await notesApi.ready({ storage, encryption })
  await notesApi.checkAndInsertLocalDevice('Mac')
  t.is((await notesApi.notesBase.getAllSyncedDeviceKeys()).length, 1, 'first vault lists it')
  await notesApi.updatePreference({ key: 'isSynced', value: 'true' })

  const firstId = notesApi.listVaults()[0].id
  await notesApi.createVault({ name: 'Shared' })
  await notesApi.checkAndInsertLocalDevice('Mac')
  const keys = await notesApi.notesBase.getAllSyncedDeviceKeys()
  t.is(keys.length, 1, 'the new vault lists this device too')
  const device = await notesApi.notesBase.getSyncedDevice(keys[0])
  t.is(device?.localKey, notesApi.notesBase.localKeyHex, 'with this vault writer key')
  t.is(await notesApi.getPreference({ key: 'isSynced' }), null, 'a new vault is not linked yet')

  await notesApi.switchVault({ id: firstId })
  await notesApi.checkAndInsertLocalDevice('Mac')
  t.is(
    (await notesApi.notesBase.getAllSyncedDeviceKeys()).length,
    1,
    'rerunning in an existing vault adds no duplicate'
  )
  t.is(await notesApi.getPreference({ key: 'isSynced' }), 'true', 'first vault stays linked')
})
