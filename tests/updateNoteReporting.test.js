// notesApi.updateNote used to swallow every failure and return undefined, which
// onCommandUpdateNote reported to the frontend as { done: true }. A write that
// never reached the core therefore looked exactly like a successful save.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import * as notesApi from '../backend/notesApi.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('update-report-key'), 'hex')
const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-update-report-' + Math.random().toString(36).slice(2, 9))

async function withApi(fn) {
  const storage = storagePath()
  await notesApi.ready({ storage, encryption })
  try {
    await fn()
  } finally {
    await notesApi.destroy().catch(() => {})
    try {
      if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
    } catch {
      // best effort
    }
  }
}

test('a real save reports done and moves updatedAt', async (t) => {
  await withTestnet(t)
  await withApi(async () => {
    const created = await notesApi.insertNote({ title: 'T', note: '<p>A</p>' })
    const key = created?.key || created
    const before = await notesApi.notesBase.getNote(key)

    const result = await notesApi.updateNote({ key, title: 'T', note: '<p>B</p>' })

    t.is(result?.done, true, 'the save reports done')
    const after = await notesApi.notesBase.getNote(key)
    t.is(after.note, '<p>B</p>', 'the new body is in the core')
    t.ok(after.updatedAt > before.updatedAt, 'and updatedAt moved')
  })
})

test('a write against a key the core does not have reports done:false', async (t) => {
  await withTestnet(t)
  await withApi(async () => {
    const result = await notesApi.updateNote({
      key: 'no-such-note-key',
      title: 'T',
      note: '<p>typed</p>'
    })

    t.is(result?.done, false, 'the frontend is told the note was not saved')
    t.is(result?.reason, 'NOTE_NOT_FOUND', 'and why')
  })
})

test('an append failure propagates instead of being reported as saved', async (t) => {
  await withTestnet(t)
  await withApi(async () => {
    const created = await notesApi.insertNote({ title: 'T', note: '<p>A</p>' })
    const key = created?.key || created

    const realAddNote = notesApi.notesBase.addNote.bind(notesApi.notesBase)
    notesApi.notesBase.addNote = async () => {
      throw new Error('BACKEND_TIMEOUT')
    }

    await t.exception(
      () => notesApi.updateNote({ key, title: 'T', note: '<p>lost</p>' }),
      'the failure reaches the caller rather than being swallowed'
    )

    notesApi.notesBase.addNote = realAddNote
    const after = await notesApi.notesBase.getNote(key)
    t.is(after.note, '<p>A</p>', 'and the core still holds the last good body')
  })
})
