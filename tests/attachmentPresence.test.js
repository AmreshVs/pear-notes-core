import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import HypercoreID from 'hypercore-id-encoding'

import NoteBase from '../backend/NoteBase.js'
import { normalizeAttachmentUrls } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')

test('own attachments are local, links into a core this device lacks are not', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), `pn-presence-${Math.random().toString(36).slice(2)}`)
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))
  const base = new NoteBase({ storage, encryption: key('p') })
  t.teardown(() => base.close())
  await base.ready()

  const own = normalizeAttachmentUrls(
    await base.insertFile({ key: 'n/1_scan.pdf', buffer: b4a.alloc(64 * 1024, 3) })
  )
  const remote = own.replace(/key=[^&]+/, `key=${HypercoreID.encode(b4a.alloc(32, 7))}`)
  const external = 'https://example.com/a.png'

  const missing = await base.missingMediaUrls([own, remote, external])
  t.absent(missing.has(own))
  t.ok(missing.has(remote))
  t.absent(missing.has(external))
})
