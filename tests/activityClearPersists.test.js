// "It clears, but after I restart the activity is still there." A view is a pure
// function of the applied log, so a clear that vanishes on restart means the
// CLEAR_ACTIVITY node's effect is not durable across a reopen.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { ACTIVITY_LOG_ENABLED_KEY } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('activity-clear'), 'hex')

test('clearing the activity log survives a restart', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'actclear-' + Math.random().toString(36).slice(2, 9))
  t.teardown(() => {
    try {
      fs.rmSync(storage, { recursive: true, force: true })
    } catch {}
  })

  let base = new NoteBase({ storage, encryption })
  await base.ready()
  await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })

  const key = 'n1'
  const now = () => Date.now()
  await base.addNote({
    key,
    value: { title: 'A', note: '<p>seed</p>', addedAt: now(), updatedAt: now() }
  })
  for (let i = 0; i < 6; i++) {
    const at = now()
    await base.addNote({
      key,
      value: { title: 'A', note: `<p>edit ${i}</p>`, addedAt: at, updatedAt: at }
    })
  }

  const before = await base.getActivityStats()
  console.log('entries before clear:', before.count)
  t.ok(before.count > 0, 'there are entries to clear')

  await base.clearActivity()
  const cleared = await base.getActivityStats()
  console.log('entries right after clear:', cleared.count)
  t.is(cleared.count, 0, 'the clear takes effect in the live view')

  // Restart, the way closing and reopening the app does.
  await base._close()
  base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base._close().catch(() => {})
  })

  const afterRestart = await base.getActivityStats()
  console.log('entries after restart:', afterRestart.count)
  t.is(afterRestart.count, 0, 'and it is still cleared after a restart')

  const noteStillThere = await base.getNote(key)
  t.is(noteStillThere?.note, '<p>edit 5</p>', 'the note itself survived the restart')
})

// The case row-deletion could never handle: a note node that applies AFTER the
// clear - from a device that was offline during it, or an un-indexed node that
// re-linearizes later - used to recreate the entry it had just removed.
test('a note node that lands after the clear does not resurrect the log', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'actlate-' + Math.random().toString(36).slice(2, 9))
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base._close().catch(() => {})
    try {
      fs.rmSync(storage, { recursive: true, force: true })
    } catch {}
  })

  await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })

  const key = 'n1'
  const now = () => Date.now()
  await base.addNote({
    key,
    value: { title: 'A', note: '<p>seed</p>', addedAt: now(), updatedAt: now() }
  })
  for (let i = 0; i < 4; i++) {
    const at = now()
    await base.addNote({
      key,
      value: { title: 'A', note: `<p>edit ${i}</p>`, addedAt: at, updatedAt: at }
    })
  }
  t.ok((await base.getActivityStats()).count > 0, 'entries exist')

  await base.clearActivity()
  t.is((await base.getActivityStats()).count, 0, 'the clear empties the log')

  // A node stamped BEFORE the clear, applied after it: exactly what an offline
  // device delivers when it finally syncs.
  const stale = Date.now() - 60 * 60 * 1000
  await base.append({
    type: 'add_note',
    key,
    at: stale,
    value: { title: 'A', note: '<p>from the offline phone</p>', addedAt: stale, updatedAt: stale }
  })

  t.is(
    (await base.getActivityStats()).count,
    0,
    'the stale node does not resurrect a cleared entry'
  )

  // But a genuinely new edit after the clear still records.
  const at = now()
  await base.addNote({
    key,
    value: { title: 'A', note: '<p>after the clear</p>', addedAt: at, updatedAt: at }
  })
  t.ok((await base.getActivityStats()).count > 0, 'new activity after a clear is still recorded')

  // And it all still holds across a restart.
  await base._close()
  const reopened = new NoteBase({ storage, encryption })
  await reopened.ready()
  t.teardown(async () => {
    await reopened._close().catch(() => {})
  })
  const after = await reopened.getActivityStats()
  console.log('entries after restart:', after.count)
  t.is(after.count, 1, 'only the post-clear edit survives the restart')
})
