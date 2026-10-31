import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { RECENTLY_DELETED_KEY } from '../constant.js'
import {
  KEYRING_PREF_PREFIX,
  currentKeyring,
  openBody,
  parseEnvelope,
  rootKeyFromHex
} from '../backend/lockCrypto.js'
import { closeLockSession, isLockSessionOpen } from '../backend/lockSession.js'
import { resetAttemptState } from '../backend/noteLockPassword.js'
import * as notesApi from '../backend/notesApi.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('sealed-notes-key'), 'hex')
const PASSWORD = 'Lock-pass-123!'
const BODY = '<p>secret plan</p><img src="http://hyperdrive/?key=abc&amp;blob=1-2-3-4">'

const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-sealed-' + Math.random().toString(36).slice(2, 9))

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

async function lockedNote(title = 'Locked') {
  const key = await notesApi.insertNote({ title, note: '<p>draft</p>', folderKey: 'folder-a' })
  const result = await notesApi.updateNote({ key, title, note: BODY, locked: true })
  return { key, result }
}

test('sealed notes - set password creates the keyring and seals locked saves', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await base.updateSettings({
      settings: { lockMethod: 'password', lockPasswordSalt: 'aa', lockPasswordHash: 'bb' }
    })
    t.ok(await notesApi.setNoteLockPassword({ password: PASSWORD }), 'password set')

    const settings = await base.getSettings()
    t.absent(settings.lockPasswordSalt, 'PBKDF2 salt deleted')
    t.absent(settings.lockPasswordHash, 'PBKDF2 hash deleted')
    t.is(settings.lockMethod, 'password', 'method is password')
    const keyrings = await notesApi.readKeyrings()
    t.is(keyrings.length, 1, 'one keyring entry')
    t.ok(isLockSessionOpen(), 'setting the password opens the session')

    const { key, result } = await lockedNote()
    t.is(result.done, true, 'locking save is accepted')
    const stored = await base.getNote(key)
    t.is(stored.note, '', 'no plaintext body in the view')
    t.absent(stored.sealed.includes('secret plan'), 'envelope holds no plaintext')
    t.is(parseEnvelope(stored.sealed).r, keyrings[0].id, 'sealed under the keyring')
    t.alike(
      parseEnvelope(stored.sealed).links,
      ['http://hyperdrive/?key=abc&blob=1-2-3-4'],
      'attachment links stay plaintext'
    )

    const open = await notesApi.getSingleNote({ key })
    t.is(open.note, BODY, 'open session serves plaintext')
    t.is(open.sealed, true, 'flagged sealed')
    t.absent(open.bodyOmitted, 'body not omitted')

    await notesApi.closeLockSession()
    const closed = await notesApi.getSingleNote({ key })
    t.is(closed.note, '', 'closed session serves no body')
    t.is(closed.sealed, true, 'flagged sealed')
    t.is(closed.bodyOmitted, true, 'body omitted')
  })
})

test('sealed notes - pin, move, rename, trash and restore keep the envelope', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key } = await lockedNote('Before')
    const sealed = (await base.getNote(key)).sealed
    await notesApi.closeLockSession()

    const pin = await notesApi.updateNote({
      key,
      title: 'Before',
      note: '',
      locked: true,
      pinned: true
    })
    t.is(pin.done, true, 'pin with the session closed is accepted')
    const move = await notesApi.updateNote({
      key,
      title: 'Before',
      note: '',
      folderKey: 'folder-b',
      locked: true,
      pinned: true
    })
    t.is(move.done, true, 'move is accepted')
    const rename = await notesApi.updateNote({
      key,
      title: 'After',
      note: '',
      locked: true,
      pinned: true
    })
    t.is(rename.done, true, 'rename is accepted')

    let stored = await base.getNote(key)
    t.is(stored.sealed, sealed, 'envelope carried unchanged')
    t.is(stored.title, 'After', 'title changed')
    t.is(stored.folderKey, 'folder-b', 'folder changed')
    t.is(stored.pinned, true, 'pinned')

    t.ok(await base.trashNote(key), 'trashed')
    stored = await base.getNote(key)
    t.is(stored.folderKey, RECENTLY_DELETED_KEY, 'in the trash')
    t.is(stored.sealed, sealed, 'envelope survives trash')
    await base.restoreNote(key)
    stored = await base.getNote(key)
    t.is(stored.sealed, sealed, 'envelope survives restore')

    t.is((await notesApi.openLockSession({ password: PASSWORD })).ok, true, 'session reopens')
    t.is((await notesApi.getSingleNote({ key })).note, BODY, 'body still opens after all of it')
  })
})

test('sealed notes - writes that cannot be sealed are refused', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key } = await lockedNote()
    const plain = await notesApi.insertNote({ title: 'Plain', note: '<p>plain</p>' })
    await notesApi.closeLockSession()

    const edit = await notesApi.updateNote({
      key,
      title: 'Locked',
      note: '<p>typed</p>',
      locked: true
    })
    t.is(edit.done, false, 'editing a sealed body with the session closed is refused')
    t.is(edit.reason, 'LOCK_SESSION_CLOSED', 'and says why')
    const unlock = await notesApi.updateNote({ key, title: 'Locked', note: '', locked: false })
    t.is(unlock.done, false, 'removing the lock with the session closed is refused')
    const lock = await notesApi.updateNote({
      key: plain,
      title: 'Plain',
      note: '<p>plain</p>',
      locked: true
    })
    t.is(lock.done, false, 'locking a note with the session closed is refused')
    t.is((await base.getNote(plain)).locked, false, 'the plain note was not locked')
    t.ok((await base.getNote(key)).sealed, 'the sealed note is untouched')
  })
})

test('sealed notes - removing the lock unseals; a plain write over a sealed note is dropped', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key } = await lockedNote()
    const other = await lockedNote('Other')

    const before = await base.getNote(other.key)
    await base.addNote({
      key: other.key,
      value: { ...before, sealed: undefined, note: '<p>clobber</p>', locked: false }
    })
    const after = await base.getNote(other.key)
    t.is(after.sealed, before.sealed, 'apply drops a plain write without unseal')
    t.is(after.note, '', 'no plaintext slipped in')

    const unlock = await notesApi.updateNote({ key, title: 'Locked', note: '', locked: false })
    t.is(unlock.done, true, 'removing the lock with the session open is accepted')
    const stored = await base.getNote(key)
    t.absent(stored.sealed, 'envelope gone')
    t.is(stored.note, BODY, 'body decrypted from the envelope when the frontend sent none')
    t.is(stored.locked, false, 'unlocked')
  })
})

test('sealed notes - session RPCs, throttling, root key path and password change', async (t) => {
  await withTestnet(t)
  await withApi(async () => {
    t.is(
      (await notesApi.openLockSession({ password: PASSWORD })).reason,
      'NO_KEYRING',
      'nothing to open yet'
    )
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key } = await lockedNote()
    await notesApi.closeLockSession()

    const wrong = await notesApi.openLockSession({ password: 'nope-nope-1' })
    t.is(wrong.ok, false, 'wrong password refused')
    t.is(wrong.reason, 'WRONG_PASSWORD', 'with a reason')

    const opened = await notesApi.openLockSession({ password: PASSWORD, returnRootKey: true })
    t.is(opened.ok, true, 'right password opens')
    t.is(opened.rootKey.length, 64, 'R returned only because it was asked for')
    t.is(
      (await notesApi.openLockSession({ password: PASSWORD })).rootKey,
      '',
      'not returned otherwise'
    )
    await notesApi.closeLockSession()

    t.is(
      (await notesApi.openLockSession({ rootKey: 'ab'.repeat(32) })).ok,
      false,
      'a wrong root key is refused'
    )
    t.is(
      (await notesApi.openLockSession({ rootKey: opened.rootKey })).ok,
      true,
      'the biometric path opens with R'
    )
    t.is((await notesApi.getSingleNote({ key })).note, BODY, 'and reads the note')
    await notesApi.closeLockSession()

    const verified = await notesApi.verifyNoteLockPassword({ password: PASSWORD })
    t.is(verified.valid, true, 'the old verify RPC opens the session once a keyring exists')
    t.ok(isLockSessionOpen(), 'session is open')
    t.is(opened.reason, '', 'a keyring made with a lock password suggests no change')

    const [oldEntry] = await notesApi.readKeyrings()
    t.absent(
      await notesApi.setNoteLockPassword({ password: 'weak' }),
      'the backend refuses a weak password'
    )
    t.ok(await notesApi.setNoteLockPassword({ password: 'New-pass-456!' }), 'password changed')
    await notesApi.whenSealingIdle()
    const keyrings = await notesApi.readKeyrings()
    const current = currentKeyring(keyrings)
    t.is(keyrings.length, 2, 'the change adds a keyring')
    t.not(current.id, oldEntry.id, 'with a new root key, now current')
    t.ok(keyrings.find((entry) => entry.id === oldEntry.id).pending, 'the old entry is retired')
    const resealed = (await notesApi.notesBase.getNote(key)).sealed
    t.is(parseEnvelope(resealed).r, current.id, 'the note moved to the new keyring')
    const oldRoot = rootKeyFromHex(opened.rootKey)
    t.is(
      openBody(new Map([[oldEntry.id, oldRoot]]), key, resealed),
      null,
      'the old root key cannot read the note any more'
    )
    await notesApi.closeLockSession()
    const stale = await notesApi.openLockSession({ rootKey: opened.rootKey })
    t.is(stale.ok, false, 'a biometric key from before the change is refused')
    t.is(stale.reason, 'WRONG_KEY', 'so the app asks for the password')
    t.is(
      (await notesApi.openLockSession({ password: PASSWORD })).ok,
      false,
      'old password no longer opens'
    )
    t.is(
      (await notesApi.openLockSession({ password: 'New-pass-456!' })).ok,
      true,
      'new password opens'
    )
    t.is(
      (await notesApi.getSingleNote({ key })).note,
      BODY,
      'existing note opens under the new password'
    )

    await notesApi.closeLockSession()
    t.absent(
      await notesApi.setNoteLockPassword({ password: 'Other-pass-789!' }),
      'cannot change the password without the session'
    )
    for (let i = 0; i < 5; i++) await notesApi.openLockSession({ password: 'bad-guess-' + i })
    const throttled = await notesApi.openLockSession({ password: 'New-pass-456!' })
    t.is(throttled.ok, false, 'throttled after repeated failures')
    t.ok(throttled.retryAfter > 0, 'with a retry delay')
    resetAttemptState()
  })
})

test('sealed notes - apply keeps keyring entries a set', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const [entry] = await notesApi.readKeyrings()
    const id = KEYRING_PREF_PREFIX + entry.id

    await base.setSyncedPref(id, null)
    t.is((await notesApi.readKeyrings()).length, 1, 'a delete is dropped')
    await base.setSyncedPref(id, { ...entry, id: 'f'.repeat(32) })
    t.is((await notesApi.readKeyrings())[0].id, entry.id, 'an entry under another id is dropped')
    await base.setSyncedPref(id, { junk: true })
    t.alike((await notesApi.readKeyrings())[0], entry, 'a malformed entry is dropped')
  })
})

test('sealed notes - suspend lets the last save land before closing the session', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key } = await lockedNote()

    const suspending = notesApi.suspendServices()
    const saved = await notesApi.updateNote({
      key,
      title: 'Locked',
      note: '<p>typed before the background</p>',
      locked: true
    })
    t.is(saved.done, true, 'a save sent while suspending lands')
    t.ok(parseEnvelope((await base.getNote(key)).sealed), 'sealed')
    await suspending
    t.absent(isLockSessionOpen(), 'then the session closes')
    await notesApi.resumeServices()

    t.ok((await notesApi.openLockSession({ password: PASSWORD })).ok, 'unlock')
    const again = notesApi.suspendServices()
    await notesApi.resumeServices()
    await again
    t.ok(isLockSessionOpen(), 'a resume during the grace keeps the session open')
  })
})
