import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import BlindPairing from 'blind-pairing'
import hypercoreCrypto from 'hypercore-crypto'
import Hyperswarm from 'hyperswarm'

import NoteBase from '../backend/NoteBase.js'
import { readPointer } from '../backend/vault/layout.js'
import { maskedReply } from '../backend/vault/pairing.js'
import { PAIRING_HOST_UNVERIFIED, PAIRING_OUTDATED } from '../constant.js'
import { extractInvite, getInviteHostBox, formatDeviceInvite } from '../utils.js'
import { withTestnet } from './helpers/testnet.js'

const encryptionFor = (label) => b4a.toString(b4a.alloc(32).fill(label), 'hex')

async function openBase(t, label) {
  const storage = path.join(
    tmpdir(),
    `pear-notes-host-auth-${label}-${Math.random().toString(36).slice(2, 9)}`
  )
  const base = new NoteBase({ storage, encryption: encryptionFor(label) })
  t.teardown(async () => {
    await base.close().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.ready()
  return base
}

// A member that holds the invite and the vault key, but not the encryption key.
async function fakeMember(t, bootstrap, host, invite, forge) {
  const swarm = new Hyperswarm({ bootstrap })
  const pairing = new BlindPairing(swarm, { poll: 500 })
  t.teardown(async () => {
    await pairing.close().catch(() => {})
    await swarm.destroy().catch(() => {})
  })
  let answered = false
  const member = pairing.addMember({
    discoveryKey: host.discoveryKey,
    onadd: async (candidate) => {
      await candidate.open(b4a.from(invite.publicKey, 'hex'))
      const joinerBox = b4a.from(JSON.parse(b4a.toString(candidate.userData)).box, 'hex')
      candidate.confirm({ key: host.key, ...forge(candidate.inviteId, joinerBox) })
      answered = true
    }
  })
  await member.flushed()
  return () => answered
}

async function joinThroughFake(t, label, forge) {
  const { bootstrap } = await withTestnet(t)
  const host = await openBase(t, `${label}-host`)
  const joiner = await openBase(t, `${label}-joiner`)
  await joiner.addNote({ key: 'mine', value: { title: 'keep me' } })
  const before = { pointer: readPointer(joiner.path), key: b4a.from(joiner.encryptionKey) }

  const invite = await host.createInvite()
  const answered = await fakeMember(t, bootstrap, host, invite, (inviteId, joinerBox) =>
    forge({ invite, inviteId, joinerBox })
  )

  const statuses = []
  await joiner.subscribePairUser((status) => statuses.push(status), invite.invite, 'Phone')

  t.ok(answered(), 'the fake member answered')
  const last = statuses[statuses.length - 1]
  t.is(last.step, 'error')
  t.is(last.reason, PAIRING_HOST_UNVERIFIED)
  t.absent(
    statuses.some((s) => s.encryptionKey),
    'never reported a vault key'
  )
  t.alike(joiner.encryptionKey, before.key, 'still on its own vault key')
  t.alike(readPointer(joiner.path), before.pointer, 'nothing retired or replaced')
  t.is((await joiner.getNote('mine'))?.title, 'keep me', 'own notes untouched')
}

test('pairing - the link carries the host box key', async (t) => {
  await withTestnet(t)
  const host = await openBase(t, 'link-host')
  const invite = await host.createInvite()
  t.ok(/^[0-9a-f]{64}$/.test(getInviteHostBox(invite.invite)))
})

test(
  'pairing - a fake member answering with a bogus encryption key is refused',
  { timeout: 90000 },
  async (t) => {
    await joinThroughFake(t, 'bogus', ({ invite, inviteId, joinerBox }) =>
      maskedReply({
        encryptionKey: hypercoreCrypto.randomBytes(32),
        inviteId,
        invite: invite.invite,
        joinerBox
      })
    )
  }
)

test(
  'pairing - a fake member replaying the host box from the link is refused',
  { timeout: 90000 },
  async (t) => {
    await joinThroughFake(t, 'replay', ({ invite }) => {
      const hostBox = b4a.from(getInviteHostBox(invite.invite), 'hex')
      const { seed } = BlindPairing.decodeInvite(b4a.from(extractInvite(invite.invite), 'hex'))
      return {
        encryptionKey: hypercoreCrypto.randomBytes(32),
        additional: {
          data: hostBox,
          signature: hypercoreCrypto.sign(hostBox, hypercoreCrypto.keyPair(seed).secretKey)
        }
      }
    })
  }
)

test('pairing - a link without the host box asks for an update', async (t) => {
  await withTestnet(t)
  const host = await openBase(t, 'nobox-host')
  const joiner = await openBase(t, 'nobox-joiner')
  const invite = await host.createInvite()
  const statuses = []
  await joiner.subscribePairUser(
    (status) => statuses.push(status),
    formatDeviceInvite(extractInvite(invite.invite), ''),
    'Phone'
  )
  t.is(statuses.length, 1)
  t.is(statuses[0].reason, PAIRING_OUTDATED.INVITE)
})

test('pairing - a stored invite from before the host box is replaced', async (t) => {
  await withTestnet(t)
  const host = await openBase(t, 'upgrade-host')
  const first = await host.createInvite()
  await host.removeNote('@invite')
  await host.addNote({
    key: '@invite',
    value: { ...first, invite: formatDeviceInvite(extractInvite(first.invite), '') }
  })
  const next = await host.createInvite()
  t.not(next.id, first.id)
  t.ok(getInviteHostBox(next.invite))
})
