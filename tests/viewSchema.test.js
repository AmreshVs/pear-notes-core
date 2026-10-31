// A field a writer gains must be added here and to spec/build-db.js.
import test from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import HyperDB from 'hyperdb'
import definition from '../spec/db/index.js'

async function makeDb(t) {
  const storage = path.join(
    tmpdir(),
    'pear-notes-view-schema-' + Math.random().toString(36).slice(7)
  )
  const store = new Corestore(storage)
  const core = store.get({ name: 'view' })
  await core.ready()
  const db = HyperDB.bee(core, definition, { extension: false, autoUpdate: true })
  await db.ready()
  t.teardown(async () => {
    await db.close().catch(() => {})
    await store.close().catch(() => {})
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  })
  return db
}

async function roundTrip(t, db, collection, row, query) {
  await db.insert(collection, row)
  await db.flush()
  const got = await db.get(collection, query)
  t.ok(got, `${collection}: row is readable`)
  for (const [field, value] of Object.entries(row)) {
    t.alike(got?.[field], value, `${collection}.${field} survives`)
  }
}

test('view schema - a note keeps every field apply writes', async (t) => {
  const db = await makeDb(t)
  await roundTrip(
    t,
    db,
    '@notes/notes',
    {
      key: 'note-1',
      title: 'Title',
      note: '<p>body</p>',
      folderKey: 'folder-1',
      addedAt: 1000,
      updatedAt: 2000,
      deletedAt: 3000,
      previousFolderKey: 'folder-0',
      locked: true,
      pinned: true,
      version: 7,
      versionBy: 'a'.repeat(64),
      sealed: JSON.stringify({ v: 1, r: 'id', k: 'k', b: 'b', links: [] })
    },
    { key: 'note-1' }
  )
})

test('view schema - the pairing invite keeps every field', async (t) => {
  const db = await makeDb(t)
  await roundTrip(
    t,
    db,
    '@notes/invites',
    {
      slot: '@invite',
      id: 'b'.repeat(64),
      invite: 'pear-notes:' + 'c'.repeat(80),
      publicKey: 'd'.repeat(64),
      expires: 1790000000000,
      version: 1,
      versionBy: 'e'.repeat(64)
    },
    { slot: '@invite' }
  )
})

test('view schema - a folder keeps every field', async (t) => {
  const db = await makeDb(t)
  await roundTrip(
    t,
    db,
    '@notes/folders',
    { key: 'folder-1', title: 'Work', icon: 'briefcase', addedAt: 1000, updatedAt: 2000 },
    { key: 'folder-1' }
  )
})

test('view schema - a synced device keeps every STORED field', async (t) => {
  const db = await makeDb(t)
  await roundTrip(
    t,
    db,
    '@notes/syncedDevices',
    {
      key: 'f'.repeat(64),
      title: 'MacBook',
      deviceType: 'desktop',
      platform: 'darwin',
      localKey: '1'.repeat(64),
      swarmKey: '2'.repeat(64),
      addedAt: 1000,
      updatedAt: 2000,
      caps: 'sealedNotes1'
    },
    { key: 'f'.repeat(64) }
  )
})

test('view schema - a media tombstone keeps its url', async (t) => {
  const db = await makeDb(t)
  await roundTrip(
    t,
    db,
    '@notes/mediaTombstones',
    {
      refKey: '3'.repeat(64) + ':10:4',
      url: 'http://hyperdrive/blob?key=abc&blob=def',
      deletedAt: 5000
    },
    { refKey: '3'.repeat(64) + ':10:4' }
  )
})

test('view schema - the by-note activity index skips deletions', async (t) => {
  const db = await makeDb(t)
  const entry = (id, event, targetKind = 'note') => ({
    id,
    event,
    device: 'dev',
    at: 1,
    targetKind,
    targetKey: 'note-1',
    meta: '{}'
  })
  await db.insert('@notes/activity', entry('00000000000001:a:1:000', 'note.created'))
  await db.insert('@notes/activity', entry('00000000000002:a:2:000', 'note.edited'))
  await db.insert('@notes/activity', entry('00000000000003:a:3:000', 'note.deleted'))
  await db.insert('@notes/activity', entry('00000000000004:a:4:000', 'folder.created', 'folder'))
  await db.flush()

  const ids = []
  for await (const row of db.find('@notes/activityByNote', { gte: 'note-1', lte: 'note-1' })) {
    ids.push(row.id)
  }
  t.alike(
    ids,
    ['00000000000001:a:1:000', '00000000000002:a:2:000'],
    'indexed: created and edited only - not the deletion, not the folder entry'
  )
})
