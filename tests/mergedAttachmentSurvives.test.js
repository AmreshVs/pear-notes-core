import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { RECENTLY_DELETED_KEY, TRASH_RETENTION_MS } from '../constant.js'
import NoteBase from '../backend/NoteBase.js'
import { rangeOf } from '../backend/vault/media.js'
import { withTestnet } from './helpers/testnet.js'

const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')

test(
  'an attachment copied into another note survives the original expiring from trash',
  { timeout: 120000 },
  async (t) => {
    await withTestnet(t)
    const storage = path.join(tmpdir(), `pn-merge-media-${Math.random().toString(36).slice(2)}`)
    t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))
    const base = new NoteBase({ storage, encryption: key('m') })
    t.teardown(() => base.close())
    await base.ready()

    const bytes = b4a.alloc(300 * 1024, 9)
    const link = await base.insertFile({ key: 'orig/1_lease.pdf', buffer: bytes })
    const tag = `<div data-file-attachment="" url="${link}" fileName="lease.pdf"></div>`
    await base.addNote({ key: 'orig', value: { title: 'Lease', note: tag, updatedAt: 1 } })
    await base.addNote({
      key: 'merged',
      value: { title: 'All', note: `<p>x</p>${tag}`, updatedAt: 2 }
    })

    const now = Date.now()
    await base.addNote({
      key: 'orig',
      value: {
        title: 'Lease',
        note: tag,
        updatedAt: 3,
        folderKey: RECENTLY_DELETED_KEY,
        deletedAt: now - TRASH_RETENTION_MS - 1000
      }
    })
    t.is(await base.purgeExpiredTrash(now), 1, 'the original expired')
    t.absent(await base.getNote('orig'), 'and is gone')

    await base.media.sweep({ retain: false })
    await base.reclaimOrphanedBlobs()

    const range = rangeOf(link)
    const core = base.media.blobCore
    const start = range.blockOffset
    const end = range.blockOffset + range.blockLength
    let present = true
    for (let i = start; i < end; i++) present = present && (await core.has(i))
    t.ok(present, 'the merged note still has every block of the attachment')
    t.ok((await base.getNote('merged'))?.note.includes(link), 'and still links to it')
  }
)
