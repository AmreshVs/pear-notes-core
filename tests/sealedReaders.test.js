import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { getNotesStorageInfo } from '../backend/backupManager.js'
import { parseEnvelope } from '../backend/lockCrypto.js'
import { closeLockSession } from '../backend/lockSession.js'
import { resetAttemptState } from '../backend/noteLockPassword.js'
import * as notesApi from '../backend/notesApi.js'
import * as viewStore from '../backend/viewStore.js'
import { rangeOf } from '../backend/vault/media.js'
import { checkMergeable } from '../store/services/noteMerge.js'
import { checkSplittable } from '../store/services/noteSplit.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('sealed-readers-key'), 'hex')
const PASSWORD = 'Lock-pass-123!'
const DAY = 24 * 60 * 60 * 1000

const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-sealed-readers-' + Math.random().toString(36).slice(2, 9))

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

// Reclaim only frees unlinked files older than a day, so the files are made old.
async function oldFile(base, key, fill) {
  const realNow = Date.now
  Date.now = () => realNow() - 2 * DAY
  try {
    return await base.insertFile({ key, buffer: b4a.alloc(64 * 1024, fill) })
  } finally {
    Date.now = realNow
  }
}

const img = (link) => `<img src="${link.replace(/&/g, '&amp;')}">`
const hasFile = async (base, filePath) => !!(await base.media.drive.entry(filePath))

async function tombstoned(base) {
  const ids = []
  for await (const { key } of viewStore.mediaTombstones(await base.autobaseDb())) ids.push(key)
  return ids
}

async function sealedNoteWithFiles(base, names) {
  const key = await notesApi.insertNote({ title: 'Vault', note: '', folderKey: 'folder-a' })
  const links = []
  for (const [i, name] of names.entries())
    links.push(await oldFile(base, `${key}/${i}_${name}`, i + 1))
  const body = '<p>secret plan</p>' + links.map(img).join('')
  const result = await notesApi.updateNote({ key, title: 'Vault', note: body, locked: true })
  return { key, links, body, result }
}

test('sealed readers - reclaim keeps a sealed note files', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key, links, result } = await sealedNoteWithFiles(base, ['photo.png'])
    t.is(result.done, true, 'sealed save accepted')
    const stored = await base.getNote(key)
    t.is(stored.note, '', 'body is sealed')
    t.alike(parseEnvelope(stored.sealed).links, links, 'envelope lists the link')
    const stray = await oldFile(base, 'other/0_stray.png', 9)
    await notesApi.closeLockSession()

    await base.reclaimOrphanedBlobs()
    t.ok(await hasFile(base, `/${key}/0_photo.png`), 'sealed note file survives reclaim')
    t.absent(await hasFile(base, '/other/0_stray.png'), 'an unlinked file is reclaimed')
    t.absent(stray === links[0], 'distinct files')

    const info = await getNotesStorageInfo(base, await base.getAllNotes())
    const row = info.notes?.find((item) => item.key === key)
    t.ok(row, 'storage view lists the sealed note')
    t.is(row?.media?.length, 1, 'with its file')
  })
})

test('sealed readers - removing an attachment prunes only that file', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key, links } = await sealedNoteWithFiles(base, ['a.png', 'b.png'])
    t.alike(await tombstoned(base), [], 'nothing deleted yet')

    const result = await notesApi.updateNote({
      key,
      title: 'Vault',
      note: '<p>secret plan</p>' + img(links[0]),
      locked: true
    })
    t.is(result.done, true, 'edit accepted')
    t.alike(parseEnvelope((await base.getNote(key)).sealed).links, [links[0]], 'one link left')
    t.alike(await tombstoned(base), [rangeOf(links[1]).id], 'only the removed file is deleted')

    await notesApi.closeLockSession()
    const pin = await notesApi.updateNote({ key, title: 'Vault', note: '', pinned: true })
    t.is(pin.done, true, 'pin with the session closed')
    t.alike(await tombstoned(base), [rangeOf(links[1]).id], 'a pin prunes nothing')
  })
})

test('sealed readers - deleteNoteFile needs the session and re-seals', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const { key, links } = await sealedNoteWithFiles(base, ['a.png', 'b.png'])
    const sealed = (await base.getNote(key)).sealed
    await notesApi.closeLockSession()

    const closed = await notesApi.deleteNoteFile({ noteKey: key, mediaPath: `${key}/1_b.png` })
    t.is(closed, false, 'refused while closed')
    t.ok(await hasFile(base, `/${key}/1_b.png`), 'file kept')
    t.is((await base.getNote(key)).sealed, sealed, 'envelope unchanged')

    await notesApi.openLockSession({ password: PASSWORD })
    const open = await notesApi.deleteNoteFile({ noteKey: key, mediaPath: `${key}/1_b.png` })
    t.is(open, true, 'allowed while open')
    t.absent(await hasFile(base, `/${key}/1_b.png`), 'file deleted')
    const stored = await base.getNote(key)
    t.is(stored.note, '', 'still sealed')
    t.alike(parseEnvelope(stored.sealed).links, [links[0]], 'link stripped from the envelope')
    const body = (await notesApi.getSingleNote({ key })).note
    t.ok(body.includes('secret plan'), 'body kept')
    t.absent(body.includes('blob=') && body.includes(links[1].split('blob=')[1]), 'img stripped')
    t.ok(await hasFile(base, `/${key}/0_a.png`), 'other file kept')
  })
})

test('sealed readers - search matches titles only, and tasks skip sealed notes', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const key = await notesApi.insertNote({
      title: 'Groceries',
      note: '<ul data-type="taskList"><li data-checked="false"><p>buy saffron tomorrow</p></li></ul>',
      folderKey: 'folder-a',
      locked: true
    })
    t.ok((await base.getNote(key)).sealed, 'inserted sealed')

    const body = await notesApi.searchNotes({ query: 'saffron', includeLocked: true })
    t.absent(
      body?.results?.some((r) => r.key === key),
      'body not searchable while the session is open'
    )
    const title = await notesApi.searchNotes({ query: 'groceries', includeLocked: true })
    t.ok(
      title?.results?.some((r) => r.key === key),
      'title searchable'
    )
    t.is(
      await notesApi.setTaskChecked({ noteKey: key, text: 'buy saffron tomorrow', checked: true }),
      false,
      'setTaskChecked refuses'
    )
  })
})

test('sealed readers - activity keeps no plaintext of a sealed note', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await base.updateSettings({ settings: { activityLogEnabled: true } })
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const link = await oldFile(base, 'n/0_a.png', 1)
    const key = await notesApi.insertNote({
      title: 'Diary',
      note: '<p>first words</p>',
      folderKey: 'f'
    })
    await notesApi.updateNote({ key, title: 'Diary', note: '<p>second words</p>' })
    const snapshots = async () => {
      const texts = []
      for await (const { value } of viewStore.activitySnapshots(await base.autobaseDb())) {
        texts.push(value?.text || '')
      }
      return texts
    }
    t.ok(
      (await snapshots()).some((s) => s.includes('first words')),
      'plain edit snapshotted'
    )

    await notesApi.updateNote({ key, title: 'Diary', note: '<p>third words</p>', locked: true })
    t.ok((await base.getNote(key)).sealed, 'sealed')
    t.alike(await snapshots(), [], 'sealing drops the old snapshots')

    await notesApi.updateNote({
      key,
      title: 'Diary',
      note: '<p>fourth words</p>' + img(link),
      locked: true
    })
    t.alike(await snapshots(), [], 'sealed edits take no snapshot')

    const { entries } = await base.getActivity({ noteKey: key })
    const added = entries.find((e) => e.event === 'note.attachment_added')
    t.ok(added, 'attachment add recorded from the links')
    t.is(added?.meta?.fileName, '', 'without the file name')
    const edit = entries.find((e) => e.event === 'note.edited')
    t.is((await base.getActivityDiff(edit.id)).available, false, 'no diff for a sealed note')

    const before = entries.length
    await base.addNote({
      key,
      value: { title: 'Diary', note: '<p>leak</p>', updatedAt: Date.now() }
    })
    t.ok((await base.getNote(key)).sealed, 'plain write over the sealed note dropped')
    t.is((await base.getActivity({ noteKey: key })).entries.length, before, 'and not recorded')

    const db = await base.autobaseDb()
    for await (const { value } of viewStore.activityEntries(db)) {
      const text = JSON.stringify(value)
      t.absent(/third|fourth|leak/.test(text), `entry ${value?.event} holds no body text`)
    }
  })
})

test('sealed readers - split, merge and append refuse while closed', async (t) => {
  await withTestnet(t)
  await withApi(async (base) => {
    await notesApi.setNoteLockPassword({ password: PASSWORD })
    const html = '<h2>One</h2><p>a</p><h2>Two</h2><p>b</p>'
    const key = await notesApi.insertNote({
      title: 'Parts',
      note: html,
      folderKey: 'f',
      locked: true
    })
    t.is(
      checkSplittable(await notesApi.getSingleNote({ key })),
      'locked',
      'split refused while open'
    )
    await notesApi.closeLockSession()
    const closed = await notesApi.getSingleNote({ key })
    t.is(checkSplittable(closed), 'locked', 'split refused while closed')
    t.is(checkMergeable([closed, { note: '' }]), 'locked', 'merge refused')

    const append = await notesApi.updateNote({ key, title: 'Parts', note: '<p>shared</p>' })
    t.is(append.done, false, 'append refused while closed')
    t.is(
      await notesApi.insertNote({ title: 'New', note: '<p>x</p>', folderKey: 'f', locked: true }),
      undefined,
      'a new locked note is refused while closed'
    )

    await notesApi.openLockSession({ password: PASSWORD })
    const open = await notesApi.getSingleNote({ key })
    const appended = await notesApi.updateNote({
      key,
      title: 'Parts',
      note: open.note + '<p>shared</p>'
    })
    t.is(appended.done, true, 'append accepted while open')
    const stored = await base.getNote(key)
    t.is(stored.note, '', 'append is sealed')
    t.is((await notesApi.getSingleNote({ key })).note, html + '<p>shared</p>', 'appended body')
  })
})
