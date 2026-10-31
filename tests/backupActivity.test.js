// A backup carries no activity in either direction. Export never did - the
// payload is notes, folders, settings and the media map. Import used to
// manufacture one: every replayed note looked like a brand new note, stamped
// with the op's `at`, which is restore time. The pairing merge restores through
// the same path, so linking a device rewrote its notes as freshly created.
//
// The suppression flag travels ON THE OP, never in local state, so every device
// skips the same entry and the views stay identical.
// See docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 9.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { ACTIVITY_EVENT, ACTIVITY_LOG_ENABLED_KEY } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-backup-activity-' + Math.random().toString(36).substring(7))

const encryption = b4a.toString(b4a.alloc(32).fill('test-encryption-key'), 'hex')

async function makeBase(t, { activity = true } = {}) {
  const storage = getStoragePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  if (activity) await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  })
  return base
}

async function events(base) {
  await base.autobase.update()
  const { entries } = await base.getActivity({ limit: 200 })
  return entries.map((e) => e.event)
}

async function seededBackup(t) {
  const src = await makeBase(t)
  await src.addFolder({ key: 'f1', value: { title: 'Folder', addedAt: 1000, updatedAt: 1000 } })
  for (const key of ['n1', 'n2', 'n3']) {
    await src.addNote({
      key,
      value: { title: key, note: `<p>${key}</p>`, folderKey: 'f1', addedAt: 1000, updatedAt: 1000 }
    })
  }
  return src.exportBackup()
}

test('backup activity - the export payload carries no activity at all', async (t) => {
  await withTestnet(t)
  const src = await makeBase(t)
  await src.addNote({
    key: 'n1',
    value: { title: 'n1', note: '<p>n1</p>', addedAt: 1000, updatedAt: 1000 }
  })
  t.ok((await events(src)).includes(ACTIVITY_EVENT.NOTE_CREATED), 'source has activity to leak')

  const buffer = await src.exportBackup()
  // The payload is AES-GCM sealed, so search the plaintext markers instead:
  // an activity key or event name would have to appear somewhere in the file.
  const raw = b4a.toString(buffer, 'utf-8')
  t.absent(raw.includes('activity:'), 'no activity keys in the file')
  t.absent(raw.includes(ACTIVITY_EVENT.NOTE_CREATED), 'no activity event names in the file')
})

test('backup activity - restoring does not fabricate note history', async (t) => {
  await withTestnet(t)
  const buffer = await seededBackup(t)

  const dest = await makeBase(t)
  t.alike(await events(dest), [], 'fresh vault starts with an empty log')

  await dest.importBackup({ buffer })
  const after = await events(dest)

  t.absent(after.includes(ACTIVITY_EVENT.NOTE_CREATED), 'no note was recorded as newly created')
  t.absent(after.includes(ACTIVITY_EVENT.NOTE_EDITED), 'and none as edited')
  t.absent(after.includes(ACTIVITY_EVENT.FOLDER_CREATED), 'no folder either')
  t.alike(after, [ACTIVITY_EVENT.BACKUP_RESTORED], 'the only entry is that a backup was restored')

  t.is((await dest.getAllNotes()).length, 3, 'and the notes themselves did restore')
})

// The control. Without it the test above could be passing because activity is
// switched off or broken, rather than because the flag is doing its job.
test('backup activity - control: the same writes DO record when not marked', async (t) => {
  await withTestnet(t)
  const dest = await makeBase(t)

  await dest.addFolder({ key: 'f1', value: { title: 'Folder', addedAt: 1000, updatedAt: 1000 } })
  for (const key of ['n1', 'n2', 'n3']) {
    await dest.addNote({
      key,
      value: { title: key, note: `<p>${key}</p>`, folderKey: 'f1', addedAt: 1000, updatedAt: 1000 }
    })
  }

  const recorded = await events(dest)
  t.is(
    recorded.filter((e) => e === ACTIVITY_EVENT.NOTE_CREATED).length,
    3,
    'unmarked writes record one entry per note'
  )
  t.ok(recorded.includes(ACTIVITY_EVENT.FOLDER_CREATED), 'and one for the folder')
})

test('backup activity - ordinary writes after a restore still record', async (t) => {
  await withTestnet(t)
  const buffer = await seededBackup(t)
  const dest = await makeBase(t)
  await dest.importBackup({ buffer })

  await dest.addNote({
    key: 'written-after',
    value: { title: 'after', note: '<p>after</p>', addedAt: 2000, updatedAt: 2000 }
  })

  const after = await events(dest)
  t.is(
    after.filter((e) => e === ACTIVITY_EVENT.NOTE_CREATED).length,
    1,
    'the suppression applies to the restore only, not to the session that followed'
  )
})
