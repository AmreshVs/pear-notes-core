import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import * as notesApi from '../backend/notesApi.js'
import { withTestnet } from './helpers/testnet.js'
// A renderer reload sends `ready` again while the previous one may still be opening.
test(
  'notesApi - overlapping ready calls leave one open, writable vault',
  { timeout: 120000 },
  async (t) => {
    await withTestnet(t)
    const storage = path.join(tmpdir(), 'pn-reload-' + Math.random().toString(36).slice(2))
    const encryption = b4a.toString(b4a.alloc(32).fill(1), 'hex')
    t.teardown(async () => {
      await notesApi.destroy().catch(() => {})
      fs.rmSync(storage, { recursive: true, force: true })
    })
    await notesApi.ready({ storage, encryption })
    const first = notesApi.ready({ storage, encryption })
    await new Promise((r) => setTimeout(r, 5))
    const second = notesApi.ready({ storage, encryption })
    const results = await Promise.allSettled([first, second])
    t.ok(
      results.every((r) => r.status === 'fulfilled'),
      'both ready calls succeed'
    )
    await notesApi.notesBase.addNote({ key: 'x', value: { title: 'x', note: 'x', updatedAt: 1 } })
    t.ok(await notesApi.notesBase.getNote('x'), 'the vault is writable')
  }
)
