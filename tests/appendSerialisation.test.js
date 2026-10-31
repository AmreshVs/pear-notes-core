// A slow autobase.append used to be abandoned by _withDeadline, so the serial
// _appendChain started the next one on top of it and every caller waited for
// both. Field log for one 24KB note: append 15003ms, then 29726ms.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('append-serial'), 'hex')

test('a slow append never overlaps the next one', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'appser-' + Math.random().toString(36).slice(2, 9))
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base._close().catch(() => {})
    try {
      fs.rmSync(storage, { recursive: true, force: true })
    } catch {}
  })

  const key = 'n1'
  const now = () => Date.now()
  await base.addNote({
    key,
    value: { title: 'A', note: '<p>seed</p>', addedAt: now(), updatedAt: now() }
  })

  // Make every autobase.append slower than the budget, and count overlaps.
  const realAppend = base.autobase.append.bind(base.autobase)
  let inFlight = 0
  let maxInFlight = 0
  base.autobase.append = async (...args) => {
    inFlight++
    if (inFlight > maxInFlight) maxInFlight = inFlight
    try {
      await new Promise((r) => setTimeout(r, 300))
      return await realAppend(...args)
    } finally {
      inFlight--
    }
  }

  const writes = []
  for (let i = 0; i < 5; i++) {
    const at = now()
    writes.push(
      base.addNote({
        key,
        value: { title: 'A', note: `<p>edit ${i}</p>`, addedAt: at, updatedAt: at }
      })
    )
  }
  await Promise.all(writes)

  console.log('peak concurrent autobase.append calls:', maxInFlight)
  t.is(maxInFlight, 1, 'the chain stays serial even when each append is slow')

  // Concurrent writes all read the same base version, so which one wins is an
  // LWW tie-break, not "the last one". A settled write is what must stick.
  const at = now()
  await base.addNote({
    key,
    value: { title: 'A', note: '<p>final</p>', addedAt: at, updatedAt: at }
  })
  base.autobase.append = realAppend

  const stored = await base.getNote(key)
  t.is(stored?.note, '<p>final</p>', 'a write made after the burst still lands')
})
