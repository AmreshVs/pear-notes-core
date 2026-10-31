import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import HyperDB from 'hyperdb'
import definition from '../spec/db/index.js'
import NoteBase from '../backend/NoteBase.js'
import { NoteSearchIndex } from '../backend/noteSearch.js'
import {
  MAX_CHANGE_BLOCKS,
  onViewChanges,
  watchHyperdbChanges,
  watchHyperdbKey
} from '../backend/viewWatch.js'
import { withTestnet } from './helpers/testnet.js'

const NOTES = '@notes/notes'
const FOLDERS = '@notes/folders'
const QUIET_MS = 150
const encryption = b4a.toString(b4a.alloc(32).fill('change-feed-key'), 'hex')
const FOLDER = 'folder-feed'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function openDb(t) {
  const storage = path.join(tmpdir(), 'pear-notes-feed-' + Math.random().toString(36).slice(7))
  const store = new Corestore(storage)
  t.teardown(async () => {
    await store.close().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  const core = store.get({ name: 'view' })
  await core.ready()
  const db = HyperDB.bee(core, definition, { extension: false, autoUpdate: true })
  await db.ready()
  t.teardown(() => db.close().catch(() => {}))
  return db
}

async function openBase(t) {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pear-notes-feed-base-' + Math.random().toString(36).slice(2))
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  return base
}

function putNote(base, key, title, updatedAt, html = '<p>body</p>') {
  return base.addNote({
    key,
    value: { title, note: html, folderKey: FOLDER, addedAt: 1, updatedAt }
  })
}

function counter(watcher) {
  const state = { count: 0 }
  watcher.on('update', () => state.count++)
  return state
}

test('feed - a change names the records it wrote', async (t) => {
  const db = await openDb(t)
  const changes = []
  const off = onViewChanges(db, (change) => changes.push(change))

  await db.insert(NOTES, { key: 'n1', title: 'one', updatedAt: 1 })
  await db.flush()
  await db.delete(NOTES, { key: 'n1' })
  await db.flush()
  await wait(QUIET_MS)
  off()

  const entries = changes.flatMap((change) => change.entries)
  t.ok(
    changes.every((change) => !change.all),
    'small appends are decoded, not reported as all'
  )
  t.alike(
    entries.map((entry) => [entry.type, entry.collection, entry.value.key]),
    [
      ['insert', NOTES, 'n1'],
      ['delete', NOTES, 'n1']
    ]
  )
  t.is(db.watchers.size, 0, 'the last subscriber leaving detaches db.watch')
})

test('feed - a jump past the decode limit reports everything changed', async (t) => {
  const db = await openDb(t)
  const watcher = await watchHyperdbKey(db, NOTES, { key: 'untouched' })
  const updates = counter(watcher)
  const changes = []
  const off = onViewChanges(db, (change) => changes.push(change))

  for (let i = 0; i <= MAX_CHANGE_BLOCKS; i++) {
    await db.insert(NOTES, { key: 'bulk-' + i, title: 't', updatedAt: i })
  }
  await db.flush()
  await wait(QUIET_MS)

  t.ok(
    changes.some((change) => change.all),
    'reported as all'
  )
  t.is(updates.count, 0, 'a key watcher re-reads on all, but an unchanged record stays quiet')
  t.is(watcher.node, null)
  off()
  await watcher.close()
})

test('feed - a truncation reaches the key watcher', async (t) => {
  const db = await openDb(t)
  await db.insert(NOTES, { key: 'n1', title: 'kept', updatedAt: 1 })
  await db.flush()
  const watcher = await watchHyperdbKey(db, NOTES, { key: 'n2' })
  await db.insert(NOTES, { key: 'n2', title: 'gone soon', updatedAt: 2 })
  await db.flush()
  await wait(QUIET_MS)
  t.is(watcher.node?.value?.title, 'gone soon')

  await db.core.truncate(db.core.length - 1)
  await wait(QUIET_MS)
  t.is(watcher.node, null, 'the truncated record is gone from node')
  await watcher.close()
})

test('feed - a collection-filtered watcher ignores other collections', async (t) => {
  const db = await openDb(t)
  const folders = await watchHyperdbChanges(db, [FOLDERS])
  const everything = await watchHyperdbChanges(db)
  const folderUpdates = counter(folders)
  const allUpdates = counter(everything)

  await db.insert(NOTES, { key: 'n1', title: 'note', updatedAt: 1 })
  await db.flush()
  await wait(QUIET_MS)
  t.is(folderUpdates.count, 0, 'a note write does not wake the folder watcher')
  t.ok(allUpdates.count >= 1, 'the unfiltered watcher still fires on any write')

  await db.insert(FOLDERS, { key: 'f1', title: 'folder' })
  await db.flush()
  await wait(QUIET_MS)
  t.is(folderUpdates.count, 1)

  await folders.close()
  await everything.close()
})

test('base - a note watcher is not woken by writes to other notes', async (t) => {
  const base = await openBase(t)
  await putNote(base, 'a', 'A', 1)
  const watcher = await base.subscribeNote('a')
  const updates = counter(watcher)

  await putNote(base, 'b', 'B', 2)
  await base.addFolder({ key: 'f', value: { title: 'F', addedAt: 1, updatedAt: 1 } })
  await wait(QUIET_MS)
  t.is(updates.count, 0, 'unrelated writes are filtered out')

  await putNote(base, 'a', 'A2', 3)
  await wait(QUIET_MS)
  t.is(updates.count, 1)
  t.is(watcher.node?.value?.title, 'A2')
  await watcher.close()
})

test('base - note keys follow writes without rescanning every note', async (t) => {
  const base = await openBase(t)
  let scans = 0
  base.on('notes-read', () => scans++)

  await putNote(base, 'a', 'A', 10)
  await putNote(base, 'b', 'B', 20)
  t.alike(await base.getAllNoteKeys(), ['b', 'a'], 'newest first')
  const afterFirst = scans

  const keysWatcher = await base.subscribeAllNoteKeys()
  const keyUpdates = counter(keysWatcher)

  await putNote(base, 'a', 'A', 30)
  await wait(QUIET_MS)
  t.alike(await base.getAllNoteKeys(), ['a', 'b'], 'an edit moves the note up')

  await putNote(base, 'c', 'C', 5)
  await wait(QUIET_MS)
  t.alike(await base.getAllNoteKeys(), ['a', 'b', 'c'], 'a new note is placed by updatedAt')

  await base.deleteNoteWithMedia('b')
  await wait(QUIET_MS)
  t.alike(await base.getAllNoteKeys(), ['a', 'c'], 'a deleted note drops out')

  t.is(scans, afterFirst, 'no full scan after the first')

  const before = keyUpdates.count
  await base.addFolder({ key: 'f', value: { title: 'F', addedAt: 1, updatedAt: 1 } })
  await wait(QUIET_MS)
  t.is(keyUpdates.count, before, 'a folder write does not wake the note-keys watcher')
  await keysWatcher.close()
})

test('base - the search index follows note writes without a scan', async (t) => {
  const base = await openBase(t)
  const index = new NoteSearchIndex()
  base.on('notes-read', (notes) => index.sync(notes))
  base.on('notes-changed', (ops) => index.apply(ops))
  const found = (query) =>
    index
      .search({ query })
      .results.map((r) => r.key)
      .sort()

  await putNote(base, 'a', 'Pasta', 1, '<p>garlic</p>')
  await base.getAllNoteKeys()
  await index.ensureWarm(() => base.getAllNotes())
  t.alike(found('garlic'), ['a'])

  await putNote(base, 'b', 'Groceries', 2, '<p>milk, garlic</p>')
  await wait(QUIET_MS)
  t.alike(found('garlic'), ['a', 'b'], 'a new note is searchable without a read')

  await base.deleteNoteWithMedia('a')
  await wait(QUIET_MS)
  t.alike(found('garlic'), ['b'], 'a deleted note leaves the index')
})

test('base - a write from a paired device reaches watchers and the key order', { timeout: 180000 }, async (t) => {
  await withTestnet(t)
  const storage = (name) =>
    path.join(tmpdir(), 'pear-notes-feed-' + name + '-' + Math.random().toString(36).slice(2))
  const host = new NoteBase({
    storage: storage('host'),
    encryption: b4a.toString(b4a.alloc(32).fill('feed-host'), 'hex')
  })
  const joiner = new NoteBase({
    storage: storage('joiner'),
    encryption: b4a.toString(b4a.alloc(32).fill('feed-joiner'), 'hex')
  })
  t.teardown(async () => {
    for (const base of [host, joiner]) {
      await base.destroy().catch(() => {})
      fs.rmSync(base.path, { recursive: true, force: true })
    }
  })
  await host.ready()
  await joiner.ready()

  const until = async (predicate, label) => {
    const start = Date.now()
    while (!(await predicate())) {
      if (Date.now() - start > 150000) return t.fail('timed out: ' + label)
      await wait(250)
    }
  }

  const invite = await host.createInvite()
  let hostDone = false
  let joinerDone = false
  host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  const paired = joiner.subscribePairUser((status) => {
    if (status.step === 'done') joinerDone = true
  }, invite.invite)
  await until(() => hostDone && joinerDone, 'pairing')
  await paired

  await putNote(host, 'seed', 'Seed', 1)
  await until(async () => (await joiner.getAllNoteKeys()).includes('seed'), 'seed note')

  let scans = 0
  joiner.on('notes-read', () => scans++)
  const index = new NoteSearchIndex()
  joiner.on('notes-read', (notes) => index.sync(notes))
  joiner.on('notes-changed', (ops) => index.apply(ops))
  await joiner.getAllNoteKeys()
  await index.ensureWarm(() => joiner.getAllNotes())
  const scansBefore = scans

  const watcher = await joiner.subscribeNote('remote')
  const updates = counter(watcher)

  await putNote(host, 'remote', 'From the host', Date.now(), '<p>saffron</p>')
  await until(() => watcher.node?.value?.title === 'From the host', 'remote note on the watcher')
  t.ok(updates.count >= 1, 'the joiner watcher fired for the remote write')
  t.is((await joiner.getAllNoteKeys())[0], 'remote', 'the key order has the remote note first')
  t.is(scans, scansBefore, 'without rescanning the joiner vault')
  t.alike(
    index.search({ query: 'saffron' }).results.map((r) => r.key),
    ['remote'],
    'and search sees it'
  )
  await watcher.close()
})
