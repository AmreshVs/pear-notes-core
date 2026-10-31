import test from 'brittle'
import b4a from 'b4a'
import http from 'bare-http1'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { MIN_COMPAT_PREF, gatePrefId, gateStatus } from '../backend/featureGates.js'
import { CHUNK_PLAIN_BYTES, cipherLength } from '../backend/fileCrypto.js'
import { runSealingPass } from '../backend/lockRollout.js'
import { blobIdOf, closeLockSession, fileKeyFor, openNoteBody } from '../backend/lockSession.js'
import { resetAttemptState } from '../backend/noteLockPassword.js'
import * as notesApi from '../backend/notesApi.js'
import { envelopeFiles, envelopeRelink } from '../backend/sealedEnvelope.js'
import { linksIn, rangeOf } from '../backend/vault/media.js'
import * as viewStore from '../backend/viewStore.js'
import { HYPERDRIVE_URL_PREFIX } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('sealed-files-key'), 'hex')
const PASSWORD = 'Lock-pass-123!'

const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-sealed-files-' + Math.random().toString(36).slice(2, 9))

async function withApi(fn) {
  const storage = storagePath()
  await notesApi.ready({ storage, encryption })
  resetAttemptState()
  try {
    await fn(notesApi.notesBase, storage)
  } finally {
    closeLockSession()
    await notesApi.destroy().catch(() => {})
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  }
}

function bytes(length, seed = 3) {
  const out = b4a.alloc(length)
  for (let i = 0; i < length; i++) out[i] = (i * 17 + seed) & 0xff
  return out
}

const img = (link) => `<img src="${link.replace(/&/g, '&amp;')}">`

function get(base, link, range = null) {
  const url = new URL(link.replace(HYPERDRIVE_URL_PREFIX + '/', base.media.address()))
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: url.hostname,
        port: Number(url.port),
        path: url.pathname + url.search,
        method: 'GET',
        headers: range ? { range } : {}
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: b4a.concat(chunks) })
        )
      }
    )
    req.on('error', (error) => resolve({ status: 0, error }))
    req.end()
  })
}

async function storedBytes(base, link) {
  const file = base.media.files.find((f) => f.url === link)
  return file ? base.media.drive.get(file.path) : null
}

async function sealedNote(title = 'Vault') {
  const key = await notesApi.insertNote({ title, note: '<p>secret</p>', locked: true })
  return key
}

test('sealed files - a file inserted into a sealed note is encrypted and keyed on save', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await sealedNote()
    t.ok((await base.getNote(key)).sealed, 'note is sealed')

    const plain = bytes(2 * CHUNK_PLAIN_BYTES + 321)
    const { link } = await notesApi.insertFile({ key, fileName: 'scan.pdf', buffer: plain })
    t.ok(link, 'insert answers with a link')
    const stored = await storedBytes(base, link)
    t.is(stored.byteLength, cipherLength(plain.byteLength), 'stored as chunks')
    t.absent(b4a.includes(stored, plain.subarray(0, 64)), 'no plaintext in the drive')

    const before = await get(base, link)
    t.is(before.status, 200, 'served before the note is saved (held key)')
    t.alike(before.body, plain, 'as plaintext')

    const plainNote = await notesApi.insertNote({ title: 'Open', note: '' })
    const plainFile = bytes(1000, 9)
    const { link: openLink } = await notesApi.insertFile({
      key: plainNote,
      fileName: 'open.png',
      buffer: plainFile
    })
    t.alike(await storedBytes(base, openLink), plainFile, 'a plain note keeps plain files')

    const body = '<p>secret</p>' + img(link)
    const result = await notesApi.updateNote({ key, title: 'Vault', note: body, locked: true })
    t.is(result.done, true, 'save accepted')
    const f = envelopeFiles((await base.getNote(key)).sealed)
    t.alike(Object.keys(f), [link], 'the save wrapped the held key into f')

    await notesApi.closeLockSession()
    t.is((await get(base, link)).status, 404, 'closed: the sealed file answers 404')
    t.is((await get(base, openLink)).status, 200, 'closed: plain files still serve')
    t.is(
      (await notesApi.insertFile({ key, fileName: 'x.png', buffer: bytes(10) })).reason,
      'LOCK_SESSION_CLOSED',
      'closed: inserting into a sealed note is refused'
    )

    const opened = await notesApi.openLockSession({ password: PASSWORD })
    t.ok(opened.ok, 'session reopened')
    t.is(fileKeyFor(blobIdOf(link)), null, 'no file key mapped yet')
    const after = await get(base, link, `bytes=${CHUNK_PLAIN_BYTES - 1}-${CHUNK_PLAIN_BYTES}`)
    t.is(after.status, 206, 'open again: served from f without opening the note first')
    t.alike(
      after.body,
      plain.subarray(CHUNK_PLAIN_BYTES - 1, CHUNK_PLAIN_BYTES + 1),
      'across a chunk edge'
    )

    const resaved = await notesApi.updateNote({
      key,
      title: 'Vault',
      note: body + '<p>more</p>',
      locked: true
    })
    t.is(resaved.done, true, 're-save accepted')
    t.alike(envelopeFiles((await base.getNote(key)).sealed), f, 'f survives a later save')
  })
})

test('sealed files - streamed insert with progress into a sealed note', async (t) => {
  await withTestnet(t)
  await withApi(async (base, storage) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await sealedNote()
    const plain = bytes(3 * CHUNK_PLAIN_BYTES)
    const file = path.join(storage, 'upload.bin')
    fs.writeFileSync(file, plain)

    let last = 0
    const { link } = await notesApi.insertFileWithProgress(
      { key, fileName: 'upload.bin', path: file },
      (sent) => (last = sent),
      null
    )
    t.is(last, plain.byteLength, 'progress counts plaintext bytes')
    t.is(
      (await storedBytes(base, link)).byteLength,
      cipherLength(plain.byteLength),
      'stored as chunks'
    )
    const res = await get(base, link, `bytes=${plain.byteLength - 1}-`)
    t.alike(res.body, plain.subarray(plain.byteLength - 1), 'last byte decrypts')

    const empty = await notesApi.insertFile({ key, fileName: 'empty.txt', buffer: b4a.alloc(0) })
    t.is((await storedBytes(base, empty.link)).byteLength, 16, 'an empty file is one tag')
    const emptyRes = await get(base, empty.link)
    t.is(emptyRes.status, 200)
    t.is(emptyRes.body.byteLength, 0, 'and serves as empty')

    await notesApi.updateNote({
      key,
      title: 'Vault',
      note: img(link) + img(empty.link),
      locked: true
    })
    t.alike(
      Object.keys(envelopeFiles((await base.getNote(key)).sealed)).sort(),
      [link, empty.link].sort(),
      'both files keyed'
    )

    await notesApi.closeLockSession()
    await t.exception(
      notesApi.insertFileWithProgress({ key, fileName: 'late.bin', path: file }, () => {}, null),
      /LOCK_SESSION_CLOSED/,
      'closed: streamed insert refused'
    )
  })
})

async function tombstoned(base, link) {
  const id = rangeOf(link)?.id
  for await (const { key } of viewStore.mediaTombstones(await base.autobaseDb())) {
    if (key === id) return true
  }
  return false
}

async function filesOf(base, noteKey) {
  await base.media._indexFiles()
  return base.media.files.filter((file) => file.noteKey === noteKey)
}

const hex = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')

test('sealed files - the gate keeps files plain until every device is level 2', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    const old = { title: 'old phone', localKey: hex('p'), updatedAt: 1, compatLevel: 1 }
    await base.addSyncedDevice({ key: hex('d'), value: old })
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await sealedNote()

    const first = bytes(500)
    const { link: plainLink } = await notesApi.insertFile({ key, fileName: 'a.png', buffer: first })
    t.alike(await storedBytes(base, plainLink), first, 'closed gate: the insert stays plain')
    await notesApi.updateNote({ key, title: 'Vault', note: img(plainLink), locked: true })
    const closedPass = await runSealingPass(base, { quietMs: 0 })
    t.is(closedPass.encrypted, 0, 'and the pass encrypts nothing')
    t.is(closedPass.waiting, 0, 'nor lists it as waiting')
    t.is(await base.getSyncedPref(gatePrefId('sealedFiles')), null, 'the gate is not recorded')
    t.ok(
      (await gateStatus(base, 'sealedFiles')).blocking.some((d) => d.title === 'old phone'),
      'the old device is named'
    )

    await base.addSyncedDevice({ key: hex('d'), value: { ...old, compatLevel: 2 } })
    const second = bytes(500, 7)
    const { link: sealedLink } = await notesApi.insertFile({
      key,
      fileName: 'b.png',
      buffer: second
    })
    t.is(
      (await storedBytes(base, sealedLink)).byteLength,
      cipherLength(500),
      'once it updates, inserts are encrypted'
    )
    t.ok(await base.getSyncedPref(gatePrefId('sealedFiles')), 'the gate is recorded')
    t.is((await base.getSyncedPref(MIN_COMPAT_PREF)).level, 2, 'and the vault minimum is 2')

    await notesApi.updateNote({
      key,
      title: 'Vault',
      note: img(plainLink) + img(sealedLink),
      locked: true
    })
    const openPass = await runSealingPass(base, { quietMs: 0 })
    t.is(openPass.encrypted, 1, 'the pass now encrypts the earlier plain file')
    t.is(Object.keys(envelopeFiles((await base.getNote(key)).sealed)).length, 2, 'both keyed')

    await base.addSyncedDevice({ key: hex('d'), value: old })
    t.ok((await gateStatus(base, 'sealedFiles')).open, 'an old device does not close it again')
  })
})

test('sealed files - locking encrypts the files, unlocking decrypts them back', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await notesApi.insertNote({ title: 'Trip', note: '' })
    const plain = bytes(CHUNK_PLAIN_BYTES + 99)
    const { link: old } = await notesApi.insertFile({ key, fileName: 'photo.png', buffer: plain })
    await notesApi.updateNote({ key, title: 'Trip', note: img(old) })

    t.is(
      (await notesApi.updateNote({ key, title: 'Trip', note: img(old), locked: true })).done,
      true
    )
    await notesApi.whenSealingIdle()
    let row = await base.getNote(key)
    const [copy] = Object.keys(envelopeFiles(row.sealed))
    t.ok(copy && copy !== old, 'into a new copy')
    t.alike(linksIn(openNoteBody(key, row.sealed)), [copy], 'the body links the copy')
    t.is(envelopeRelink(row.sealed)[old], copy, 'and relinks the old link')
    t.is((await storedBytes(base, copy)).byteLength, cipherLength(plain.byteLength), 'ciphertext')
    t.alike((await get(base, copy)).body, plain, 'served as plaintext')
    t.ok(await tombstoned(base, old), 'the plain copy goes to reclaim')
    t.is((await runSealingPass(base, { quietMs: 0 })).encrypted, 0, 'nothing to do again')

    const stale = img(old) + '<p>typed</p>'
    await notesApi.updateNote({ key, title: 'Trip', note: stale, locked: true })
    row = await base.getNote(key)
    t.alike(linksIn(openNoteBody(key, row.sealed)), [copy], 'a stale editor saves the new link')
    t.alike(Object.keys(envelopeFiles(row.sealed)), [copy], 'and keeps its key')

    await notesApi.closeLockSession()
    t.is((await get(base, copy)).status, 404, 'closed: 404')
    t.is(
      (await notesApi.updateNote({ key, title: 'Trip', note: stale, locked: false })).reason,
      'LOCK_SESSION_CLOSED',
      'closed: the lock cannot be removed'
    )

    t.ok((await notesApi.openLockSession({ password: PASSWORD })).ok)
    const unlock = await notesApi.updateNote({ key, title: 'Trip', note: stale, locked: false })
    t.is(unlock.done, true, 'removing the lock decrypts the files')
    row = await base.getNote(key)
    t.absent(row.sealed, 'the note is plain')
    const [back] = linksIn(row.note)
    t.ok(back && back !== copy && back !== old, 'linking a plain copy')
    t.alike(await storedBytes(base, back), plain, 'stored as plaintext')
    t.ok(await tombstoned(base, copy), 'the encrypted copy goes to reclaim')
    await notesApi.closeLockSession()
    t.alike((await get(base, back)).body, plain, 'served with the session closed')

    await notesApi.updateNote({ key, title: 'Trip', note: stale, locked: false })
    t.alike(linksIn((await base.getNote(key)).note), [back], 'a stale editor saves the plain copy')
  })
})

test('sealed files - deleting a file drops its key', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await sealedNote()
    const { link } = await notesApi.insertFile({ key, fileName: 'x.png', buffer: bytes(900) })
    const keep = await notesApi.insertFile({ key, fileName: 'y.png', buffer: bytes(900, 5) })
    await notesApi.updateNote({
      key,
      title: 'Vault',
      note: img(link) + img(keep.link),
      locked: true
    })
    t.is(Object.keys(envelopeFiles((await base.getNote(key)).sealed)).length, 2)

    t.ok(await notesApi.deleteNoteFile({ noteKey: key, mediaPath: link }), 'deleted')
    const row = await base.getNote(key)
    t.alike(Object.keys(envelopeFiles(row.sealed)), [keep.link], 'its f entry is gone')
    t.alike(linksIn(openNoteBody(key, row.sealed)), [keep.link], 'and its link')
    t.ok(await tombstoned(base, link), 'the ciphertext range is tombstoned')
  })
})

test('sealed files - a sealed link pasted into a plain note gets a plain copy once', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await sealedNote()
    const plain = bytes(2000)
    const { link } = await notesApi.insertFile({ key, fileName: 'z.png', buffer: plain })
    await notesApi.updateNote({ key, title: 'Vault', note: img(link), locked: true })

    const open = await notesApi.insertNote({ title: 'Open', note: '' })
    await notesApi.updateNote({ key: open, title: 'Open', note: img(link) })
    const [copy] = linksIn((await base.getNote(open)).note)
    t.ok(copy && copy !== link, 'the pasted link is replaced')
    t.alike(await storedBytes(base, copy), plain, 'by a plain copy')

    await notesApi.updateNote({ key: open, title: 'Open', note: img(link) + '<p>more</p>' })
    t.alike(linksIn((await base.getNote(open)).note), [copy], 'a stale save keeps the same copy')
    t.is((await filesOf(base, open)).length, 1, 'and makes no second copy')
  })
})

test('sealed files - locking encrypts the files at once', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await notesApi.insertNote({ title: 'Trip', note: '' })
    const plain = bytes(3000, 8)
    const { link } = await notesApi.insertFile({ key, fileName: 'a.png', buffer: plain })
    await notesApi.updateNote({ key, title: 'Trip', note: img(link) })

    const copyFile = base.media.copyFile.bind(base.media)
    let listed = null
    base.media.copyFile = async (...args) => {
      listed = base.media.getSealWaitingInfo()
      return copyFile(...args)
    }
    await notesApi.updateNote({ key, title: 'Trip', note: img(link), locked: true })
    await notesApi.whenSealingIdle()
    t.alike(
      listed,
      [{ noteKey: key, link, fileName: '', size: plain.byteLength }],
      'listed as waiting while it is copied'
    )
    const row = await base.getNote(key)
    const [copy] = Object.keys(envelopeFiles(row.sealed))
    t.ok(copy && copy !== link, 'keyed with no quiet window')
    t.alike(base.media.getSealWaitingInfo(), [], 'and no longer waiting')

    await notesApi.closeLockSession()
    t.is((await get(base, copy)).status, 404, 'closed: the copy answers 404')
    t.is((await get(base, link)).status, 404, 'closed: so does the old plain copy')
  })
})

test('sealed files - locked and closed at once, the files are refused until unlock', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await notesApi.insertNote({ title: 'Trip', note: '' })
    const plain = bytes(CHUNK_PLAIN_BYTES * 3, 9)
    const first = await notesApi.insertFile({ key, fileName: 'p.png', buffer: plain })
    const second = await notesApi.insertFile({ key, fileName: 'q.png', buffer: bytes(800, 4) })
    const open = await notesApi.insertNote({ title: 'Open', note: '' })
    const other = await notesApi.insertFile({ key: open, fileName: 'o.png', buffer: bytes(70) })
    await notesApi.updateNote({ key: open, title: 'Open', note: img(other.link) })
    const body = img(first.link) + img(second.link)
    await notesApi.updateNote({ key, title: 'Trip', note: body })

    await notesApi.updateNote({ key, title: 'Trip', note: body, locked: true })
    await notesApi.closeLockSession()
    await notesApi.whenSealingIdle()
    let row = await base.getNote(key)
    const links = [...Object.keys(envelopeFiles(row.sealed)), first.link, second.link]
    for (const link of links) {
      t.is((await get(base, link)).status, 404, 'closed: every copy of its files is refused')
    }
    t.is((await get(base, other.link)).status, 200, 'closed: a plain note still loads its file')

    t.ok((await notesApi.openLockSession({ password: PASSWORD })).ok, 'unlock')
    await notesApi.whenSealingIdle()
    row = await base.getNote(key)
    const files = envelopeFiles(row.sealed)
    t.is(Object.keys(files).length, 2, 'both files keyed after the unlock')
    t.alike(linksIn(openNoteBody(key, row.sealed)), Object.keys(files), 'and linked')
    t.alike((await get(base, Object.keys(files)[0])).body, plain, 'served as plaintext')
  })
})

test('sealed files - a session closed during the copy resumes at the next unlock', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await notesApi.insertNote({ title: 'Trip', note: '' })
    const first = await notesApi.insertFile({ key, fileName: 'p.png', buffer: bytes(800) })
    const second = await notesApi.insertFile({ key, fileName: 'q.png', buffer: bytes(800, 4) })
    const body = img(first.link) + img(second.link)
    await notesApi.updateNote({ key, title: 'Trip', note: body })

    const copyFile = base.media.copyFile.bind(base.media)
    let calls = 0
    base.media.copyFile = async (...args) => {
      if (calls++ === 1) await notesApi.closeLockSession()
      return copyFile(...args)
    }
    await notesApi.updateNote({ key, title: 'Trip', note: body, locked: true })
    await notesApi.whenSealingIdle()
    let row = await base.getNote(key)
    t.alike(envelopeFiles(row.sealed), {}, 'closed mid-copy: no key is stranded')
    t.is((await get(base, first.link)).status, 404, 'and the plain files are refused')
    await base.media.refreshSealWaiting()
    t.alike(
      base.media.getSealWaitingInfo().map((file) => file.link),
      [first.link, second.link],
      'both stay listed as waiting while closed'
    )

    t.ok((await notesApi.openLockSession({ password: PASSWORD })).ok, 'unlock')
    await notesApi.whenSealingIdle()
    row = await base.getNote(key)
    t.is(Object.keys(envelopeFiles(row.sealed)).length, 2, 'the copy resumed with no wait')
    t.alike(base.media.getSealWaitingInfo(), [], 'nothing waits any more')
  })
})

test('sealed files - an edit during the copy wins and the copy still lands', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await notesApi.insertNote({ title: 'Trip', note: '' })
    const plain = bytes(1500, 6)
    const { link } = await notesApi.insertFile({ key, fileName: 'e.png', buffer: plain })
    await notesApi.updateNote({ key, title: 'Trip', note: img(link) })

    const typed = img(link) + '<p>typed during the copy</p>'
    const copyFile = base.media.copyFile.bind(base.media)
    let edits = 0
    base.media.copyFile = async (...args) => {
      const copy = await copyFile(...args)
      if (edits++ === 0) {
        const saved = await notesApi.updateNote({ key, title: 'Trip', note: typed, locked: true })
        t.is(saved.done, true, 'the edit saves')
      }
      return copy
    }
    await notesApi.updateNote({ key, title: 'Trip', note: img(link), locked: true })
    await notesApi.whenSealingIdle()
    const row = await base.getNote(key)
    const opened = openNoteBody(key, row.sealed)
    t.ok(opened.includes('typed during the copy'), 'the edit wins')
    const [copy] = Object.keys(envelopeFiles(row.sealed))
    t.alike(linksIn(opened), [copy], 'and the copy made before it is linked')
    t.is(edits, 1, 'without copying the file again')
    t.alike((await get(base, copy)).body, plain, 'served as plaintext')
  })
})

test('sealed files - a file added before a session close saves after the next unlock', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))
  const plain = bytes(CHUNK_PLAIN_BYTES + 5, 21)
  await notesApi.ready({ storage, encryption })
  resetAttemptState()
  let key
  let link
  try {
    const base = notesApi.notesBase
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    key = await sealedNote()
    ;({ link } = await notesApi.insertFile({ key, fileName: 'late.png', buffer: plain }))
    t.is(base.heldFileKeys.size, 1, 'the key is held on disk')
    const onDisk = fs.readFileSync(base.heldFileKeys.filePath)
    t.absent(b4a.includes(onDisk, b4a.from(key)), 'the held-key file names no note')
    t.absent(b4a.includes(onDisk, b4a.from(blobIdOf(link))), 'nor a blob')

    await notesApi.closeLockSession()
    const refused = await notesApi.updateNote({
      key,
      title: 'Vault',
      note: img(link),
      locked: true
    })
    t.is(refused.reason, 'LOCK_SESSION_CLOSED', 'closed: the save waits')
    t.ok((await notesApi.openLockSession({ password: PASSWORD })).ok, 'unlock')
    t.alike((await get(base, link)).body, plain, 'the held key came back')
  } finally {
    closeLockSession()
    await notesApi.destroy().catch(() => {})
  }

  await notesApi.ready({ storage, encryption })
  resetAttemptState()
  try {
    const base = notesApi.notesBase
    t.is(base.heldFileKeys.size, 1, 'still held after a restart')
    t.is(fileKeyFor(blobIdOf(link)), null, 'not mapped while closed')
    t.is((await get(base, link)).status, 404, 'closed: 404')
    t.ok((await notesApi.openLockSession({ password: PASSWORD })).ok, 'unlock')
    t.alike((await get(base, link)).body, plain, 'served after the restart')

    const saved = await notesApi.updateNote({ key, title: 'Vault', note: img(link), locked: true })
    t.is(saved.done, true, 'the late save lands')
    t.ok(envelopeFiles((await base.getNote(key)).sealed)[link], 'with the key in f')
    t.is(base.heldFileKeys.size, 0, 'and the held key is dropped')
    t.absent(fs.existsSync(base.heldFileKeys.filePath), 'its file removed')

    const other = await sealedNote('Other')
    await notesApi.insertFile({ key: other, fileName: 'gone.png', buffer: bytes(9) })
    for (const record of base.heldFileKeys.list()) record.at = 1
    await base.pruneHeldFileKeys()
    t.is(base.heldFileKeys.size, 0, 'a held key past the reclaim grace is dropped')
  } finally {
    closeLockSession()
    await notesApi.destroy().catch(() => {})
  }
})

test('sealed files - a password change moves file keys to the new content key', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await sealedNote()
    const plain = bytes(CHUNK_PLAIN_BYTES + 77)
    const { link } = await notesApi.insertFile({ key, fileName: 'a.pdf', buffer: plain })
    await notesApi.updateNote({
      key,
      title: 'Vault',
      note: '<p>secret</p>' + img(link),
      locked: true
    })
    const before = envelopeFiles((await base.getNote(key)).sealed)[link]

    t.ok(await notesApi.setNoteLockPassword({ password: 'Changed-pass-456!' }), 'changed')
    await notesApi.whenSealingIdle()
    const after = envelopeFiles((await base.getNote(key)).sealed)[link]
    t.is(after.id, before.id, 'same file')
    t.not(after.k, before.k, 'its key is wrapped again')

    await notesApi.closeLockSession()
    t.ok((await notesApi.openLockSession({ password: 'Changed-pass-456!' })).ok, 'reopened')
    t.alike((await get(base, link)).body, plain, 'the file still decrypts')
  })
})
