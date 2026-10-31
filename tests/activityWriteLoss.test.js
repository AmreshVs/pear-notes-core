// Mirrors the user's bisect: the same note saves fine with the activity log off
// and loses its content with the activity log on.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { ACTIVITY_LOG_ENABLED_KEY } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('activity-loss'), 'hex')

function body(n, items = 300) {
  const li = []
  for (let i = 0; i < items; i++) {
    li.push(
      `<li data-type="taskItem" data-checked="${i < n}"><label><input type="checkbox"></label><div><p>Item ${i}</p></div></li>`
    )
  }
  return `<ul data-type="taskList">${li.join('')}</ul>`
}

async function withBase(t, fn) {
  const storage = path.join(tmpdir(), 'actloss-' + Math.random().toString(36).slice(2, 9))
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    try {
      fs.rmSync(storage, { recursive: true, force: true })
    } catch {}
  })
  await fn(base)
}

test('the exact bisect: off saves, on loses', async (t) => {
  await withTestnet(t)
  await withBase(t, async (base) => {
    const key = 'thenote'
    const now = () => Date.now()

    // Activity OFF (the default).
    await base.addNote({
      key,
      value: { title: 'Checklist', note: body(0), addedAt: now(), updatedAt: now() }
    })
    let at = now()
    await base.addNote({
      key,
      value: { title: 'Checklist', note: body(1), addedAt: at, updatedAt: at }
    })
    let stored = await base.getNote(key)
    t.is(stored.note, body(1), 'with activity off the edit persists')

    // Turn activity ON.
    await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })

    at = now()
    await base.addNote({
      key,
      value: { title: 'Checklist', note: body(2), addedAt: at, updatedAt: at }
    })
    stored = await base.getNote(key)
    t.is(stored.note, body(2), 'with activity on the edit should still persist')

    at = now()
    await base.addNote({
      key,
      value: { title: 'Checklist', note: body(3), addedAt: at, updatedAt: at }
    })
    stored = await base.getNote(key)
    t.is(stored.note, body(3), 'and so should the next one')

    const activity = await base.getActivity({ noteKey: key, limit: 50 })
    console.log('activity entries for the note:', activity.entries.length)
  })
})

test('clearing the activity log', async (t) => {
  await withTestnet(t)
  await withBase(t, async (base) => {
    await base.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })
    const key = 'n1'
    const now = () => Date.now()
    await base.addNote({
      key,
      value: { title: 'A', note: '<p>one</p>', addedAt: now(), updatedAt: now() }
    })
    for (let i = 0; i < 5; i++) {
      const at = now()
      await base.addNote({
        key,
        value: { title: 'A', note: `<p>body ${i}</p>`, addedAt: at, updatedAt: at }
      })
    }

    const before = await base.getActivityStats()
    console.log('entries before clear:', before.count)
    t.ok(before.count > 0, 'there is something to clear')

    const t0 = Date.now()
    await base.clearActivity()
    console.log('clearActivity took', Date.now() - t0, 'ms')

    const after = await base.getActivityStats()
    console.log('entries after clear:', after.count)
    t.is(after.count, 0, 'the log is actually cleared')
  })
})
