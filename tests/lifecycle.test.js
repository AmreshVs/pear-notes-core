import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import http from 'bare-http1'
import { withTestnet } from './helpers/testnet.js'
import { decode, encode } from '../spec/hyperschema/index.js'
import { Duplex } from 'streamx'
import FramedStream from 'framed-stream'
import HRPC from '../spec/hrpc/index.js'

const roundTrip = (name, value) => decode(name, encode(name, value))

const encryption = b4a.toString(b4a.alloc(32).fill('lifecycle-key'), 'hex')

const storagePath = (name = 'base') =>
  path.join(tmpdir(), 'pear-notes-lifecycle-' + name + '-' + Math.random().toString(36).slice(2))

async function waitFor(label, predicate, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('timed out waiting for ' + label)
}

function probe(address) {
  const url = new URL(address)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: url.hostname, port: Number(url.port), path: '/', method: 'GET' },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

test('suspend then resume restores a listening hyperdrive server', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })

  const before = base.getHyperdriveAddress()
  t.ok(before.startsWith('http://127.0.0.1:'), 'address looks right: ' + before)
  t.ok(base.blobServer.server.listening, 'server listening before suspend')
  await probe(before)

  await base.suspend()
  t.absent(base.blobServer.server, 'server released while suspended')
  t.ok(base.swarm.suspended, 'swarm suspended')

  await base.resume()
  t.ok(base.blobServer.server.listening, 'server listening again after resume')

  const deadline = Date.now() + 5000
  while (base.swarm.suspended && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  t.absent(base.swarm.suspended, 'swarm resumed in the background')

  const chore = await base.getChore()
  t.is(chore.hyperdriveServerAddress, before, 'port is preserved across suspend/resume')
  await probe(chore.hyperdriveServerAddress)
  t.pass('resumed server answers requests on ' + chore.hyperdriveServerAddress)
})

test('getChore heals a server socket that died without a suspend event', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })

  const deadSocket = base.blobServer.server
  await new Promise((resolve) => deadSocket.close(resolve))
  t.ok(deadSocket.closing, 'socket is dead')

  const chore = await base.getChore()
  t.not(base.blobServer.server, deadSocket, 'getChore built a fresh server')
  t.ok(base.blobServer.server.listening, 'getChore re-listened the server')
  await probe(chore.hyperdriveServerAddress)
  t.pass('healed server answers on ' + chore.hyperdriveServerAddress)
})

test('resume is safe when nothing was suspended', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })

  const before = base.getHyperdriveAddress()
  await base.resume()
  t.is(base.getHyperdriveAddress(), before, 'address unchanged')
  t.ok(base.blobServer.server.listening, 'still listening')
})

async function pairedVaults(t, name) {
  const hostStorage = storagePath(name + '-host')
  const peerStorage = storagePath(name + '-peer')
  const host = new NoteBase({ storage: hostStorage, encryption })
  const peer = new NoteBase({ storage: peerStorage, encryption })

  t.teardown(async () => {
    await host.destroy().catch(() => {})
    await peer.destroy().catch(() => {})
    fs.rmSync(hostStorage, { recursive: true, force: true })
    fs.rmSync(peerStorage, { recursive: true, force: true })
  })

  await host.ready()
  await peer.ready()

  await host.addNote({ key: 'before-pairing', value: { content: 'first' } })

  const invite = await host.createInvite()
  let hostDone = false
  let peerDone = false

  host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })

  const pairPromise = peer.subscribePairUser(
    (status) => {
      if (status.step === 'done') peerDone = true
    },
    invite.invite,
    name + '-peer'
  )

  await waitFor('pairing to finish', async () => hostDone && peerDone, 55000)
  await pairPromise

  await waitFor('the first note to sync', async () => {
    await peer.autobase.update()
    return !!(await peer.getNote('before-pairing'))
  })
  t.pass('peer synced before suspending')
  return { host, peer }
}

async function receivesWhileAway(t, host, peer) {
  await waitFor('the peer to reconnect', async () => peer.swarm.connections.size > 0)
  t.pass('peer reconnected to the swarm after resuming')

  await waitFor('the missed note to arrive', async () => {
    await peer.autobase.update()
    return !!(await peer.getNote('while-away'))
  })
  t.pass('peer received the note written while it was suspended')
}

const swarmIsLive = (swarm) =>
  !swarm.destroyed && !swarm.suspended && !swarm.dht.suspended && !swarm.server.suspended

test('a suspended peer resumes and receives edits made while it was away', async (t) => {
  await withTestnet(t)
  const { host, peer } = await pairedVaults(t, 'resume')

  const addressBefore = peer.getHyperdriveAddress()
  await peer.suspend()
  t.ok(peer.swarm.suspended, 'peer swarm is suspended')
  t.absent(peer.blobServer.server, 'peer hyperdrive server is released')

  await host.addNote({ key: 'while-away', value: { content: 'second' } })

  const chore = await peer.getChore()
  t.is(chore.hyperdriveServerAddress, addressBefore, 'peer keeps its hyperdrive address')

  await peer.resume()
  await receivesWhileAway(t, host, peer)
})

// iOS freezes the process right after the suspend handler returns, so a swarm
// suspend that ran past its budget finishes only once the app is back.
test('a swarm suspend that outlives its budget does not park the dht after resume', async (t) => {
  await withTestnet(t)
  const { host, peer } = await pairedVaults(t, 'late-suspend')

  const dht = peer.swarm.dht
  const suspendDht = dht.suspend.bind(dht)
  dht.suspend = async (opts) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    return suspendDht(opts)
  }

  await peer.suspend()
  t.ok(peer.swarm.suspended, 'swarm reads as suspended')
  t.absent(dht.suspended, 'its dht suspend is still pending')

  await host.addNote({ key: 'while-away', value: { content: 'second' } })
  await peer.resume()
  t.ok(swarmIsLive(peer.swarm), 'swarm is live right after resume')

  await new Promise((resolve) => setTimeout(resolve, 2000))
  t.ok(swarmIsLive(peer.swarm), 'swarm is still live once the late suspend would have landed')

  await receivesWhileAway(t, host, peer)
})

test('a swarm suspend that never finishes is replaced on resume', async (t) => {
  await withTestnet(t)
  const { host, peer } = await pairedVaults(t, 'stuck-suspend')

  const stuck = peer.swarm
  const suspendDht = stuck.dht.suspend.bind(stuck.dht)
  stuck.dht.suspend = async (opts) => {
    await suspendDht(opts)
    await new Promise(() => {})
  }

  await peer.suspend()
  await host.addNote({ key: 'while-away', value: { content: 'second' } })
  await peer.resume()

  t.not(peer.swarm, stuck, 'a fresh swarm replaced the stuck one')
  t.ok(swarmIsLive(peer.swarm), 'the fresh swarm is live')
  t.ok(stuck.destroyed, 'the stuck swarm was destroyed')
  t.is(peer.getSwarmKeyHex(), b4a.toString(stuck.keyPair.publicKey, 'hex'), 'same swarm identity')

  await receivesWhileAway(t, host, peer)
})

test('an idle check rebuilds a swarm left suspended while the app is active', async (t) => {
  await withTestnet(t)
  const { host, peer } = await pairedVaults(t, 'idle-stuck')

  const stuck = peer.swarm
  await stuck.dht.suspend()
  t.ok(stuck.dht.suspended, 'dht parked without our suspend')

  await host.addNote({ key: 'while-away', value: { content: 'second' } })
  await peer._reconnectIfAlone()

  t.not(peer.swarm, stuck, 'a fresh swarm replaced the parked one')
  t.ok(swarmIsLive(peer.swarm), 'the fresh swarm is live')
  await receivesWhileAway(t, host, peer)
})

test('suspend and resume commands survive the hrpc wire', async (t) => {
  const suspendReq = roundTrip('@notes/command-suspend-services-request', {})
  t.ok(suspendReq, 'suspend request encodes with no fields')

  const suspendRes = roundTrip('@notes/command-suspend-services-response', { done: true })
  t.is(suspendRes.done, true, 'suspend response carries done')

  const resumeReq = roundTrip('@notes/command-resume-services-request', {})
  t.ok(resumeReq, 'resume request encodes with no fields')

  const address = 'http://127.0.0.1:49833/'
  const resumeRes = roundTrip('@notes/command-resume-services-response', {
    hyperdriveServerAddress: address
  })
  t.is(
    resumeRes.hyperdriveServerAddress,
    address,
    'resume returns the address, so a port change after wake reaches the UI'
  )
})

function pair() {
  let a, b
  a = new Duplex({
    write(data, cb) {
      b.push(data)
      cb(null)
    }
  })
  b = new Duplex({
    write(data, cb) {
      a.push(data)
      cb(null)
    }
  })
  return [a, b]
}

test('suspend/resume commands dispatch across a real hrpc pair', async (t) => {
  const [left, right] = pair()
  const client = new HRPC(new FramedStream(left))
  const server = new HRPC(new FramedStream(right))

  let suspendCalls = 0
  let resumeCalls = 0

  server.onCommandSuspendServices(async () => {
    suspendCalls++
    return { done: true }
  })
  server.onCommandResumeServices(async () => {
    resumeCalls++
    return { hyperdriveServerAddress: 'http://127.0.0.1:51000/' }
  })

  const suspended = await client.commandSuspendServices({})
  t.is(suspendCalls, 1, 'suspend handler ran')
  t.is(suspended.done, true, 'suspend result came back')

  const resumed = await client.commandResumeServices({})
  t.is(resumeCalls, 1, 'resume handler ran')
  t.is(
    resumed.hyperdriveServerAddress,
    'http://127.0.0.1:51000/',
    'resume result came back with the address'
  )
})
