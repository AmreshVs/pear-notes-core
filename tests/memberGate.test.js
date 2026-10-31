// A device removed from a vault keeps the vault key, so encryption alone cannot
// revoke it. These pin the replacement: only current writers are replicated with.
import test from 'brittle'
import NoiseSecretStream from '@hyperswarm/secret-stream'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { MemberGate, VERDICT, createProof, verifyProof } from '../backend/vault/memberGate.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('member-gate-key'), 'hex')
const discoveryKey = b4a.alloc(32, 7)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hex = (value) => b4a.toString(value, 'hex')

const tmp = (name) =>
  path.join(tmpdir(), 'pear-notes-member-' + name + '-' + Math.random().toString(36).slice(2))

function cleanup(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch {}
  }
}

async function until(predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await wait(250)
  }
  return false
}

async function streamPair() {
  const a = new NoiseSecretStream(true)
  const b = new NoiseSecretStream(false)
  a.rawStream.pipe(b.rawStream).pipe(a.rawStream)
  await Promise.all([a.opened, b.opened])
  return [a, b]
}

async function writerCore(t, name) {
  const dir = tmp(name)
  const store = new Corestore(dir)
  const core = store.get({ name: 'local' })
  await core.ready()
  t.teardown(async () => {
    await store.close()
    cleanup(dir)
  })
  return core
}

test('proof - a valid proof names the core key it was signed for', async (t) => {
  const core = await writerCore(t, 'valid')
  const [a, b] = await streamPair()
  const proof = createProof(a, discoveryKey, core)
  const writer = verifyProof(b, discoveryKey, proof)
  t.ok(writer && b4a.equals(writer, core.key), 'the verifier learns the signer writer key')
  a.destroy()
  b.destroy()
})

test('proof - forged, replayed, reflected or rebound proofs are refused', async (t) => {
  const core = await writerCore(t, 'forge')
  const other = await writerCore(t, 'other')
  const [a, b] = await streamPair()
  const [c, d] = await streamPair()

  const proof = createProof(a, discoveryKey, core)

  const tampered = { ...proof, signature: b4a.from(proof.signature) }
  tampered.signature[0] ^= 1
  t.is(verifyProof(b, discoveryKey, tampered), null, 'a tampered signature is refused')

  t.is(
    verifyProof(d, discoveryKey, proof),
    null,
    'a proof replayed on another connection is refused'
  )
  t.is(verifyProof(a, discoveryKey, proof), null, 'a proof reflected back to its sender is refused')
  t.is(verifyProof(b, b4a.alloc(32, 9), proof), null, 'a proof for another vault is refused')

  const rebound = { manifest: other.getManifest({ raw: true }), signature: proof.signature }
  t.is(verifyProof(b, discoveryKey, rebound), null, "a signature cannot claim another core's key")

  t.is(verifyProof(b, discoveryKey, { manifest: b4a.alloc(3), signature: proof.signature }), null)
  for (const s of [a, b, c, d]) s.destroy()
})

async function gatedPair(t, verdictFor, opts = {}, optsB = {}) {
  const coreA = await writerCore(t, 'gate-a')
  const coreB = await writerCore(t, 'gate-b')
  const [a, b] = await streamPair()
  const admittedOnA = []
  const gateA = new MemberGate({
    discoveryKey,
    localCore: () => coreA,
    verdict: async (writer) => verdictFor(writer),
    admit: (stream, writer) => admittedOnA.push(hex(writer)),
    ...opts
  })
  const gateB = new MemberGate({
    discoveryKey,
    localCore: () => coreB,
    verdict: async () => VERDICT.MEMBER,
    admit: () => {},
    ...optsB
  })
  gateA.add(a)
  gateB.add(b)
  t.teardown(() => {
    gateA.close()
    gateB.close()
    a.destroy()
    b.destroy()
  })
  return { a, gateA, admittedOnA, writerA: hex(coreA.key), writerB: hex(coreB.key) }
}

test('gate - a member is admitted with its proven writer key', async (t) => {
  const { admittedOnA, writerB } = await gatedPair(t, () => VERDICT.MEMBER)
  t.ok(await until(() => admittedOnA.length === 1, 3000), 'admitted')
  t.is(admittedOnA[0], writerB)
})

test('gate - an unknown writer waits, and is admitted once it becomes a member', async (t) => {
  let verdict = VERDICT.UNKNOWN
  const { a, gateA, admittedOnA } = await gatedPair(t, () => verdict)
  await wait(500)
  t.is(admittedOnA.length, 0, 'nothing is replicated with a writer the vault does not list')
  t.absent(a.destroyed, 'but the connection stays up, so pairing can still use it')
  verdict = VERDICT.MEMBER
  gateA.recheck()
  t.ok(await until(() => admittedOnA.length === 1, 3000), 'admitted after the add lands')
})

test('gate - a removed writer is refused outright', async (t) => {
  const { a, admittedOnA } = await gatedPair(t, () => VERDICT.REMOVED)
  t.ok(await until(() => a.destroyed, 3000), 'connection dropped')
  t.is(admittedOnA.length, 0, 'never replicated with')
})

test('gate - a removed writer is told so before it is dropped', async (t) => {
  const told = []
  const { a, writerA } = await gatedPair(
    t,
    () => VERDICT.REMOVED,
    {},
    { onRemoved: (writer) => told.push(hex(writer)) }
  )
  t.ok(await until(() => told.length === 1, 3000), 'the removed side hears it')
  t.is(told[0], writerA, 'from the writer that proved itself')
  t.ok(await until(() => a.destroyed, 3000), 'and is dropped after')
})

test('gate - a member that gets removed is told while still connected', async (t) => {
  let verdict = VERDICT.MEMBER
  const told = []
  const { gateA, admittedOnA } = await gatedPair(
    t,
    () => verdict,
    { graceMs: 5000 },
    { onRemoved: (writer) => told.push(hex(writer)) }
  )
  t.ok(await until(() => admittedOnA.length === 1, 3000))
  verdict = VERDICT.REMOVED
  gateA.recheck()
  gateA.recheck()
  t.ok(await until(() => told.length === 1, 3000), 'told once')
  await wait(300)
  t.is(told.length, 1, 'and only once')
})

test('gate - a member that gets removed is dropped after the grace period', async (t) => {
  let verdict = VERDICT.MEMBER
  const { a, gateA, admittedOnA } = await gatedPair(t, () => verdict, {
    graceMs: 300,
    departedGraceMs: 5000
  })
  t.ok(await until(() => admittedOnA.length === 1, 3000), 'admitted while a member')
  verdict = VERDICT.REMOVED
  gateA.recheck()
  t.ok(await until(() => a.destroyed, 2000), 'dropped once removed')
})

test('gate - a device that removed itself gets the longer grace', async (t) => {
  let verdict = VERDICT.MEMBER
  const { a, gateA, admittedOnA } = await gatedPair(t, () => verdict, {
    graceMs: 300,
    departedGraceMs: 1500
  })
  t.ok(await until(() => admittedOnA.length === 1, 3000))
  verdict = VERDICT.DEPARTED
  gateA.recheck()
  await wait(800)
  t.absent(a.destroyed, 'still connected inside the departure grace')
  t.ok(await until(() => a.destroyed, 3000), 'dropped after it')
})

test('gate - a peer let in while the vault was empty must prove membership later', async (t) => {
  let verdict = VERDICT.OPEN
  const { a, gateA, admittedOnA } = await gatedPair(t, () => verdict, { graceMs: 200 })
  t.ok(await until(() => admittedOnA.length === 1, 3000), 'admitted while bootstrapping')
  verdict = VERDICT.UNKNOWN
  gateA.recheck()
  t.ok(await until(() => a.destroyed, 2000), 'dropped once the member list says otherwise')
})

test('gate - a peer that never sends a proof is never replicated with', async (t) => {
  const core = await writerCore(t, 'silent')
  const [a, b] = await streamPair()
  let admitted = false
  const gate = new MemberGate({
    discoveryKey,
    localCore: () => core,
    verdict: async () => VERDICT.MEMBER,
    admit: () => {
      admitted = true
    }
  })
  gate.add(a)
  await wait(800)
  t.absent(admitted)
  gate.close()
  a.destroy()
  b.destroy()
})

async function pairDevices(t, host, joiner) {
  await host.addSyncedDevice({
    key: 'host-device',
    value: {
      title: 'Host',
      deviceType: 'desktop',
      platform: 'darwin',
      localKey: host.localKeyHex,
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  const invite = await host.createInvite()
  let hostDone = false
  let joinerDone = false
  host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  const pairing = joiner.subscribePairUser((status) => {
    if (status.step === 'done') joinerDone = true
  }, invite.invite)
  t.ok(await until(() => hostDone && joinerDone, 120000), 'paired')
  await pairing
}

async function hasNote(base, key) {
  await base.autobase?.update().catch(() => {})
  return (await base.getAllNotes()).some((note) => note.key === key)
}

test(
  'NoteBase - a device removed by another device stops receiving new notes',
  { timeout: 240000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = tmp('host')
    const joinerStorage = tmp('joiner')
    const host = new NoteBase({ storage: hostStorage, encryption })
    const joiner = new NoteBase({ storage: joinerStorage, encryption })
    t.teardown(async () => {
      await host.destroy().catch(() => {})
      await joiner.destroy().catch(() => {})
      cleanup(hostStorage, joinerStorage)
    })
    await host.ready()
    await joiner.ready()
    await pairDevices(t, host, joiner)

    const joinerKey = joiner.localKeyHex
    await host.addNote({ key: 'before-removal', value: { title: 'a', note: 'a', updatedAt: 1 } })
    t.ok(
      await until(() => hasNote(joiner, 'before-removal'), 30000),
      'control: a member receives new notes'
    )
    t.ok(host.memberGate.admitted().map(hex).includes(joinerKey), 'the host replicates with it')

    let joinerToldRemoved = false
    joiner.on('device-removed', () => {
      joinerToldRemoved = true
    })

    const record = await until(async () => {
      await host.autobase.update()
      return !!(await host.findDeviceByLocalKey(joinerKey))
    }, 30000)
    t.ok(record, 'the host lists the joiner')
    await host.removeSyncedDevice((await host.findDeviceByLocalKey(joinerKey)).key)

    t.ok(
      await until(() => !host.memberGate.admitted().map(hex).includes(joinerKey), 15000),
      'the host drops the removed device'
    )
    t.ok(joinerToldRemoved, 'the removed device learnt it was removed before the cut')
    t.ok(joiner.isRemovedFromVault(), 'and remembers it')

    await host.addNote({ key: 'after-removal', value: { title: 'b', note: 'b', updatedAt: 2 } })
    await wait(8000)
    t.absent(await hasNote(joiner, 'after-removal'), 'the removed device gets no new notes')
    t.absent(
      host.memberGate.admitted().map(hex).includes(joinerKey),
      'and its reconnects are refused'
    )
  }
)

test(
  'NoteBase - a device removed while offline and behind is told on reconnect',
  { timeout: 240000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = tmp('host-behind')
    const joinerStorage = tmp('joiner-behind')
    const host = new NoteBase({ storage: hostStorage, encryption })
    let joiner = new NoteBase({ storage: joinerStorage, encryption })
    t.teardown(async () => {
      await host.destroy().catch(() => {})
      await joiner.destroy().catch(() => {})
      cleanup(hostStorage, joinerStorage)
    })
    await host.ready()
    await joiner.ready()
    await pairDevices(t, host, joiner)

    const joinerKey = joiner.localKeyHex
    t.ok(
      await until(async () => {
        await host.autobase.update()
        return !!(await host.findDeviceByLocalKey(joinerKey))
      }, 30000),
      'the host lists the joiner'
    )
    await joiner.close()

    for (let i = 0; i < 40; i++) {
      await host.addNote({ key: 'missed-' + i, value: { title: 'm', note: 'm', updatedAt: i } })
    }
    await host.removeSyncedDevice((await host.findDeviceByLocalKey(joinerKey)).key)

    joiner = new NoteBase({ storage: joinerStorage, encryption })
    let told = false
    joiner.on('device-removed', () => {
      told = true
    })
    await joiner.ready()
    t.ok(joiner.writable, 'its own log still says it is a writer')
    t.ok(await until(() => told, 30000), 'the removed device is told it was removed')
    t.absent(await hasNote(joiner, 'missed-39'), 'without being served what it missed')

    await host.close()
    await joiner.close()
    joiner = new NoteBase({ storage: joinerStorage, encryption })
    await joiner.ready()
    t.ok(joiner.isRemovedFromVault(), 'the removal survives a restart with no one online')

    const otherStorage = tmp('other-vault')
    const other = new NoteBase({ storage: otherStorage, encryption })
    t.teardown(async () => {
      await other.destroy().catch(() => {})
      cleanup(otherStorage)
    })
    await other.ready()
    t.absent(other.isRemovedFromVault(), 'and belongs to that vault only')
  }
)

test(
  'NoteBase - an outsider with the vault and discovery keys gets no blocks',
  { timeout: 120000 },
  async (t) => {
    const { bootstrap } = await withTestnet(t)
    const hostStorage = tmp('host-outsider')
    const outsiderDir = tmp('outsider')
    const host = new NoteBase({ storage: hostStorage, encryption })
    const store = new Corestore(outsiderDir)
    const swarm = new Hyperswarm({ bootstrap })
    t.teardown(async () => {
      await swarm.destroy().catch(() => {})
      await store.close().catch(() => {})
      await host.destroy().catch(() => {})
      cleanup(hostStorage, outsiderDir)
    })
    await host.ready()
    await host.addNote({ key: 'secret', value: { title: 's', note: 's', updatedAt: 1 } })
    t.ok(host.autobase.local.length > 0, 'the host has blocks to leak')

    // A writer key of its own, so it can answer the proof - just not a member's.
    const own = store.get({ name: 'local' })
    await own.ready()
    let connected = false
    swarm.on('connection', (connection) => {
      connected = true
      const gate = new MemberGate({
        discoveryKey: host.discoveryKey,
        localCore: () => own,
        verdict: async () => VERDICT.OPEN,
        admit: (stream) => store.replicate(stream)
      })
      gate.add(connection)
    })
    await host.swarm.flush()
    swarm.join(host.discoveryKey, { client: true, server: false })
    await swarm.flush()
    t.ok(await until(() => connected, 30000), 'the outsider reaches the host over the topic')

    const target = store.get({ key: host.autobase.local.key })
    await target.ready()
    const block = await target.get(0, { timeout: 8000 }).catch(() => null)
    t.is(block, null, 'no block of the vault is served to it')
  }
)
