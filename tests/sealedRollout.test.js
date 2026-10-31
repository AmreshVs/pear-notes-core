import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { ACTIVITY_LOG_ENABLED_KEY } from '../constant.js'
import NoteBase from '../backend/NoteBase.js'
import { SEALED_NOTES_CAP } from '../backend/deviceCaps.js'
import { COMPAT_LEVEL, gateStatus } from '../backend/featureGates.js'
import { parseEnvelope } from '../backend/lockCrypto.js'
import {
  createFirstKeyring,
  SealingPass,
  runSealingPass,
  sealEnvelope
} from '../backend/lockRollout.js'
import {
  closeLockSession,
  isLockSessionOpen,
  openNoteBody,
  openWithPassword
} from '../backend/lockSession.js'
import { resetAttemptState } from '../backend/noteLockPassword.js'
import * as notesApi from '../backend/notesApi.js'
import { withTestnet } from './helpers/testnet.js'

const PASSWORD = 'Rollout-pass-123!'
const HOUR = 60 * 60 * 1000
const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')
const dir = (name) =>
  path.join(tmpdir(), `pn-sealed-rollout-${name}-${Math.random().toString(36).slice(2)}`)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check, timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true
    await wait(200)
  }
  return false
}

async function pair(host, joiner, name) {
  const invite = await host.createInvite()
  let hostDone = false
  await host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  let result = null
  await joiner.subscribePairUser(
    (status) => {
      if (['done', 'error', 'rejected', 'expired', 'merge_failed'].includes(status.step)) {
        result = status.step
      }
    },
    invite.invite,
    name
  )
  await until(() => hostDone)
  return result
}

async function pairedPair(t) {
  const devices = []
  for (const name of ['mac', 'phone']) {
    const storage = dir(name)
    const base = new NoteBase({ storage, encryption: key(name[0]) })
    await base.ready()
    devices.push({ storage, base })
  }
  t.teardown(async () => {
    closeLockSession()
    for (const d of devices) {
      await d.base.close().catch(() => {})
      fs.rmSync(d.storage, { recursive: true, force: true })
    }
  })
  const [a, b] = devices.map((d) => d.base)
  await a.addSyncedDevice({
    key: key('0'),
    value: { title: 'mac', localKey: a.localKeyHex, updatedAt: 1 }
  })
  t.is(await pair(a, b, 'phone'), 'done', 'phone paired')
  t.ok(
    await until(async () => (await b.getAllSyncedDeviceKeys()).length === 2),
    'both devices listed on the phone'
  )
  return [a, b]
}

const lockedRow = (note, updatedAt = Date.now() - HOUR) => ({
  title: 'Locked',
  note,
  folderKey: '',
  addedAt: 1,
  updatedAt,
  locked: true,
  pinned: false
})

test('sealed rollout - the gate waits for every listed device', { timeout: 240000 }, async (t) => {
  await withTestnet(t)
  closeLockSession()
  const [mac, phone] = await pairedPair(t)

  const joined = await mac.findDeviceByLocalKey(phone.localKeyHex)
  t.is(joined.value.caps, SEALED_NOTES_CAP, 'the pairing host records the joiner cap')
  await mac.publishLocalSwarmKey()
  t.ok((await gateStatus(mac, 'sealedNotes')).open, 'every device has the cap')
  const own = await mac.findDeviceByLocalKey(mac.localKeyHex)
  t.is(own.value.caps, SEALED_NOTES_CAP, 'this device claims the cap')
  t.is(own.value.compatLevel, COMPAT_LEVEL, 'and its compat level')

  const { caps, compatLevel, ...old } = joined.value
  await mac.updateSyncedDevice({ key: joined.key, value: old })
  const gate = await gateStatus(mac, 'sealedNotes')
  t.absent(gate.open, 'a device without the cap closes the gate')
  t.alike(
    gate.blocking.map(({ key, title }) => ({ key, title })),
    [{ key: joined.key, title: 'phone' }],
    'and is named'
  )
  t.is((await mac.getSyncedDevice(joined.key)).sealedNotes, false, 'the apps see it on the wire')

  t.ok(
    await until(async () => !(await phone.findDeviceByLocalKey(phone.localKeyHex))?.value.caps),
    'the phone sees its record without the cap'
  )
  phone._devicePublishedAt = 0
  await phone.publishLocalSwarmKey()
  t.ok(
    await until(async () => (await gateStatus(mac, 'sealedNotes')).open),
    'updating the device reopens it'
  )
  t.is((await mac.getSyncedDevice(joined.key)).sealedNotes, true, 'and the wire flag follows')
})

test(
  'sealed rollout - two devices creating keyrings at once keep both, notes move to the lowest',
  { timeout: 240000 },
  async (t) => {
    await withTestnet(t)
    closeLockSession()
    const [mac, phone] = await pairedPair(t)

    await mac.swarm.suspend()
    await phone.swarm.suspend()
    const [macEntry, phoneEntry] = await Promise.all([
      createFirstKeyring(mac, PASSWORD),
      createFirstKeyring(phone, PASSWORD)
    ])
    t.not(macEntry.id, phoneEntry.id, 'two different keyrings')
    await mac.addNote({
      key: 'from-mac',
      value: { ...lockedRow(''), sealed: sealEnvelope(macEntry.id, 'from-mac', '<p>mac</p>', '') }
    })
    await phone.addNote({
      key: 'from-phone',
      value: {
        ...lockedRow(''),
        sealed: sealEnvelope(phoneEntry.id, 'from-phone', '<p>phone</p>', '')
      }
    })
    await mac.swarm.resume()
    await phone.swarm.resume()

    const synced = async (base) =>
      (await base.getLockKeyrings()).length === 2 &&
      !!(await base.getNote('from-mac')) &&
      !!(await base.getNote('from-phone'))
    t.ok(await until(async () => (await synced(mac)) && (await synced(phone))), 'both synced')

    const lowest = macEntry.id < phoneEntry.id ? macEntry : phoneEntry
    const moved = lowest === macEntry ? 'from-phone' : 'from-mac'
    closeLockSession()
    t.ok(await openWithPassword(await mac.getLockKeyrings(), PASSWORD), 'the next unlock')
    const result = await runSealingPass(mac, { quietMs: 0 })
    t.is(result.rewrapped, 1, 'the note under the other keyring is re-wrapped')

    t.ok(
      await until(async () => parseEnvelope((await phone.getNote(moved)).sealed).r === lowest.id),
      'both devices hold it under the lowest id'
    )
    const body = openNoteBody(moved, (await phone.getNote(moved)).sealed)
    t.is(body, moved === 'from-mac' ? '<p>mac</p>' : '<p>phone</p>', 'its body is intact')
    t.is((await phone.getLockKeyrings()).length, 2, 'both entries survive')
    t.absent((await phone.getSettings())?.lockPasswordHash, 'no PBKDF2 verifier left')
  }
)

test(
  'sealed rollout - a plain save racing the seal is not lost',
  { timeout: 240000 },
  async (t) => {
    await withTestnet(t)
    closeLockSession()
    const [mac, phone] = await pairedPair(t)
    await mac.addNote({ key: 'n', value: lockedRow('<p>before</p>') })
    t.ok(await until(async () => !!(await phone.getNote('n'))), 'phone has the locked note')

    await mac.swarm.suspend()
    await phone.swarm.suspend()
    await createFirstKeyring(mac, PASSWORD)
    t.is((await runSealingPass(mac, { quietMs: 0 })).sealed, 1, 'mac seals the note')
    const typed = { ...lockedRow('<p>typed on the phone</p>', Date.now()), title: 'Edited' }
    await phone.addNote({ key: 'n', value: typed })
    const phonePass = new SealingPass(() => phone)
    t.teardown(() => phonePass.stop())
    phone.on('sealed-save-rejected', () => phonePass.start())
    await mac.swarm.resume()
    await phone.swarm.resume()

    const settled = async (base) => {
      const row = await base.getNote('n')
      return !!row?.sealed && openNoteBody('n', row.sealed) === '<p>typed on the phone</p>'
    }
    t.ok(
      await until(async () => {
        if (!(await mac.hasLockKeyring()) || !(await phone.hasLockKeyring())) return false
        await runSealingPass(mac, { quietMs: 0 })
        return (await settled(mac)) && (await settled(phone))
      }),
      'whichever write is ordered first, the typed text ends up sealed on both devices'
    )
    const row = await phone.getNote('n')
    t.is(row.note, '', 'no plaintext in the view')
    t.is(row.title, 'Edited', 'the rest of the save survives')
    t.is(phone.rejectedSealedSaves().length, 0, 'nothing left in memory')
  }
)

const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-rollout-api-' + Math.random().toString(36).slice(2, 9))
const encryption = b4a.toString(b4a.alloc(32).fill('sealed-rollout-key'), 'hex')

async function withApi(fn) {
  const storage = storagePath()
  await notesApi.ready({ storage, encryption })
  resetAttemptState()
  try {
    await fn(notesApi.notesBase)
  } finally {
    closeLockSession()
    await notesApi.destroy().catch(() => {})
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  }
}

test('sealed rollout - an old device keeps the PBKDF2 password until it updates', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await base.addSyncedDevice({
      key: key('7'),
      value: { title: 'Old laptop', localKey: key('8'), updatedAt: 1 }
    })
    t.ok(await notesApi.setNoteLockPassword({ password: PASSWORD }), 'password set')
    t.is((await notesApi.readKeyrings()).length, 0, 'no keyring while a device is outdated')
    t.ok((await base.getSettings()).lockPasswordHash, 'the PBKDF2 verifier is used instead')
    t.absent(isLockSessionOpen(), 'no lock session')

    const verified = await notesApi.verifyNoteLockPassword({ password: PASSWORD })
    t.ok(verified.valid, 'the password still unlocks')
    t.is((await notesApi.readKeyrings()).length, 0, 'still no keyring')
    const opened = await notesApi.openLockSession({ password: PASSWORD })
    t.is(opened.reason, 'DEVICES_OUTDATED', 'the session RPC says why')
    t.is((await notesApi.openLockSession({ password: 'wrong-pass' })).reason, 'WRONG_PASSWORD')

    const old = await base.getRawSyncedDevice(key('7'))
    await base.updateSyncedDevice({ key: key('7'), value: { ...old, caps: SEALED_NOTES_CAP } })
    resetAttemptState()
    t.ok((await notesApi.verifyNoteLockPassword({ password: PASSWORD })).valid, 'next unlock')
    t.is((await notesApi.readKeyrings()).length, 1, 'the password moved to a keyring')
    const settings = await base.getSettings()
    t.absent(settings.lockPasswordHash, 'PBKDF2 hash deleted')
    t.absent(settings.lockPasswordSalt, 'PBKDF2 salt deleted')
    t.ok(isLockSessionOpen(), 'the session is open')
  })
})

test('sealed rollout - the session RPC migrates a PBKDF2 password', async (t) => {
  await withTestnet(t)
  await withApi(async () => {
    t.ok(await notesApi.setNoteLockPassword({ password: PASSWORD }), 'first password')
    const [entry] = await notesApi.readKeyrings()
    t.ok(entry, 'no outdated device, so a keyring at once')
  })
  await withApi(async (base) => {
    await base.addSyncedDevice({
      key: key('7'),
      value: { title: 'Old laptop', localKey: key('8'), updatedAt: 1 }
    })
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    await base.removeSyncedDevice(key('7'))
    const opened = await notesApi.openLockSession({ password: PASSWORD })
    t.ok(opened.ok, 'opens with the PBKDF2 password once the gate allows')
    t.is((await notesApi.readKeyrings()).length, 1, 'and creates the keyring')
    t.is(
      opened.reason,
      'CHANGE_SUGGESTED',
      'and suggests a new password, as history holds the hash'
    )
    t.ok(await notesApi.setNoteLockPassword({ password: 'Fresh-pass-456!' }), 'changed')
    await notesApi.closeLockSession()
    const reopened = await notesApi.openLockSession({ password: 'Fresh-pass-456!' })
    t.ok(reopened.ok, 'the new password opens')
    t.is(reopened.reason, '', 'and no change is suggested any more')
  })
})

test('sealed rollout - existing locked notes are sealed in the background', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })
    await base.addNote({ key: 'old', value: lockedRow('<p>old secret</p>') })
    await base.addNote({ key: 'recent', value: lockedRow('<p>recent</p>', Date.now()) })
    const before = (await base.getActivity({ noteKey: 'old' })).entries.length

    t.ok(await notesApi.setNoteLockPassword({ password: PASSWORD }), 'password set')
    t.ok(await until(async () => !!(await base.getNote('old'))?.sealed, 10000), 'old note sealed')
    const old = await base.getNote('old')
    t.is(old.note, '', 'no plaintext left in the view')
    t.is((await notesApi.getSingleNote({ key: 'old' })).note, '<p>old secret</p>', 'still opens')
    t.absent((await base.getNote('recent')).sealed, 'a note edited moments ago waits')
    const after = (await base.getActivity({ noteKey: 'old' })).entries.length
    t.is(after, before, 'sealing records no activity')
  })
})

test('sealed rollout - our own plain save over a sealed note is re-sealed', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: PASSWORD }), 'password set')
    const noteKey = await notesApi.insertNote({ title: 'L', note: '<p>a</p>', locked: true })
    t.ok((await base.getNote(noteKey)).sealed, 'sealed on insert')

    const typed = lockedRow('<p>typed before the keyring arrived</p>', Date.now() + 1000)
    await base.addNote({ key: noteKey, value: typed })
    t.ok(
      await until(async () => {
        const row = await base.getNote(noteKey)
        return openNoteBody(noteKey, row.sealed) === '<p>typed before the keyring arrived</p>'
      }, 10000),
      'the rejected save comes back sealed'
    )
    t.is((await base.getNote(noteKey)).note, '', 'no plaintext in the view')
  })
})
