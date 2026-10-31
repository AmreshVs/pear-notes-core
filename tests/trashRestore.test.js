import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { DEFAULT_FOLDER_NAME, RECENTLY_DELETED_KEY, TRASH_RETENTION_MS } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('trash-test-key'), 'hex')

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-trash-test-' + Math.random().toString(36).substring(7))

const newNoteKey = () => 'n' + Math.random().toString(36).substring(2, 10)

async function withBase(fn) {
  const storage = getStoragePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  try {
    await fn(base)
  } finally {
    await base.destroy().catch(() => {})
    try {
      if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
    } catch {
      // best effort cleanup
    }
  }
}

async function addFolder(base, title) {
  const key = 'f' + Math.random().toString(36).substring(2, 10)
  const now = Date.now()
  await base.addFolder({ key, value: { title, addedAt: now, updatedAt: now } })
  return key
}

async function addNote(base, folderKey, overrides = {}) {
  const key = newNoteKey()
  const now = Date.now()
  await base.addNote({
    key,
    value: {
      title: 'note',
      note: '<p>body</p>',
      folderKey,
      addedAt: now,
      updatedAt: now,
      locked: false,
      pinned: false,
      ...overrides
    }
  })
  return key
}

test('trashNote records where the note came from', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const folderKey = await addFolder(base, 'Work')
    const noteKey = await addNote(base, folderKey, { pinned: true })

    const trashed = await base.trashNote(noteKey)
    t.ok(trashed, 'trashNote reports success')

    const stored = await base.getNote(noteKey)
    t.is(stored.folderKey, RECENTLY_DELETED_KEY, 'note moved to trash')
    t.is(stored.previousFolderKey, folderKey, 'origin folder remembered')
    t.ok(stored.deletedAt > 0, 'deletion timestamp stamped')
    t.is(stored.pinned, false, 'a trashed note is unpinned')

    const again = await base.trashNote(noteKey)
    t.absent(again, 'trashing a note already in the trash is a no-op')
  })
})

test('restoreNote puts the note back where it was', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const folderKey = await addFolder(base, 'Work')
    const noteKey = await addNote(base, folderKey)

    await base.trashNote(noteKey)
    const result = await base.restoreNote(noteKey)

    t.ok(result.done, 'restore reports success')
    t.is(result.folderKey, folderKey, 'restored into the original folder')

    const stored = await base.getNote(noteKey)
    t.is(stored.folderKey, folderKey, 'note is back in its folder')
    t.absent(stored.deletedAt, 'deletion timestamp cleared')
    t.absent(stored.previousFolderKey, 'origin folder cleared')
  })
})

test('restoreNote falls back when the origin folder is gone', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const folderKey = await addFolder(base, 'Doomed')
    const noteKey = await addNote(base, folderKey)

    await base.trashNote(noteKey)
    await base.removeFolder(folderKey)

    const result = await base.restoreNote(noteKey)
    t.ok(result.done, 'restore still succeeds')
    t.not(result.folderKey, folderKey, 'did not restore into the deleted folder')
    t.not(result.folderKey, RECENTLY_DELETED_KEY, 'did not leave the note in the trash')

    const folder = await base.getFolder(result.folderKey)
    t.ok(folder, 'fallback folder exists')
    t.is(folder.title, DEFAULT_FOLDER_NAME, 'fallback is the default folder')

    const stored = await base.getNote(noteKey)
    t.is(stored.folderKey, result.folderKey, 'note lives in the fallback folder')
  })
})

test('restoreNote reuses an existing default folder', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const untitledKey = await addFolder(base, DEFAULT_FOLDER_NAME)
    const folderKey = await addFolder(base, 'Doomed')
    const noteKey = await addNote(base, folderKey)

    await base.trashNote(noteKey)
    await base.removeFolder(folderKey)

    const result = await base.restoreNote(noteKey)
    t.is(result.folderKey, untitledKey, 'reused the existing default folder')
  })
})

test('restoreNote on a missing note does not throw', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const result = await base.restoreNote('does-not-exist')
    t.absent(result.done, 'reports failure instead of throwing')
  })
})

test('purgeExpiredTrash only deletes notes past retention', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const now = Date.now()
    const folderKey = await addFolder(base, 'Work')

    const liveKey = await addNote(base, folderKey)
    const freshKey = await addNote(base, RECENTLY_DELETED_KEY, {
      deletedAt: now - 1000,
      previousFolderKey: folderKey
    })
    const staleKey = await addNote(base, RECENTLY_DELETED_KEY, {
      deletedAt: now - TRASH_RETENTION_MS - 1000,
      previousFolderKey: folderKey
    })
    const legacyKey = await addNote(base, RECENTLY_DELETED_KEY)

    const purged = await base.purgeExpiredTrash(now)
    t.is(purged, 1, 'exactly one note purged')

    t.ok(await base.getNote(liveKey), 'a live note is untouched')
    t.ok(await base.getNote(freshKey), 'a recently trashed note is kept')
    t.absent(await base.getNote(staleKey), 'a note past 30 days is gone')

    const legacy = await base.getNote(legacyKey)
    t.ok(legacy, 'a legacy trashed note without a timestamp is kept')
    t.ok(legacy.deletedAt >= now, 'legacy note is stamped so its 30 days start now')
  })
})

test('purgeExpiredTrash stamps then purges legacy notes', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const legacyKey = await addNote(base, RECENTLY_DELETED_KEY)

    const now = Date.now()
    t.is(await base.purgeExpiredTrash(now), 0, 'first sweep only stamps')

    const later = now + TRASH_RETENTION_MS + 1000
    t.is(await base.purgeExpiredTrash(later), 1, 'second sweep past retention purges it')
    t.absent(await base.getNote(legacyKey), 'legacy note eventually removed')
  })
})
