import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { SWARM_SEED_FILE } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('presence-test-key'), 'hex')

const getStoragePath = (name) =>
  path.join(tmpdir(), 'pear-notes-presence-' + name + '-' + Math.random().toString(36).slice(2))

function cleanupStorage(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch {
      // best effort cleanup
    }
  }
}

test('NoteBase - swarm identity is stable across restarts', { timeout: 120000 }, async (t) => {
  await withTestnet(t)
  const storage = getStoragePath('stable')
  try {
    cleanupStorage(storage)

    const first = new NoteBase({ storage, encryption })
    await first.ready()
    const firstKey = first.getSwarmKeyHex()
    t.ok(firstKey, 'a swarm key is published after startup')
    t.ok(fs.existsSync(path.join(storage, SWARM_SEED_FILE)), 'the seed is persisted on disk')
    await first.destroy()

    const second = new NoteBase({ storage, encryption })
    await second.ready()
    t.is(second.getSwarmKeyHex(), firstKey, 'the same device keeps the same swarm key')
    await second.destroy()
  } finally {
    cleanupStorage(storage)
  }
})

test('NoteBase - presence is reported per device record', { timeout: 120000 }, async (t) => {
  await withTestnet(t)
  const storage = getStoragePath('records')
  try {
    cleanupStorage(storage)

    const base = new NoteBase({ storage, encryption })
    await base.ready()

    const localKeyHex = b4a.toString(base.localKey, 'hex')
    await base.addSyncedDevice({
      key: 'local-device',
      value: {
        title: 'This device',
        deviceType: 'desktop',
        platform: 'darwin',
        localKey: localKeyHex,
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })
    await base.addSyncedDevice({
      key: 'legacy-device',
      value: {
        title: 'Old phone',
        deviceType: 'mobile',
        platform: 'ios',
        localKey: 'aa'.repeat(32),
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })
    await base.addSyncedDevice({
      key: 'remote-device',
      value: {
        title: 'New phone',
        deviceType: 'mobile',
        platform: 'android',
        localKey: 'bb'.repeat(32),
        swarmKey: 'cc'.repeat(32),
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })

    const local = await base.getSyncedDevice('local-device')
    t.ok(local.isLocal, 'this device is flagged as local')
    t.ok(local.isOnline, 'this device is always online')
    t.ok(local.presenceKnown, 'this device always has known presence')

    const legacy = await base.getSyncedDevice('legacy-device')
    t.absent(legacy.presenceKnown, 'a device with no swarm key has unknown presence')
    t.absent(legacy.isOnline, 'a device with no swarm key is not claimed to be online')

    const remote = await base.getSyncedDevice('remote-device')
    t.ok(remote.presenceKnown, 'a device with a swarm key has known presence')
    t.absent(remote.isOnline, 'a disconnected device reports offline')

    base._connectedSwarmKeys.add('cc'.repeat(32))
    const connected = await base.getSyncedDevice('remote-device')
    t.ok(connected.isOnline, 'a device whose swarm key is connected reports online')

    t.ok(
      await base.hasSyncedDeviceWithLocalKey('bb'.repeat(32)),
      'a known writer key is recognised as already verified'
    )
    t.absent(
      await base.hasSyncedDeviceWithLocalKey('dd'.repeat(32)),
      'an unknown writer key is not treated as verified'
    )

    await base.destroy()
  } finally {
    cleanupStorage(storage)
  }
})

test(
  'NoteBase - publishing the swarm key stamps this device only',
  { timeout: 120000 },
  async (t) => {
    await withTestnet(t)
    const storage = getStoragePath('publish')
    try {
      cleanupStorage(storage)

      const base = new NoteBase({ storage, encryption })
      await base.ready()

      await base.addSyncedDevice({
        key: 'mine',
        value: {
          title: 'This device',
          deviceType: 'desktop',
          platform: 'darwin',
          localKey: b4a.toString(base.localKey, 'hex'),
          addedAt: Date.now(),
          updatedAt: Date.now()
        }
      })
      await base.addSyncedDevice({
        key: 'theirs',
        value: {
          title: 'Other device',
          deviceType: 'mobile',
          platform: 'ios',
          localKey: 'ee'.repeat(32),
          addedAt: Date.now(),
          updatedAt: Date.now()
        }
      })

      await base.publishLocalSwarmKey()

      const mine = await base.getRawSyncedDevice('mine')
      const theirs = await base.getRawSyncedDevice('theirs')
      t.is(mine.swarmKey, base.getSwarmKeyHex(), 'this device record carries our swarm key')
      t.absent(theirs.swarmKey, 'other device records are left untouched')

      await base.destroy()
    } finally {
      cleanupStorage(storage)
    }
  }
)
