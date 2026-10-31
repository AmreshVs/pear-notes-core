import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { INDEXER_ERROR } from '../constant.js'
import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')
const dir = (name) => path.join(tmpdir(), `pn-vault-${name}-${Math.random().toString(36).slice(2)}`)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true
    await wait(200)
  }
  return false
}

async function pair(host, joiner, name) {
  const invite = await host.createInvite()
  let hostDone = false
  await host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  let result = null
  await joiner.subscribePairUser(
    (status) => {
      if (['done', 'error', 'rejected', 'expired', 'merge_failed'].includes(status.step)) {
        result = status.step
      }
    },
    invite.invite,
    name
  )
  await until(() => hostDone)
  return result
}

test('vault - writes survive a restart', async (t) => {
  await withTestnet(t)
  const storage = dir('restart')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  let base = new NoteBase({ storage, encryption: key('a') })
  await base.ready()
  await base.addNote({ key: 'n1', value: { title: 'one', note: '<p>1</p>', updatedAt: 1 } })
  await base.addFolder({ key: 'f1', value: { title: 'Folder', updatedAt: 1 } })
  t.is((await base.getNote('n1'))?.title, 'one', 'read your own write')
  await base.close()

  base = new NoteBase({ storage, encryption: key('a') })
  await base.ready()
  t.is((await base.getNote('n1'))?.note, '<p>1</p>', 'note survives a restart')
  t.is((await base.getFolder('f1'))?.title, 'Folder', 'folder survives a restart')
  t.ok(base.writable, 'still writable')
  t.is(base.getIndexerKeys().length, 1, 'a solo vault has one sync leader')
  await base.close()
})

test(
  'vault - pairing joins, merges local notes, and syncs both ways',
  { timeout: 180000 },
  async (t) => {
    await withTestnet(t)
    const hostDir = dir('host')
    const joinDir = dir('join')
    const host = new NoteBase({ storage: hostDir, encryption: key('h') })
    const joiner = new NoteBase({ storage: joinDir, encryption: key('j') })
    t.teardown(async () => {
      await host.close().catch(() => {})
      await joiner.close().catch(() => {})
      fs.rmSync(hostDir, { recursive: true, force: true })
      fs.rmSync(joinDir, { recursive: true, force: true })
    })
    await host.ready()
    await joiner.ready()
    await host.addNote({ key: 'from-host', value: { title: 'host', note: 'h', updatedAt: 1 } })
    await joiner.addNote({ key: 'pre-link', value: { title: 'mine', note: 'j', updatedAt: 1 } })

    t.is(await pair(host, joiner, 'Phone'), 'done', 'pairing completes')
    t.is(joiner.encryption, host.encryption, 'joiner adopted the vault key')
    t.ok(joiner.writable, 'joiner is a writer')
    t.absent(joiner.isLocalIndexer(), 'joiner is not a sync leader')

    t.ok(await until(async () => !!(await joiner.getNote('from-host'))), 'host note reached joiner')
    t.ok(await until(async () => !!(await host.getNote('pre-link'))), 'merged note reached host')

    await joiner.addNote({ key: 'edit', value: { title: 'j', note: 'x', updatedAt: Date.now() } })
    t.ok(await until(async () => !!(await host.getNote('edit'))), 'joiner write reached host')
    t.ok(
      await until(() => joiner.autobase.length === joiner.autobase.indexedLength),
      'joiner backlog drains'
    )
    const leftovers = fs.readdirSync(path.join(joinDir, 'vaults'))
    t.is(leftovers.length, 1, 'the joiner kept only the joined vault')
  }
)

async function pairedFleet(t, names) {
  const devices = []
  for (const name of names) {
    const storage = dir(name)
    const base = new NoteBase({ storage, encryption: key(name[0]) })
    await base.ready()
    devices.push({ name, storage, base })
  }
  t.teardown(async () => {
    for (const d of devices) {
      await d.base.close().catch(() => {})
      fs.rmSync(d.storage, { recursive: true, force: true })
    }
  })
  const [host, ...rest] = devices
  await host.base.addSyncedDevice({
    key: key('0'),
    value: { title: host.name, localKey: host.base.localKeyHex, updatedAt: 1 }
  })
  for (const d of rest) t.is(await pair(host.base, d.base, d.name), 'done', `${d.name} paired`)
  return devices.map((d) => d.base)
}

const drained = async (bases) => {
  for (const b of bases) if ((await b.unconfirmedWrites()) !== 0) return false
  return true
}

test(
  'vault - concurrent offline edits converge to one result everywhere',
  { timeout: 180000 },
  async (t) => {
    await withTestnet(t)
    const [a, b] = await pairedFleet(t, ['mac', 'phone'])
    await a.addNote({ key: 'shared', value: { title: 's', note: 'v0', updatedAt: 1 } })
    t.ok(await until(async () => (await b.getNote('shared'))?.note === 'v0'), 'phone has the note')

    await a.swarm.suspend()
    await b.swarm.suspend()
    for (let i = 1; i <= 5; i++) {
      await a.addNote({
        key: 'shared',
        value: { title: 's', note: `mac ${i}`, updatedAt: Date.now() }
      })
      await b.addNote({
        key: 'shared',
        value: { title: 's', note: `phone ${i}`, updatedAt: Date.now() }
      })
    }
    await a.swarm.resume()
    await a.swarm.flush()
    await b.swarm.resume()

    t.ok(await until(() => drained([a, b]), 60000), 'both backlogs drain')
    t.ok(
      await until(
        async () => (await a.getNote('shared'))?.note === (await b.getNote('shared'))?.note
      ),
      'both devices show the same final text'
    )
    const final = (await a.getNote('shared')).note
    t.ok(final === 'mac 5' || final === 'phone 5', `the winner is one of the last edits (${final})`)
  }
)

test('vault - activity folds edits and keeps a diff', async (t) => {
  await withTestnet(t)
  const storage = dir('activity')
  const base = new NoteBase({ storage, encryption: key('c') })
  t.teardown(async () => {
    await base.close()
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.ready()
  await base.updateSettings({ settings: { activityLogEnabled: true } })
  await base.addNote({ key: 'n', value: { title: 'T', note: '<p>one</p>', updatedAt: 1 } })
  await base.addNote({ key: 'n', value: { title: 'T', note: '<p>two</p>', updatedAt: 2 } })
  await base.addNote({ key: 'n', value: { title: 'T', note: '<p>three</p>', updatedAt: 3 } })
  await base.addNote({ key: 'n', value: { title: 'T2', note: '<p>three</p>', updatedAt: 4 } })

  const { entries } = await base.getActivity({ noteKey: 'n' })
  const events = entries.map((e) => e.event)
  t.alike(events, ['note.renamed', 'note.edited', 'note.created'], 'one entry per kind of change')
  const edit = entries.find((e) => e.event === 'note.edited')
  t.is(edit.ops, 2, 'two edits folded into one entry')
  const diff = await base.getActivityDiff(edit.id)
  t.is(diff.before, 'one', 'diff starts from before the run')
  t.is(diff.after, 'three', 'diff ends at the current text')

  await base.clearActivity()
  t.is((await base.getActivity({})).entries.length, 0, 'clear empties the log')
})

test(
  'vault - an attachment reaches the other device and is freed only when deleted',
  { timeout: 180000 },
  async (t) => {
    await withTestnet(t)
    const [a, b] = await pairedFleet(t, ['desk', 'tab'])
    const bytes = b4a.alloc(200 * 1024, 7)
    const link = await a.insertFile({ key: 'n/1_photo.png', buffer: bytes })
    t.ok(link.startsWith('http://hyperdrive/?'), 'link uses the portable prefix')
    await a.addNote({
      key: 'n',
      value: { title: 'pic', note: `<img src="${link}">`, updatedAt: 1 }
    })

    t.ok(await until(async () => (await b.getNote('n'))?.note.includes(link)), 'tab has the note')
    t.ok(
      await until(async () => {
        await b.media.scan()
        return b.getDownloadsInfo().length === 0 && b.media.cores.size === 1
      }, 60000),
      'tab downloaded the attachment'
    )

    await a.addNote({ key: 'n', value: { title: 'pic', note: '', updatedAt: 2 } })
    await a.pruneRemovedMedia('n', { note: `<img src="${link}">` }, { note: '' })
    const core = a.media.blobCore
    t.ok((await a.media.sweep()) === 0 && core.contiguousLength > 0, 'kept during retention')
    const { reclaimedBytes } = await a.reclaimOrphanedBlobs()
    t.ok(reclaimedBytes > 0, 'reclaim frees it at once')
  }
)

test('vault - two sync leaders, and a writer-only device', { timeout: 180000 }, async (t) => {
  await withTestnet(t)
  const [mac, tab, phone] = await pairedFleet(t, ['mac', 'tab', 'phone'])
  t.ok(await until(async () => (await mac.getAllSyncedDeviceKeys()).length >= 2), 'devices listed')
  await tab.publishLocalSwarmKey()
  t.ok(
    await until(async () =>
      mac.isSwarmKeyOnline((await mac.findDeviceByLocalKey(tab.localKeyHex))?.value.swarmKey)
    ),
    'tab is online for mac'
  )
  const result = await mac.setDeviceIndexer({ localKey: tab.localKeyHex, isIndexer: true })
  t.ok(result.changed, 'tab promoted')
  t.ok(
    await until(() => mac.getIndexerKeys().length === 2 && phone.getIndexerKeys().length === 2),
    'every device sees two leaders'
  )
  await phone.addNote({ key: 'p', value: { title: 'p', note: 'x', updatedAt: 1 } })
  t.ok(
    await until(() => drained([mac, tab, phone]), 60000),
    'writes from the writer-only device are confirmed'
  )
  t.ok(
    await until(async () => {
      for (const b of [mac, tab, phone])
        if ((await b.getDebugInfo()).autobase.backlog !== 0) return false
      return true
    }, 60000),
    "the backlog clears although the leaders' last acks stay unconfirmed"
  )

  await phone.publishLocalSwarmKey()
  t.ok(
    await until(async () =>
      mac.isSwarmKeyOnline((await mac.findDeviceByLocalKey(phone.localKeyHex))?.value.swarmKey)
    ),
    'phone is online for mac'
  )
  t.ok((await mac.setDeviceIndexer({ localKey: phone.localKeyHex, isIndexer: true })).changed)
  t.ok(await until(() => mac.getIndexerKeys().length === 3), 'three leaders')
  await t.exception(
    mac.setDeviceIndexer({ localKey: key('9'), isIndexer: true }),
    new RegExp(INDEXER_ERROR.MAX_LEADERS),
    'a fourth leader is refused'
  )
  t.ok((await mac.setDeviceIndexer({ localKey: tab.localKeyHex, isIndexer: false })).changed)
  t.ok(
    await until(() => phone.getIndexerKeys().length === 2 && !tab.isLocalIndexer()),
    'a leader can be removed'
  )
})

test(
  'vault - leaving waits until a sync leader has confirmed it',
  { timeout: 180000 },
  async (t) => {
    await withTestnet(t)
    const [mac, phone] = await pairedFleet(t, ['mac', 'phone'])
    t.ok(
      await until(async () => !!(await phone.findDeviceByLocalKey(phone.localKeyHex))),
      'phone sees itself'
    )
    const left = await phone.leaveSyncCluster({ timeoutMs: 30000 })
    t.alike(left, { left: true, replicated: true }, 'departure confirmed')
    t.ok(
      await until(async () => !(await mac.findDeviceByLocalKey(phone.localKeyHex))),
      'mac dropped the phone'
    )
    await wait(1500)
    t.absent(phone.isRemovedFromVault(), 'leaving is not recorded as being removed')
  }
)

test(
  'vault - a write made while suspended lands after resume and syncs',
  { timeout: 180000 },
  async (t) => {
    await withTestnet(t)
    const [a, b] = await pairedFleet(t, ['mac', 'phone'])
    await b.suspend()
    const write = b.addNote({ key: 'late', value: { title: 'l', note: 'x', updatedAt: 1 } })
    await wait(500)
    await b.resume()
    await write
    t.ok(await until(async () => !!(await a.getNote('late'))), 'the write reached the other device')
  }
)

test('vault - a sweep during an upload never frees its blocks', async (t) => {
  await withTestnet(t)
  const storage = dir('upload')
  const file = path.join(tmpdir(), 'pn-upload-' + Math.random().toString(36).slice(2))
  fs.writeFileSync(file, b4a.alloc(3 * 1024 * 1024, 9))
  const base = new NoteBase({ storage, encryption: key('u') })
  t.teardown(async () => {
    await base.close()
    fs.rmSync(storage, { recursive: true, force: true })
    fs.rmSync(file, { force: true })
  })
  await base.ready()

  let swept = null
  const link = await base.insertFileWithProgress('n/1_video.mp4', file, (sent) => {
    if (!swept && sent > 1024 * 1024)
      swept = Promise.all([base.media.sweep(), base.media.reclaim()])
  })
  await swept
  await base.media.sweep()
  await base.reclaimOrphanedBlobs()

  const entry = await base.hyperdrive.entry('n/1_video.mp4')
  const { blockOffset, blockLength } = entry.value.blob
  const core = base.media.blobCore
  let present = 0
  for (let i = blockOffset; i < blockOffset + blockLength; i++) if (await core.has(i)) present++
  t.ok(link.startsWith('http://hyperdrive/?'), 'upload finished')
  t.is(present, blockLength, 'every block of the fresh upload is still on disk')
})
