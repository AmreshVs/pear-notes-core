import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { SEALED_NOTES_CAP } from '../backend/deviceCaps.js'
import {
  COMPAT_LEVEL,
  GATES,
  MIN_COMPAT_PREF,
  UPDATE_REQUIRED,
  adoptActiveGates,
  deviceCompatLevel,
  gatePrefId,
  gateStatus,
  openGate
} from '../backend/featureGates.js'
import { decode, encode } from '../spec/hyperschema/index.js'
import { withTestnet } from './helpers/testnet.js'

const SEALED = GATES.sealedNotes.minCompatLevel
const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')

async function openBase(t, name) {
  const storage = path.join(tmpdir(), `pn-gates-${name}-${Math.random().toString(36).slice(2)}`)
  const base = new NoteBase({ storage, encryption: key('g'), appVersion: '9.9.9' })
  await base.ready()
  t.teardown(async () => {
    await base.close().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.addSyncedDevice({
    key: key('0'),
    value: { title: 'mac', localKey: base.localKeyHex, updatedAt: 1 }
  })
  await base.publishLocalSwarmKey()
  return base
}

const addDevice = (base, fill, value) =>
  base.addSyncedDevice({
    key: key(fill),
    value: { title: 'device ' + fill, localKey: key(fill), updatedAt: 1, ...value }
  })

test('compat level - the sealedNotes cap maps to the sealedNotes level', (t) => {
  t.is(deviceCompatLevel({}), 0, 'an old device')
  t.is(deviceCompatLevel({ caps: SEALED_NOTES_CAP }), SEALED, 'cap only')
  t.is(deviceCompatLevel({ compatLevel: SEALED + 3 }), SEALED + 3, 'a published level')
  t.is(deviceCompatLevel({ caps: SEALED_NOTES_CAP, compatLevel: 0 }), SEALED, 'the cap wins')
  t.is(deviceCompatLevel({ compatLevel: -2 }), 0, 'junk is ignored')
})

test('compat level - the wire device carries level, version and last seen', (t) => {
  const device = { title: 'Phone', compatLevel: 3, appVersion: '1.2.3', lastSeenAt: 77 }
  const round = decode('@notes/synced-device-schema', encode('@notes/synced-device-schema', device))
  t.is(round.compatLevel, 3)
  t.is(round.appVersion, '1.2.3')
  t.is(round.lastSeenAt, 77)
})

test('feature gates - closed by a low device, open once it updates', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'status')
  const own = await base.findDeviceByLocalKey(base.localKeyHex)
  t.is(own.value.compatLevel, COMPAT_LEVEL, 'this device publishes its level')
  t.is(own.value.appVersion, '9.9.9', 'and its app version')
  t.ok(own.value.lastSeenAt > 0, 'and when it was seen')

  await addDevice(base, '1', { appVersion: '1.0.0', lastSeenAt: 5 })
  const closed = await gateStatus(base, 'sealedNotes')
  t.absent(closed.open, 'an old device closes the gate')
  t.alike(
    closed.blocking,
    [{ key: key('1'), title: 'device 1', compatLevel: 0, appVersion: '1.0.0', lastSeenAt: 5 }],
    'and is listed with what the apps show'
  )
  t.absent((await openGate(base, 'sealedNotes')).open, 'it cannot be opened')
  t.is(await base.getSyncedPref(gatePrefId('sealedNotes')), null, 'no activation record')
  t.is((await base.getSyncedDevice(key('1'))).sealedNotes, false, 'the wire flag says so')

  await addDevice(base, '1', { caps: SEALED_NOTES_CAP })
  t.ok((await gateStatus(base, 'sealedNotes')).open, 'a cap-only device counts')
  await addDevice(base, '1', { compatLevel: SEALED })
  t.ok((await gateStatus(base, 'sealedNotes')).open, 'as does a published level')
  t.is((await base.getSyncedDevice(key('1'))).sealedNotes, true, 'the wire flag follows')
})

test('feature gates - an opened gate stays open after an old device joins', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'activate')
  const opened = await openGate(base, 'sealedNotes')
  t.ok(opened.open, 'opened')
  const record = await base.getSyncedPref(gatePrefId('sealedNotes'))
  t.is(record.byDevice, base.localKeyHex, 'the record names the device')
  t.is(record.compatLevel, SEALED, 'and the level')
  t.is((await base.getSyncedPref(MIN_COMPAT_PREF)).level, SEALED, 'the vault minimum rose')

  await addDevice(base, '2', {})
  t.ok((await gateStatus(base, 'sealedNotes')).open, 'an old device does not close it')

  await base.setSyncedPref(gatePrefId('sealedNotes'), null)
  await base.setSyncedPref(MIN_COMPAT_PREF, { level: 0 })
  t.ok(await base.getSyncedPref(gatePrefId('sealedNotes')), 'the record cannot be removed')
  t.is((await base.getSyncedPref(MIN_COMPAT_PREF)).level, SEALED, 'the minimum cannot fall')
})

test('feature gates - a vault that already has a keyring records the gate', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'adopt')
  await addDevice(base, '3', {})
  await adoptActiveGates(base)
  t.is(await base.getSyncedPref(gatePrefId('sealedNotes')), null, 'nothing without a keyring')
  base.hasLockKeyring = async () => true
  await adoptActiveGates(base)
  t.ok(await base.getSyncedPref(gatePrefId('sealedNotes')), 'recorded despite the old device')
})

test('feature gates - a build below the vault minimum is read-only', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'lock')
  let reported = 0
  base.on('update-required', () => reported++)
  await base.setSyncedPref(MIN_COMPAT_PREF, { level: COMPAT_LEVEL + 1 })
  t.ok(await base.refreshCompatLock(), 'the lock is on')
  t.ok(base.updateRequired)
  t.is(reported, 1, 'reported once')
  const refused = await base.setSyncedPref('anything', { a: 1 }).catch((err) => err.code)
  t.is(refused, UPDATE_REQUIRED, 'writes are refused')
  const before = (await base.findDeviceByLocalKey(base.localKeyHex)).value.lastSeenAt
  base._devicePublishedAt = 0
  await base.publishLocalSwarmKey()
  t.is(
    (await base.findDeviceByLocalKey(base.localKeyHex)).value.lastSeenAt,
    before,
    'the device record is not rewritten'
  )
  t.ok((await base.getAllSyncedDeviceKeys()).length > 0, 'reads still work')
})
