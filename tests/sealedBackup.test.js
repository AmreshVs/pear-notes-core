import test from 'brittle'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import http from 'bare-http1'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { BACKUP_ERROR, HYPERDRIVE_URL_PREFIX } from '../constant.js'
import { exportBackup as buildBackup } from '../backend/backupManager.js'
import { CHUNK_PLAIN_BYTES } from '../backend/fileCrypto.js'
import { parseEnvelope } from '../backend/lockCrypto.js'
import { runSealingPass } from '../backend/lockRollout.js'
import { closeLockSession, openNoteBody } from '../backend/lockSession.js'
import { resetAttemptState } from '../backend/noteLockPassword.js'
import * as notesApi from '../backend/notesApi.js'
import { envelopeFiles, envelopeLinks, envelopeRelink } from '../backend/sealedEnvelope.js'
import { mergeFilePath, readPointer, writePointer } from '../backend/vault/layout.js'
import { linksIn } from '../backend/vault/media.js'
import { withTestnet } from './helpers/testnet.js'

const LOCK = 'Lock-pass-123!'
const OTHER_LOCK = 'Other-lock-456!'
const BACKUP = 'Backup-pass-789!'
const SECRET = 'secret plan'
const HEADER_LENGTH = 23
const vaultKey = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')

async function withVault(fill, fn) {
  const storage = path.join(tmpdir(), 'pn-sealed-backup-' + Math.random().toString(36).slice(2))
  await notesApi.ready({ storage, encryption: vaultKey(fill) })
  resetAttemptState()
  try {
    return await fn(notesApi.notesBase)
  } finally {
    closeLockSession()
    await notesApi.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  }
}

async function lockedNote(base, { file = false } = {}) {
  const key = b4a.toString(crypto.randomBytes(32), 'hex')
  let url = ''
  if (file) {
    const link = await base.insertFile({
      key: `${key}/aaa_plan.txt`,
      buffer: b4a.from('plan bytes'),
      path: null
    })
    url = link.replace(base.getHyperdriveAddress(), 'http://hyperdrive/')
  }
  const note = `<p>${SECRET}</p>` + (url ? `<img src="${url.replaceAll('&', '&amp;')}">` : '')
  await base.addNote({
    key,
    value: { title: 'Plan', note: '', folderKey: '', addedAt: 1, updatedAt: 1, locked: false }
  })
  const saved = await notesApi.updateNote({ key, title: 'Plan', note, locked: true })
  if (saved.done !== true) throw new Error('lock save refused')
  return { key, url }
}

// A level-1 device keeps the file plain, so the backup carries a link the pass hasn't keyed yet.
const OLD_DEVICE = { title: 'old phone', localKey: vaultKey('p'), updatedAt: 1, compatLevel: 1 }

async function sourceBackup({ password = LOCK, file = false, settings = null } = {}) {
  return withVault('s', async (base) => {
    if (file) await base.addSyncedDevice({ key: vaultKey('o'), value: OLD_DEVICE })
    if (!(await notesApi.setNoteLockPassword({ password }))) throw new Error('no password')
    const note = await lockedNote(base, { file })
    if (settings)
      await base.updateSettings({ settings: { ...(await base.getSettings()), ...settings } })
    const [keyring] = await notesApi.readKeyrings()
    const opened = await notesApi.openLockSession({ password, returnRootKey: true })
    const buffer = await base.exportBackup(BACKUP)
    return { buffer, ...note, keyringId: keyring.id, rootKey: opened.rootKey }
  })
}

function openMeta(buffer) {
  const header = buffer.subarray(0, HEADER_LENGTH)
  const salt = header.subarray(7, HEADER_LENGTH)
  const key = crypto.pbkdf2Sync(BACKUP, salt, 600000, 32, 'sha256')
  const len = buffer.readUInt32BE(HEADER_LENGTH)
  const at = HEADER_LENGTH + 4
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(at, at + 12))
  decipher.setAAD(b4a.concat([header, b4a.alloc(8)]))
  decipher.setAuthTag(buffer.subarray(at + 12, at + 28))
  const plain = b4a.concat([
    decipher.update(buffer.subarray(at + 28, at + 28 + len)),
    decipher.final()
  ])
  return b4a.toString(plain.subarray(1))
}

const body = async (key) => (await notesApi.getSingleNote({ key })).note

test('sealed backup - v4 holds envelopes and keyrings, never R or plaintext', async (t) => {
  await withTestnet(t)
  const source = await sourceBackup({ file: true })
  t.is(source.buffer.readUInt16BE(4), 4, 'format v4')
  t.ok(source.rootKey, 'root key known to the test')

  const meta = openMeta(source.buffer)
  const payload = JSON.parse(meta)
  t.is(payload.keyrings.length, 1, 'keyring entry exported')
  t.is(payload.keyrings[0].id, source.keyringId, 'the vault keyring')
  const note = payload.notes.find((n) => n.key === source.key)
  t.is(note.value.note, '', 'no body')
  t.alike(envelopeLinks(note.value.sealed), [source.url], 'envelope links exported')
  t.is(payload.attachmentCount, 1, 'its attachment is in the backup')
  t.absent(meta.includes(SECRET), 'no plaintext of the sealed note')
  const rootB64 = b4a.toString(b4a.from(source.rootKey, 'hex'), 'base64')
  t.absent(meta.includes(source.rootKey) || meta.includes(rootB64), 'no R in the metadata')
  t.absent(b4a.toString(source.buffer, 'latin1').includes(SECRET), 'no plaintext in the file')

  const downgraded = b4a.from(source.buffer)
  downgraded.writeUInt16BE(3, 4)
  await withVault('d', async (base) => {
    await t.exception(
      () => base.importBackup({ buffer: downgraded, password: BACKUP }),
      new RegExp(BACKUP_ERROR.INCORRECT_PASSWORD),
      'a v4 file relabelled v3 does not authenticate'
    )
  })
})

test('sealed backup - restore into a vault with no keyring adopts it', async (t) => {
  await withTestnet(t)
  const source = await sourceBackup({ file: true, settings: { theme: 'dark' } })
  await withVault('a', async (base) => {
    await base.updateSettings({
      settings: { lockMethod: 'biometric', lockPasswordSalt: 'aa', lockPasswordHash: 'bb' }
    })
    await base.importBackup({ buffer: source.buffer, password: BACKUP })
    const keyrings = await notesApi.readKeyrings()
    t.alike(
      keyrings.map((k) => [k.id, k.pending === true]),
      [[source.keyringId, false]],
      'the backup keyring is current here'
    )
    const settings = await base.getSettings()
    t.is(settings.theme, 'dark', 'settings restored')
    t.is(settings.lockMethod, 'password', 'lock method is the password')
    t.absent(settings.lockPasswordHash, 'no PBKDF2 verifier next to a keyring')

    const stored = await base.getNote(source.key)
    t.not(envelopeLinks(stored.sealed)[0], source.url, 'envelope link remapped')
    t.alike(envelopeRelink(stored.sealed), { [source.url]: envelopeLinks(stored.sealed)[0] })

    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'same password opens it')
    const html = await body(source.key)
    t.ok(html.includes(SECRET), 'note readable')
    t.ok(html.includes(envelopeLinks(stored.sealed)[0].replaceAll('&', '&amp;')), 'new link')
    t.absent(html.includes(source.url.replaceAll('&', '&amp;')), 'old link gone')

    const saved = await notesApi.updateNote({
      key: source.key,
      title: 'Plan',
      note: html + '<p>more</p>',
      locked: true
    })
    t.is(saved.done, true, 'saved')
    const after = await base.getNote(source.key)
    t.absent(parseEnvelope(after.sealed).relink, 'the save consumed the relink map')
    t.alike(envelopeLinks(after.sealed), envelopeLinks(stored.sealed), 'links unchanged')
  })
})

test('sealed backup - the restore check names old devices before a v4 restore', async (t) => {
  await withTestnet(t)
  const source = await sourceBackup()
  const legacy = await withVault('m', async (base) => {
    await notesApi.insertNote({ title: 'Old', note: `<p>${SECRET}</p>`, locked: true })
    return base.exportBackup(BACKUP)
  })
  await withVault('w', async (base) => {
    await base.addSyncedDevice({
      key: vaultKey('o'),
      value: { title: 'old phone', localKey: vaultKey('q'), updatedAt: 1, appVersion: '1.0.0' }
    })
    const check = await notesApi.checkBackupRestore({ buffer: source.buffer })
    t.is(check.sealed, true, 'a v4 backup is sealed')
    t.alike(
      check.blocking.map((d) => d.title),
      ['old phone'],
      'the old device is named'
    )
    const v3 = await notesApi.checkBackupRestore({ buffer: legacy })
    t.alike(v3, { sealed: false, blocking: [] }, 'a v3 backup has no warning')

    await base.importBackup({ buffer: source.buffer, password: BACKUP })
    const after = await notesApi.checkBackupRestore({ buffer: source.buffer })
    t.alike(after.blocking, [], 'once the vault has a keyring there is nothing to warn about')
  })
  await withVault('u', async () => {
    const check = await notesApi.checkBackupRestore({ buffer: source.buffer })
    t.alike(check, { sealed: true, blocking: [] }, 'an updated vault gets no warning')
  })
})

test('sealed backup - a v3 backup that carries a keyring is caught after the password', async (t) => {
  await withTestnet(t)
  const keyed = await withVault('k', async (base) => {
    if (!(await notesApi.setNoteLockPassword({ password: LOCK }))) throw new Error('no keyring')
    await notesApi.insertNote({ title: 'Plain', note: '<p>plain</p>', locked: false })
    return base.exportBackup(BACKUP)
  })
  const plain = await withVault('p', async (base) => {
    await notesApi.insertNote({ title: 'Plain', note: '<p>plain</p>', locked: false })
    return base.exportBackup(BACKUP)
  })
  t.is(keyed.readUInt16BE(4), 3, 'a keyring with no sealed note is still v3')
  await withVault('w', async (base) => {
    await base.addSyncedDevice({
      key: vaultKey('o'),
      value: { title: 'old phone', localKey: vaultKey('q'), updatedAt: 1, appVersion: '1.0.0' }
    })
    t.alike(
      await notesApi.checkBackupRestore({ buffer: keyed }),
      { sealed: false, blocking: [] },
      'the header alone cannot tell'
    )
    const after = await notesApi.checkBackupRestore({ buffer: keyed, password: BACKUP })
    t.is(after.sealed, true, 'the metadata carries a keyring')
    const filePath = path.join(tmpdir(), 'pn-keyed-' + Math.random().toString(36).slice(2))
    fs.writeFileSync(filePath, keyed)
    t.teardown(() => fs.rmSync(filePath, { force: true }))
    t.is(
      (await notesApi.checkBackupRestore({ filePath, password: BACKUP })).sealed,
      true,
      'read from a file too'
    )
    t.alike(
      after.blocking.map((d) => d.title),
      ['old phone'],
      'the old device is named'
    )
    t.alike(
      await notesApi.checkBackupRestore({ buffer: plain, password: BACKUP }),
      { sealed: false, blocking: [] },
      'no keyring, no warning'
    )
    t.alike(
      await notesApi.checkBackupRestore({ buffer: keyed, password: 'Wrong-pass-000!' }),
      { sealed: false, blocking: [] },
      'a wrong password leaves it to the restore to report'
    )
  })
})

test('sealed backup - restore into the same vault changes nothing', async (t) => {
  await withTestnet(t)
  await withVault('s', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'password set')
    const { key } = await lockedNote(base)
    await base.updateSettings({ settings: { ...(await base.getSettings()), theme: 'light' } })
    const buffer = await base.exportBackup(BACKUP)
    await base.updateSettings({
      settings: { ...(await base.getSettings()), theme: 'dark', lockPasswordHash: 'later' }
    })
    const before = await notesApi.readKeyrings()

    await base.importBackup({ buffer, password: BACKUP })
    t.alike(await notesApi.readKeyrings(), before, 'keyring untouched')
    const settings = await base.getSettings()
    t.is(settings.theme, 'light', 'other settings restored')
    t.is(settings.lockPasswordHash, 'later', 'lock settings are the vault one')
    t.ok((await body(key)).includes(SECRET), 'note still opens')
  })
})

test('sealed backup - different vault, same password: the next unlock adopts it', async (t) => {
  await withTestnet(t)
  const source = await sourceBackup({ settings: { lockPasswordHash: 'stale' } })
  await withVault('b', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'vault has its own keyring')
    const [own] = await notesApi.readKeyrings()
    await base.importBackup({ buffer: source.buffer, password: BACKUP })

    const keyrings = await notesApi.readKeyrings()
    t.is(keyrings.length, 2, 'two entries')
    t.is(keyrings.find((k) => k.id === source.keyringId).pending, true, 'restored one is pending')
    t.absent((await base.getSettings()).lockPasswordHash, 'the vault keeps its lock settings')

    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'unlock')
    t.ok((await body(source.key)).includes(SECRET), 'the typed password opened both')
    await notesApi.whenSealingIdle()
    t.is(parseEnvelope((await base.getNote(source.key)).sealed).r, own.id, 're-wrapped at once')
    t.absent((await base.sealedKeyringIds()).has(source.keyringId), 'nothing left under it')

    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'unlock again')
    t.ok((await body(source.key)).includes(SECRET), 'opens through the vault keyring')
  })
})

test('sealed backup - different password: either password unlocks, the old one takes over', async (t) => {
  await withTestnet(t)
  const source = await sourceBackup({ password: OTHER_LOCK })
  await withVault('c', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'vault keyring')
    const [own] = await notesApi.readKeyrings()
    await base.importBackup({ buffer: source.buffer, password: BACKUP })

    closeLockSession()
    const old = await notesApi.openLockSession({ password: OTHER_LOCK, returnRootKey: true })
    t.ok(old.ok, 'old password unlocks')
    t.is(old.rootKey, '', 'no root key for the biometric item: it would not open new locks')
    t.ok((await body(source.key)).includes(SECRET), 'imported note readable')
    const edit = await notesApi.updateNote({
      key: source.key,
      title: 'Plan',
      note: `<p>${SECRET} edited</p>`,
      locked: true
    })
    t.is(edit.done, true, 'and editable')
    t.is(parseEnvelope((await base.getNote(source.key)).sealed).r, source.keyringId, 'still old')
    t.is((await runSealingPass(base, { quietMs: 0 })).rewrapped, 0, 'no vault R, no take-over')

    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'vault password unlocks')
    t.is((await notesApi.getSingleNote({ key: source.key })).bodyOmitted, true, 'imported shut')
    t.ok((await notesApi.openLockSession({ password: OTHER_LOCK })).ok, 'old password added')
    await notesApi.whenSealingIdle()
    t.is(parseEnvelope((await base.getNote(source.key)).sealed).r, own.id, 'taken over')

    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'vault password')
    t.ok((await body(source.key)).includes('edited'), 'the edit opens with it')
    closeLockSession()
    t.absent((await notesApi.openLockSession({ password: OTHER_LOCK })).ok, 'old one retired')
  })
})

test('sealed backup - a v3 backup restores plaintext locks, sealed on the next unlock', async (t) => {
  await withTestnet(t)
  const legacy = await withVault('l', async (base) => {
    const key = await notesApi.insertNote({ title: 'Old', note: `<p>${SECRET}</p>`, locked: true })
    const buffer = await base.exportBackup(BACKUP)
    return { key, buffer }
  })
  t.is(legacy.buffer.readUInt16BE(4), 3, 'format v3')
  await withVault('e', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'vault keyring')
    await base.importBackup({ buffer: legacy.buffer, password: BACKUP })
    const restored = await base.getNote(legacy.key)
    t.is(restored.locked, true, 'restored locked')
    t.absent(restored.sealed, 'in plaintext, as today')
    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'unlock')
    t.is((await runSealingPass(base, { quietMs: 0 })).sealed, 1, 'sealed by the pass')
    const sealed = await base.getNote(legacy.key)
    t.is(sealed.note, '', 'no plaintext left')
    t.ok((await body(legacy.key)).includes(SECRET), 'opens')
  })
})

test('sealed backup - the pairing merge path carries keyrings without settings', async (t) => {
  await withTestnet(t)
  const capture = await withVault('m', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: OTHER_LOCK }), 'joiner keyring')
    const { key } = await lockedNote(base)
    const passwordHex = vaultKey('h')
    const buffer = await buildBackup(
      base,
      await base.getAllNotes(),
      await base.getAllFolders(),
      {},
      passwordHex
    )
    return { key, buffer, passwordHex }
  })
  await withVault('h', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'host keyring')
    const [{ id: hostKeyring }] = await notesApi.readKeyrings()
    await base.importBackup({ buffer: capture.buffer, password: capture.passwordHex })
    t.is(
      (await notesApi.readKeyrings()).filter((k) => k.pending).length,
      1,
      'joiner keyring pending'
    )
    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'host password')
    t.ok((await notesApi.openLockSession({ password: OTHER_LOCK })).ok, 'joiner password')
    await notesApi.whenSealingIdle()
    t.is(
      parseEnvelope((await base.getNote(capture.key)).sealed).r,
      hostKeyring,
      'merged taken over'
    )
    t.ok((await body(capture.key)).includes(SECRET), 'opens')
  })
})

const OLD_PHONE = { title: 'old phone', localKey: vaultKey('q'), updatedAt: 1, appVersion: '1.0.0' }

async function lockedCapture() {
  return withVault('m', async (base) => {
    if (!(await notesApi.setNoteLockPassword({ password: OTHER_LOCK })))
      throw new Error('no keyring')
    const { key } = await lockedNote(base)
    const merge = await base._captureForMerge(vaultKey('h'))
    return { key, merge, file: fs.readFileSync(mergeFilePath(base.path)) }
  })
}

function holdMerge(base, capture) {
  fs.writeFileSync(mergeFilePath(base.path), capture.file)
  writePointer(base.path, { ...readPointer(base.path), merge: capture.merge })
}

test('held merge - a keyring waits for old devices, then combines by itself', async (t) => {
  await withTestnet(t)
  const capture = await lockedCapture()
  t.is(capture.merge, 'locked', 'a capture with a keyring is marked')
  await withVault('h', async (base) => {
    await base.addSyncedDevice({ key: vaultKey('o'), value: OLD_PHONE })
    holdMerge(base, capture)
    const held = await base.heldMerge()
    t.ok(held.held, 'held')
    t.alike(
      held.blocking.map((d) => d.title),
      ['old phone'],
      'names the old device'
    )

    await base._resumeMerge()
    t.absent(await base.getNote(capture.key), 'nothing merged while held')
    t.absent(await base.hasLockKeyring(), 'no keyring written')
    t.is(readPointer(base.path).merge, 'locked', 'still pending')
    t.ok(fs.existsSync(mergeFilePath(base.path)), 'captured notes kept')

    await base.addSyncedDevice({ key: vaultKey('o'), value: { ...OLD_PHONE, compatLevel: 2 } })
    t.absent((await base.heldMerge()).held, 'released once it updates')
    await base._resumeMerge()
    t.ok((await base.getNote(capture.key))?.sealed, 'merged, still sealed')
    t.ok(await base.hasLockKeyring(), 'keyring adopted')
    t.is(readPointer(base.path).merge, null, 'merge finished')
  })
})

test('held merge - an old device updating finishes the merge with no relaunch', async (t) => {
  await withTestnet(t)
  const capture = await lockedCapture()
  await withVault('h', async (base) => {
    await base.addSyncedDevice({ key: vaultKey('o'), value: OLD_PHONE })
    holdMerge(base, capture)
    t.ok((await base.heldMerge()).held, 'held')
    const changed = new Promise((resolve) => base.once('held-merge-changed', resolve))
    await base.addSyncedDevice({ key: vaultKey('o'), value: { ...OLD_PHONE, compatLevel: 2 } })
    await changed
    t.ok((await base.getNote(capture.key))?.sealed, 'merged')
    t.is(readPointer(base.path).merge, null, 'merge finished')
    t.absent((await base.heldMerge()).held, 'nothing held')
  })
})

test('held merge - combine anyway merges past the old device', async (t) => {
  await withTestnet(t)
  const capture = await lockedCapture()
  await withVault('h', async (base) => {
    await base.addSyncedDevice({ key: vaultKey('o'), value: OLD_PHONE })
    holdMerge(base, capture)
    t.ok((await base.heldMerge()).held, 'held')
    t.ok(await base.combineHeldMerge(), 'combined')
    t.ok((await base.getNote(capture.key))?.sealed, 'merged')
    t.is(readPointer(base.path).merge, null, 'merge finished')
    t.absent(fs.existsSync(mergeFilePath(base.path)), 'capture removed')
    t.absent((await base.heldMerge()).held, 'nothing held')
  })
})

test('held merge - plain captures and keyed vaults are never held', async (t) => {
  await withTestnet(t)
  const capture = await lockedCapture()
  await withVault('h', async (base) => {
    await base.addSyncedDevice({ key: vaultKey('o'), value: OLD_PHONE })
    holdMerge(base, { ...capture, merge: true })
    t.absent((await base.heldMerge()).held, 'a capture with no keyring')
  })
  await withVault('h', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'vault keyring')
    await base.addSyncedDevice({ key: vaultKey('o'), value: OLD_PHONE })
    holdMerge(base, capture)
    t.absent((await base.heldMerge()).held, 'a vault that already gates its devices')
  })
})

const FILE_BYTES = (() => {
  const out = b4a.alloc(CHUNK_PLAIN_BYTES + 77)
  for (let i = 0; i < out.byteLength; i++) out[i] = (i * 31 + 7) & 0xff
  return out
})()
const FILE_MARK = FILE_BYTES.subarray(0, 64)
const img = (link) => `<img src="${link.replaceAll('&', '&amp;')}">`

function serve(base, link) {
  const url = new URL(link.replace(HYPERDRIVE_URL_PREFIX + '/', base.media.address()))
  return new Promise((resolve) => {
    const req = http.request(
      { host: url.hostname, port: Number(url.port), path: url.pathname + url.search },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: b4a.concat(chunks) }))
      }
    )
    req.on('error', () => resolve({ status: 0, body: null }))
    req.end()
  })
}

// A sealed note whose file was encrypted on insert, so its key is in the envelope's f.
async function sealedFileNote(base) {
  const key = await notesApi.insertNote({ title: 'Plan', note: `<p>${SECRET}</p>`, locked: true })
  const { link } = await notesApi.insertFile({ key, fileName: 'plan.bin', buffer: FILE_BYTES })
  const saved = await notesApi.updateNote({
    key,
    title: 'Plan',
    note: `<p>${SECRET}</p>` + img(link),
    locked: true
  })
  if (saved.done !== true || !envelopeFiles((await base.getNote(key)).sealed)[link]) {
    throw new Error('file not keyed')
  }
  return { key, link }
}

test('sealed backup - files of sealed notes travel as ciphertext with f, and restore', async (t) => {
  await withTestnet(t)
  const source = await withVault('s', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'password')
    const note = await sealedFileNote(base)
    return { ...note, buffer: await base.exportBackup(BACKUP) }
  })

  const meta = openMeta(source.buffer)
  const exported = JSON.parse(meta).notes.find((n) => n.key === source.key)
  const f = envelopeFiles(exported.value.sealed)
  t.alike(Object.keys(f), [source.link], 'f exported in the envelope')
  t.absent(meta.includes(SECRET), 'no plaintext of the note')
  t.absent(b4a.includes(source.buffer, FILE_MARK), 'no plaintext of the file in the backup')

  await withVault('r', async (base) => {
    await base.importBackup({ buffer: source.buffer, password: BACKUP })
    const stored = await base.getNote(source.key)
    const [link] = envelopeLinks(stored.sealed)
    t.not(link, source.link, 'link remapped')
    t.alike(envelopeFiles(stored.sealed), { [link]: f[source.link] }, 'f keyed by the new link')
    t.is((await serve(base, link)).status, 404, 'closed: 404')

    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'unlock')
    const open = await serve(base, link)
    t.is(open.status, 200, 'open: served')
    t.alike(open.body, FILE_BYTES, 'decrypted')

    const html = await body(source.key)
    t.alike(linksIn(html), [link], 'the body links the restored file')
    const unlock = await notesApi.updateNote({
      key: source.key,
      title: 'Plan',
      note: html,
      locked: false
    })
    t.is(unlock.done, true, 'lock removed')
    const plain = await base.getNote(source.key)
    t.absent(plain.sealed, 'plain note')
    const [back] = linksIn(plain.note)
    t.ok(back && back !== link, 'a plain copy')
    closeLockSession()
    t.alike((await serve(base, back)).body, FILE_BYTES, 'served plain with the session closed')
  })
})

test('sealed backup - the merge path keeps f through the take-over', async (t) => {
  await withTestnet(t)
  const capture = await withVault('m', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: OTHER_LOCK }), 'joiner keyring')
    const note = await sealedFileNote(base)
    const passwordHex = vaultKey('h')
    const buffer = await buildBackup(
      base,
      await base.getAllNotes(),
      await base.getAllFolders(),
      {},
      passwordHex
    )
    return { ...note, buffer, passwordHex }
  })
  await withVault('h', async (base) => {
    t.ok(await notesApi.setNoteLockPassword({ password: LOCK }), 'host keyring')
    const [{ id: hostKeyring }] = await notesApi.readKeyrings()
    await base.importBackup({ buffer: capture.buffer, password: capture.passwordHex })
    const [link] = envelopeLinks((await base.getNote(capture.key)).sealed)
    t.is((await serve(base, link)).status, 404, 'host password alone: 404')

    t.ok((await notesApi.openLockSession({ password: OTHER_LOCK })).ok, 'joiner password')
    t.alike((await serve(base, link)).body, FILE_BYTES, 'served with the joiner password')
    await notesApi.whenSealingIdle()
    t.is(parseEnvelope((await base.getNote(capture.key)).sealed).r, hostKeyring, 'taken over')
    const row = await base.getNote(capture.key)
    t.ok(envelopeFiles(row.sealed)[link], 'f kept through the re-wrap')

    closeLockSession()
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'host password only')
    t.alike((await serve(base, link)).body, FILE_BYTES, 'served under the vault R')
  })
})

test('sealed backup - restore relink, then the pass, then a stale save keep one keyed file', async (t) => {
  await withTestnet(t)
  const source = await sourceBackup({ file: true })
  await withVault('k', async (base) => {
    await base.importBackup({ buffer: source.buffer, password: BACKUP })
    const restored = envelopeLinks((await base.getNote(source.key)).sealed)[0]
    t.ok((await notesApi.openLockSession({ password: LOCK })).ok, 'unlock')

    await notesApi.whenSealingIdle()
    let row = await base.getNote(source.key)
    const [copy] = Object.keys(envelopeFiles(row.sealed))
    t.ok(copy && copy !== restored, 'into a copy')
    t.alike(
      envelopeRelink(row.sealed),
      { [source.url]: copy, [restored]: copy },
      'both older links lead to the copy'
    )

    const stale = `<p>${SECRET}</p>` + img(source.url) + '<p>typed</p>'
    const saved = await notesApi.updateNote({
      key: source.key,
      title: 'Plan',
      note: stale,
      locked: true
    })
    t.is(saved.done, true, 'a save holding the pre-restore link')
    row = await base.getNote(source.key)
    t.alike(linksIn(openNoteBody(source.key, row.sealed)), [copy], 'lands on the copy')
    t.alike(Object.keys(envelopeFiles(row.sealed)), [copy], 'keyed by the copy')
    t.alike(envelopeLinks(row.sealed), [copy], 'and links nothing else')
  })
})
