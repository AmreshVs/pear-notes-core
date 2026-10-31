import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')

test('storage - notes data counts each linked attachment once', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pn-totals-' + Math.random().toString(36).slice(2))
  const base = new NoteBase({ storage, encryption: key('s') })
  t.teardown(async () => {
    await base.close()
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.ready()

  const photo = await base.insertFile({ key: 'a/1_photo.png', buffer: b4a.alloc(300 * 1024, 1) })
  await base.insertFile({ key: 'a/2_unused.png', buffer: b4a.alloc(500 * 1024, 2) })
  const typed = photo + '&amp;type=image%2Fpng'
  await base.addNote({
    key: 'a',
    value: { title: 'a', note: `<img src="${photo}"><img src="${typed}">`, updatedAt: 1 }
  })
  await base.addNote({
    key: 'b',
    value: { title: 'b', note: `<img src="${photo}">`, updatedAt: 2 }
  })

  const info = await base.getNotesStorageInfo()
  t.is(
    info.totalBlobBytes,
    300 * 1024,
    'the shared photo counts once and the unlinked file not at all'
  )
  t.ok(info.totalOnDiskBytes >= 800 * 1024, 'the unlinked file is still on disk')
  t.is(info.reclaimableBytes, 0, 'nothing reclaim would free')
  const noteA = info.notes.find((n) => n.key === 'a')
  t.is(noteA.media.length, 1, 'one entry per range within a note')
  t.is(noteA.media[0].path, 'a/1_photo.png', 'own files keep their drive path')
})

test('storage - reclaim frees unlinked files older than a day', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pn-unlinked-' + Math.random().toString(36).slice(2))
  const base = new NoteBase({ storage, encryption: key('u') })
  t.teardown(async () => {
    await base.close()
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.ready()

  const photo = await base.insertFile({ key: 'a/1_photo.png', buffer: b4a.alloc(300 * 1024, 1) })
  await base.insertFile({ key: 'a/2_fresh.png', buffer: b4a.alloc(200 * 1024, 2) })
  await base.hyperdrive.put('a/3_old.png', b4a.alloc(500 * 1024, 3), {
    metadata: { insertedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }
  })
  await base.addNote({
    key: 'a',
    value: { title: 'a', note: `<img src="${photo}">`, updatedAt: 1 }
  })

  const before = await base.getNotesStorageInfo()
  t.is(before.reclaimableBytes, 500 * 1024, 'only the old unlinked file is reclaimable')

  const { reclaimedBytes } = await base.reclaimOrphanedBlobs()
  const block = 65536
  t.ok(reclaimedBytes >= 500 * 1024 - block, 'reclaim frees that file (an odd leading block stays)')
  t.absent(await base.hyperdrive.entry('a/3_old.png'), 'its drive entry is gone')
  t.ok(await base.hyperdrive.entry('a/2_fresh.png'), 'a fresh unlinked upload is kept')
  t.ok(await base.hyperdrive.entry('a/1_photo.png'), 'linked media is kept')

  const after = await base.getNotesStorageInfo()
  t.is(after.totalBlobBytes, 300 * 1024, 'notes data is unchanged')
  t.ok(after.reclaimableBytes <= block, 'at most that one block is left')
  t.ok(after.totalOnDiskBytes < before.totalOnDiskBytes, 'on-disk bytes dropped')
})
