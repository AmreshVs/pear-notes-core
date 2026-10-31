import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('leave-cluster-key'), 'hex')

const getStoragePath = (name) =>
  path.join(tmpdir(), 'pear-notes-leave-' + name + '-' + Math.random().toString(36).slice(2))

function cleanupStorage(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch {
      // best effort cleanup
    }
  }
}

async function waitFor(predicate, timeoutMs, t, label) {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      t.fail('timeout waiting for ' + label)
      return false
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return true
}

async function deviceLocalKeys(base) {
  const keys = await base.getAllSyncedDeviceKeys()
  const localKeys = []
  for (const key of keys) {
    const device = await base.getRawSyncedDevice(key)
    if (device?.localKey) localKeys.push(device.localKey)
  }
  return localKeys
}

test('leaveSyncCluster - no-ops when this device is the only member', async (t) => {
  await withTestnet(t)
  const storage = getStoragePath('solo')
  try {
    cleanupStorage(storage)
    const base = new NoteBase({ storage, encryption })
    await base.ready()

    await base.addSyncedDevice({
      key: 'only-device',
      value: {
        title: 'This device',
        deviceType: 'desktop',
        platform: 'darwin',
        localKey: b4a.toString(base.localKey, 'hex'),
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })

    const result = await base.leaveSyncCluster({ timeoutMs: 1000 })
    t.absent(result.left, 'a solo device does not announce a departure')
    t.is((await base.getAllSyncedDeviceKeys()).length, 1, 'its own record is left in place')

    await base.destroy()
  } finally {
    cleanupStorage(storage)
  }
})

test('leaveSyncCluster - no-ops when this device has no record yet', async (t) => {
  await withTestnet(t)
  const storage = getStoragePath('unregistered')
  try {
    cleanupStorage(storage)
    const base = new NoteBase({ storage, encryption })
    await base.ready()

    await base.addSyncedDevice({
      key: 'someone-else',
      value: {
        title: 'Other device',
        deviceType: 'mobile',
        platform: 'ios',
        localKey: 'ff'.repeat(32),
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })

    const result = await base.leaveSyncCluster({ timeoutMs: 1000 })
    t.absent(result.left, 'a device with no record of its own announces nothing')
    t.is((await base.getAllSyncedDeviceKeys()).length, 1, 'the other device record is untouched')

    await base.destroy()
  } finally {
    cleanupStorage(storage)
  }
})

test(
  'NoteBase - resetting a linked device removes it from the other device',
  { timeout: 180000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('host')
    const joinerStorage = getStoragePath('joiner')

    try {
      cleanupStorage(hostStorage, joinerStorage)

      const host = new NoteBase({ storage: hostStorage, encryption })
      const joiner = new NoteBase({ storage: joinerStorage, encryption })
      await host.ready()
      await joiner.ready()

      const hostLocalKey = b4a.toString(host.localKey, 'hex')
      await host.addSyncedDevice({
        key: 'host-device',
        value: {
          title: 'Host',
          deviceType: 'desktop',
          platform: 'darwin',
          localKey: hostLocalKey,
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

      const pairPromise = joiner.subscribePairUser((status) => {
        if (status.step === 'done') joinerDone = true
      }, invite.invite)

      await waitFor(() => hostDone && joinerDone, 120000, t, 'pairing to finish')
      await pairPromise

      const joinerLocalKey = b4a.toString(joiner.localKey, 'hex')

      await waitFor(
        async () => {
          await host.autobase.update()
          return (await deviceLocalKeys(host)).includes(joinerLocalKey)
        },
        30000,
        t,
        'the host to list the joiner'
      )
      t.ok(
        (await deviceLocalKeys(host)).includes(joinerLocalKey),
        'the host lists the joiner after pairing'
      )

      let joinerReportedRemoved = false
      joiner.on('device-removed', () => {
        joinerReportedRemoved = true
      })

      const result = await joiner.leaveSyncCluster({ timeoutMs: 30000 })
      t.ok(result.left, 'the joiner announced its departure')
      t.ok(result.replicated, 'the departure reached the host before the wipe')

      await waitFor(
        async () => {
          await host.autobase.update()
          return !(await deviceLocalKeys(host)).includes(joinerLocalKey)
        },
        30000,
        t,
        'the host to drop the joiner'
      )

      const remaining = await deviceLocalKeys(host)
      t.absent(
        remaining.includes(joinerLocalKey),
        'the reset device is gone from the host - no ghost entry left behind'
      )
      t.ok(remaining.includes(hostLocalKey), 'the host still lists itself')

      t.absent(
        joinerReportedRemoved,
        'a self-inflicted departure does not raise the device-removed alarm'
      )

      await host.destroy()
      await joiner.destroy()
    } finally {
      cleanupStorage(hostStorage, joinerStorage)
    }
  }
)
