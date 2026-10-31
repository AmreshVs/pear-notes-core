import test from 'brittle'
import Autobase from 'autobase'
import b4a from 'b4a'
import BlindPairing from 'blind-pairing'
import Corestore from 'corestore'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { createJoinProof, provesWriterKey } from '../backend/vault/pairing.js'

const hex = (value) => b4a.toString(value, 'hex')

async function localCore(t) {
  const dir = path.join(tmpdir(), `join-proof-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const store = new Corestore(dir)
  const core = Autobase.getLocalCore(store)
  await core.ready()
  t.teardown(async () => {
    await core.close()
    await store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return core
}

function inviteId() {
  const { invite } = BlindPairing.createInvite(b4a.alloc(32, 1))
  return BlindPairing.decodeInvite(invite).id
}

const box = (fill = 7) => b4a.alloc(32, fill)

test('join proof - the joiner proves the writer key it claims', async (t) => {
  const core = await localCore(t)
  const id = inviteId()
  t.ok(provesWriterKey(id, hex(core.key), box(), createJoinProof(core, id, box())))
})

test('join proof - a copied proof cannot carry a different box key', async (t) => {
  const core = await localCore(t)
  const id = inviteId()
  const proof = createJoinProof(core, id, box(1))
  t.absent(provesWriterKey(id, hex(core.key), box(2), proof))
  t.absent(provesWriterKey(id, hex(core.key), null, proof))
})

test('join proof - a known member key without its secret is not proven', async (t) => {
  const member = await localCore(t)
  const attacker = await localCore(t)
  const id = inviteId()
  t.absent(provesWriterKey(id, hex(member.key), box(), null), 'no proof')
  t.absent(
    provesWriterKey(id, hex(member.key), box(), createJoinProof(attacker, id, box())),
    'own manifest'
  )
})

test('join proof - a proof for another invite does not carry over', async (t) => {
  const core = await localCore(t)
  t.absent(
    provesWriterKey(inviteId(), hex(core.key), box(), createJoinProof(core, inviteId(), box()))
  )
})

test('join proof - malformed proofs are rejected', async (t) => {
  const core = await localCore(t)
  const id = inviteId()
  const proof = createJoinProof(core, id, box())
  t.absent(provesWriterKey(id, hex(core.key), box(), { ...proof, signature: '00' }))
  t.absent(provesWriterKey(id, hex(core.key), box(), { ...proof, manifest: 'zz' }))
  t.absent(provesWriterKey(id, hex(core.key), box(), { manifest: 1, signature: 2 }))
})
