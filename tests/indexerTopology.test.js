import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { INDEXER_ERROR } from '../constant.js'
import NoteBase from '../backend/NoteBase.js'

import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('indexer-topology-key'), 'hex')

const storagePath = (name) =>
  path.join(tmpdir(), 'pn-indexer-' + name + '-' + Math.random().toString(36).slice(7))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const backlog = (base) => base.autobase.length - base.autobase.indexedLength

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

test('indexer topology - a paired device joins as a writer, not an indexer', async (t) => {
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
  await host.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })

  await pair(host, candidate, 'Test Phone')

  t.is(host.getIndexerKeys().length, 1, 'the vault keeps exactly one indexer after pairing')
  t.ok(host.isLocalIndexer(), 'the founding device is the indexer')
  t.absent(candidate.isLocalIndexer(), 'the joining device is not an indexer')
  t.ok(candidate.autobase.writable, 'the joining device is still writable')

  await candidate.addNote({
    key: 'from-candidate',
    value: { title: 'written by the writer-only device', note: 'p', folderKey: 'f' }
  })
  await wait(6000)
  const onHost = await host.getNote('from-candidate')
  t.is(
    onHost?.title,
    'written by the writer-only device',
    'a writer-only device still contributes edits'
  )
})

test('indexer topology - a lone indexer keeps indexing while other devices are offline', async (t) => {
  await withTestnet(t)
  const hostStorage = storagePath('lone-host')
  const candidateStorage = storagePath('lone-candidate')

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
  await host.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })

  await pair(host, candidate, 'Test Phone')
  await candidate._close()

  for (let i = 0; i < 40; i++) {
    await host.addNote({ key: 'n' + i, value: { title: 'n' + i, note: 'b', folderKey: 'f' } })
  }
  await wait(20000)

  t.is(backlog(host), 0, 'the un-indexed backlog stays empty with the other device offline')
})

test('indexer topology - transferring the role leaves exactly one indexer', async (t) => {
  await withTestnet(t)
  const hostStorage = storagePath('xfer-host')
  const candidateStorage = storagePath('xfer-candidate')

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
  await host.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })

  await pair(host, candidate, 'Test Phone')
  t.ok(host.isLocalIndexer(), 'the founder starts as the indexer')

  const candidateKey = b4a.toString(candidate.autobase.local.key, 'hex')
  const result = await host.transferIndexer({ localKey: candidateKey })
  t.ok(result.changed, 'the transfer reports a change')
  await wait(15000)

  t.is(host.getIndexerKeys().length, 1, 'exactly one indexer remains after the transfer')
  t.is(host.getIndexerKeys()[0], candidateKey, 'the target device holds the role')
  t.absent(host.isLocalIndexer(), 'the previous indexer stepped down')
})

test('indexer topology - guards refuse to strand the vault', async (t) => {
  await withTestnet(t)
  const hostStorage = storagePath('guard-host')
  const host = new NoteBase({ storage: hostStorage, encryption })

  t.teardown(async () => {
    await host._close().catch(() => {})
    fs.rmSync(hostStorage, { recursive: true, force: true })
  })

  await host.ready()
  await host.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })

  await t.exception(
    host.setDeviceIndexer({ localKey: host.localKeyHex, isIndexer: false }),
    new RegExp(INDEXER_ERROR.LAST_INDEXER),
    'demoting the only indexer is refused'
  )

  await t.exception(
    host.setDeviceIndexer({
      localKey: b4a.toString(b4a.alloc(32).fill('z'), 'hex'),
      isIndexer: true
    }),
    new RegExp(INDEXER_ERROR.DEVICE_OFFLINE),
    'promoting a device that is not reachable is refused'
  )

  const unchanged = await host.setDeviceIndexer({ localKey: host.localKeyHex, isIndexer: true })
  t.is(unchanged.changed, false, 'promoting an existing indexer is a no-op')
})
