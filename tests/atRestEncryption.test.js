import test from 'brittle'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { ACTIVITY_LOG_ENABLED_KEY } from '../constant.js'
import NoteBase from '../backend/NoteBase.js'
import { closeLockSession } from '../backend/lockSession.js'
import { resetAttemptState } from '../backend/noteLockPassword.js'
import * as notesApi from '../backend/notesApi.js'
import { envelopeFiles } from '../backend/sealedEnvelope.js'
import * as viewStore from '../backend/viewStore.js'
import { withTestnet } from './helpers/testnet.js'

const MARKS = {
  title: 'ZQTITLE-at-rest-marker',
  body: 'ZQBODY-at-rest-marker',
  edited: 'ZQEDITED-at-rest-marker',
  deleted: 'ZQDELETED-at-rest-marker',
  file: 'ZQFILE-at-rest-marker',
  derived: 'ZQDERIVED-at-rest-marker'
}

function filesContaining(dir, needle) {
  const found = []
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) found.push(...filesContaining(p, needle))
    else if (b4a.indexOf(fs.readFileSync(p), needle) !== -1) found.push(p)
  }
  return found
}

test('at rest - no note text, history, attachment or vault key is readable on disk', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pn-at-rest-' + Math.random().toString(36).slice(2))
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))
  const vaultKey = crypto.randomBytes(32)
  const entropy = b4a.toString(crypto.randomBytes(32), 'hex')

  const base = new NoteBase({ storage, encryption: b4a.toString(vaultKey, 'hex'), entropy })
  await base.ready()
  await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })

  const note = (title, body) => ({ title, note: `<p>${body}</p>`, updatedAt: Date.now() })
  await base.addNote({ key: 'n1', value: note(MARKS.title, MARKS.body) })
  await base.addNote({ key: 'n1', value: note(MARKS.title, MARKS.edited) })
  await base.addNote({ key: 'n2', value: note('gone', MARKS.deleted) })
  await base.removeNote('n2')
  await base.media.insertFile({ key: 'n1/file.txt', buffer: b4a.from(MARKS.file.repeat(64)) })
  await base.derived.put('vectors', 'n1', 1, b4a.from(MARKS.derived))
  t.is((await base.getNote('n1')).title, MARKS.title, 'the note reads back through the vault')
  await base.close()

  const control = path.join(storage, 'plaintext-control')
  fs.writeFileSync(control, MARKS.body)
  t.alike(
    filesContaining(storage, b4a.from(MARKS.body)),
    [control],
    'control: the scan finds plaintext'
  )
  fs.rmSync(control)

  for (const [what, mark] of Object.entries(MARKS)) {
    t.alike(filesContaining(storage, b4a.from(mark)), [], `no plaintext ${what}`)
  }
  t.alike(filesContaining(storage, vaultKey), [], 'no raw vault key')
  t.alike(filesContaining(storage, b4a.from(b4a.toString(vaultKey, 'hex'))), [], 'no hex vault key')
})

const SEALED = {
  body: 'ZQSEALEDBODY-at-rest-marker',
  file: 'ZQSEALEDFILE-at-rest-marker',
  fileName: 'ZQSEALEDNAME-at-rest-marker'
}
const LOCK_PASSWORD = 'At-rest-lock-123!'

async function blocksContaining(core, needle) {
  const hits = []
  for (let i = 0; i < core.length; i++) {
    const block = await core.get(i)
    if (block && b4a.indexOf(block, needle) !== -1) hits.push(i)
  }
  return hits
}

test('at rest - a locked note and its file stay unreadable even with the vault key', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pn-at-rest-sealed-' + Math.random().toString(36).slice(2))
  const vaultKey = crypto.randomBytes(32)
  const encryption = b4a.toString(vaultKey, 'hex')
  const entropy = b4a.toString(crypto.randomBytes(32), 'hex')
  t.teardown(async () => {
    closeLockSession()
    await notesApi.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })

  await notesApi.ready({ storage, encryption, entropy })
  resetAttemptState()
  const base = notesApi.notesBase
  await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })
  t.ok(await notesApi.setNoteLockPassword({ password: LOCK_PASSWORD }), 'lock password set')
  const opened = await notesApi.openLockSession({ password: LOCK_PASSWORD, returnRootKey: true })
  t.ok(opened.ok && opened.rootKey, 'session open, root key returned for the test')

  const key = await notesApi.insertNote({
    title: 'Locked',
    note: `<p>${SEALED.body}</p>`,
    locked: true
  })
  const { link } = await notesApi.insertFile({
    key,
    fileName: SEALED.fileName + '.txt',
    buffer: b4a.from(SEALED.file.repeat(64))
  })
  t.ok(link, 'file inserted into the locked note')
  const html = `<p>${SEALED.body}</p><p>${SEALED.body} again</p><img src="${link.replace(/&/g, '&amp;')}">`
  t.is(
    (await notesApi.updateNote({ key, title: 'Locked', note: html, locked: true })).done,
    true,
    'save accepted'
  )
  t.ok((await base.getNote(key)).sealed, 'the note is sealed')
  t.is(
    Object.keys(envelopeFiles((await base.getNote(key)).sealed)).length,
    1,
    'its file is keyed in the envelope'
  )
  await notesApi.closeLockSession()

  const raw = await viewStore.getNote(await base.autobase.view, key)
  t.is(raw.note, '', 'the view row carries no plaintext body')
  const envelope = JSON.parse(raw.sealed)
  const bodyBytes = b4a.from(envelope.b, 'base64')
  for (const [what, mark] of Object.entries(SEALED)) {
    const needle = b4a.from(mark)
    t.is(b4a.indexOf(b4a.from(raw.sealed), needle), -1, `envelope has no ${what}`)
    t.is(b4a.indexOf(bodyBytes, needle), -1, `sealed body bytes have no ${what}`)
    t.alike(await blocksContaining(base.autobase.local, needle), [], `oplog has no ${what}`)
    t.alike(
      await blocksContaining((await base.autobase.view).core, needle),
      [],
      `view core has no ${what}`
    )
    t.alike(await blocksContaining(base.media.blobCore, needle), [], `media blobs have no ${what}`)
    t.alike(
      await blocksContaining(base.media.drive.db.core, needle),
      [],
      `media drive index has no ${what}`
    )
  }
  const stored = await base.media.drive.get(base.media.files.find((f) => f.url === link).path)
  t.is(b4a.indexOf(stored, b4a.from(SEALED.file)), -1, 'the stored file is ciphertext')

  await notesApi.destroy()
  for (const [what, mark] of Object.entries(SEALED)) {
    t.alike(filesContaining(storage, b4a.from(mark)), [], `no plaintext ${what} on disk`)
  }
  const rootKey = b4a.from(opened.rootKey, 'hex')
  t.alike(filesContaining(storage, rootKey), [], 'no raw lock root key on disk')
  t.alike(filesContaining(storage, b4a.from(opened.rootKey)), [], 'no hex lock root key on disk')
})
