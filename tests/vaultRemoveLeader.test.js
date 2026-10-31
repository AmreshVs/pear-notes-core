import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'

import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('vault-remove-leader-key'), 'hex')
const storagePath = (name) =>
  path.join(tmpdir(), 'pn-remove-leader-' + name + '-' + Math.random().toString(36).slice(7))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function pair(host, candidate, deviceName) {
  const invite = await host.createInvite()
  let hostDone = false
  let candidateDone = false
  host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  const pairing = candidate.subscribePairUser(
    (status) => {
      if (status.step === 'done') candidateDone = true
    },
    invite.invite,
    deviceName
  )
  const start = Date.now()
  while (!(hostDone && candidateDone) && Date.now() - start < 55000) await wait(500)
  await pairing
  await wait(3000)
}

test('vault removal - a leader can leave while another device also leads', async (t) => {
  await withTestnet(t)
  const hostStorage = storagePath('host')
  const candidateStorage = storagePath('candidate')
  const host = new NoteBase({ storage: hostStorage, encryption })
  const candidate = new NoteBase({ storage: candidateStorage, encryption })
  t.teardown(async () => {
    await host._close().catch(() => {})
    await candidate._close().catch(() => {})
    fs.rmSync(hostStorage, { recursive: true, force: true })
    fs.rmSync(candidateStorage, { recursive: true, force: true })
  })

  await host.ready()
  await candidate.ready()
  await host.addSyncedDevice({
    key: 'host-device',
    value: {
      title: 'Host',
      deviceType: 'desktop',
      platform: 'darwin',
      localKey: b4a.toString(host.localKey, 'hex'),
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  await host.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })
  await pair(host, candidate, 'Test Phone')

  const candidateKey = b4a.toString(candidate.autobase.local.key, 'hex')
  await host.setDeviceIndexer({ localKey: candidateKey, isIndexer: true })
  const start = Date.now()
  while (host.getIndexerKeys().length < 2 && Date.now() - start < 30000) await wait(500)
  t.is(host.getIndexerKeys().length, 2, 'both devices lead the shared vault')

  const sharedId = host.listVaults()[0].id
  await host.createVault({ name: 'Other' })
  const result = await host.removeVault(sharedId)
  t.ok(result.left, 'the leader leaves the shared vault instead of being refused')
  t.absent(
    host.listVaults().some((vault) => vault.id === sharedId),
    'the shared vault is gone from this device'
  )
})

async function setUpSharedVault(t, name) {
  await withTestnet(t)
  const hostStorage = storagePath(name + '-host')
  const candidateStorage = storagePath(name + '-candidate')
  const host = new NoteBase({ storage: hostStorage, encryption })
  const candidate = new NoteBase({ storage: candidateStorage, encryption })
  t.teardown(async () => {
    await host._close().catch(() => {})
    await candidate._close().catch(() => {})
    fs.rmSync(hostStorage, { recursive: true, force: true })
    fs.rmSync(candidateStorage, { recursive: true, force: true })
  })
  await host.ready()
  await candidate.ready()
  await host.addSyncedDevice({
    key: 'host-device',
    value: {
      title: 'Host',
      deviceType: 'desktop',
      platform: 'darwin',
      localKey: b4a.toString(host.localKey, 'hex'),
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  await host.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })
  await pair(host, candidate, 'Test Phone')
  return { host, candidate }
}

test('vault removal - the only leader hands leadership to an online device', async (t) => {
  const { host, candidate } = await setUpSharedVault(t, 'handoff')
  t.is(host.getIndexerKeys().length, 1, 'the host is the only leader')

  const sharedId = host.listVaults()[0].id
  await host.createVault({ name: 'Other' })
  const result = await host.removeVault(sharedId)
  t.ok(result.left, 'the host leaves without being refused')
  const candidateKey = b4a.toString(candidate.autobase.local.key, 'hex')
  const start = Date.now()
  while (!candidate.getIndexerKeys().includes(candidateKey) && Date.now() - start < 30000) {
    await wait(500)
  }
  t.ok(candidate.getIndexerKeys().includes(candidateKey), 'the other device now leads the vault')
})

test('vault removal - forcing removes the only leader when nobody can take over', { timeout: 120000 }, async (t) => {
  const { host, candidate } = await setUpSharedVault(t, 'force')
  await candidate._close()

  const sharedId = host.listVaults()[0].id
  const otherId = await host.createVault({ name: 'Other' })
  await t.exception(host.removeVault(sharedId), /SYNC_LEADER|sync leader/i, 'refused without force')
  t.is(host.listVaults().length, 2, 'nothing removed yet')

  await host.switchVault(otherId)
  await host.removeVault(sharedId, { force: true })
  t.absent(
    host.listVaults().some((vault) => vault.id === sharedId),
    'the vault is removed once the user accepts the risk'
  )
})
