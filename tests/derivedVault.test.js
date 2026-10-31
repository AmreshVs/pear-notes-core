import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')
const dir = () => path.join(tmpdir(), `pn-derived-vault-${Math.random().toString(36).slice(2)}`)

test('derived store - per vault, survives restart, gone with Clear storage', async (t) => {
  await withTestnet(t)
  const storage = dir()
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  let base = new NoteBase({ storage, encryption: key('d') })
  await base.ready()
  t.ok(base.derived, 'opened with the vault')
  await base.derived.put('vectors', 'note-1', 10, b4a.from('v1'))
  const firstId = base.listVaults()[0].id

  const secondId = await base.createVault({ name: 'Second' })
  t.is(await base.derived.get('vectors', 'note-1'), null, 'another vault has its own store')
  await base.derived.put('vectors', 'note-2', 1, b4a.from('v2'))
  await base.switchVault(firstId)
  t.is(b4a.toString((await base.derived.get('vectors', 'note-1')).value), 'v1')
  t.is(await base.derived.get('vectors', 'note-2'), null)
  await base.close()
  t.is(base.derived, null, 'closed with the vault')

  base = new NoteBase({ storage, encryption: key('d') })
  await base.ready()
  t.is((await base.derived.get('vectors', 'note-1')).version, 10, 'survives a restart')
  t.ok(secondId)
  await base.clearStorage()
  t.absent(fs.existsSync(storage), 'Clear storage removes it')
})
