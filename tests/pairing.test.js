import test from 'brittle'
import NoteBase from '../backend/NoteBase.js'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir, platform } from 'bare-os'
import { createKeyring, keyringPrefId } from '../backend/lockCrypto.js'
import { readPointer } from '../backend/vault/layout.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('test-encryption-key'), 'hex')
const getStoragePath = (name) =>
  path.join(
    tmpdir(),
    'pear-notes-pairing-test-' + name + '-' + Math.random().toString(36).substring(7)
  )

const INVITE_KEY = '@invite'
const CANDIDATE_DEVICE_NAME = "Amresh's iPhone"

async function waitFor(predicate, timeoutMs, t, label) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      t.fail('timeout waiting for ' + label)
      return false
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return true
}

async function pollAsync(predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    if (await predicate()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function cleanupStorage(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch {}
  }
}

async function countRemoteSyncedDevices(base) {
  const keys = await base.getAllSyncedDeviceKeys()
  let count = 0
  for (const key of keys) {
    const device = await base.getSyncedDevice(key)
    if (device && !device.isLocal) count++
  }
  return count
}

test('NoteBase - end-to-end pairing with platform info', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  const hostStorage = getStoragePath('host')
  const candidateStorage = getStoragePath('candidate')

  try {
    if (fs.existsSync(hostStorage)) fs.rmSync(hostStorage, { recursive: true, force: true })
    if (fs.existsSync(candidateStorage))
      fs.rmSync(candidateStorage, { recursive: true, force: true })

    const host = new NoteBase({ storage: hostStorage, encryption })
    const candidate = new NoteBase({ storage: candidateStorage, encryption })

    await host.ready()
    await candidate.ready()

    await host.addNote({ key: 'test-node', value: { content: 'hello' } })

    const invite = await host.createInvite()
    t.ok(invite.invite, 'invite created')

    let hostConfirmationStepReached = false
    let hostReceivedPlatform = null
    let hostReceivedDeviceName = null
    let hostDone = false
    let candidateDone = false

    let hostReportedRemoteKey = null
    let candidateReportedLocalKey = null

    host.subscribePairing((status) => {
      console.log('[host status]', status.step)
      if (status.step === 'confirmation') {
        hostConfirmationStepReached = true
        hostReceivedPlatform = status.platform
        hostReceivedDeviceName = status.deviceName
        hostReportedRemoteKey = status.userData
        host.confirmPairing()
      }
      if (status.step === 'done') {
        hostDone = true
      }
    })

    const pairPromise = candidate.subscribePairUser(
      (status) => {
        console.log('[candidate status]', status.step)
        if (status.step === 'searching') {
          candidateReportedLocalKey = status.localKey
        }
        if (status.step === 'done') {
          candidateDone = true
        }
      },
      invite.invite,
      CANDIDATE_DEVICE_NAME
    )

    const start = Date.now()
    while (!(hostDone && candidateDone)) {
      if (Date.now() - start > 55000) {
        console.log('Timeout status:', { hostDone, candidateDone, hostConfirmationStepReached })
        t.fail('Pairing status timeout after 55s')
        break
      }
      await new Promise((r) => setTimeout(r, 1000))
    }

    await pairPromise

    t.ok(hostConfirmationStepReached, 'host reached confirmation step')
    t.is(hostReceivedPlatform, platform(), 'host received correct platform from candidate')
    t.is(
      hostReceivedDeviceName,
      CANDIDATE_DEVICE_NAME,
      'host received the candidate device name in the confirmation step'
    )

    t.ok(hostReportedRemoteKey, 'host reported a remote key in confirmation step')
    t.ok(candidateReportedLocalKey, 'candidate reported a local key in searching step')
    t.is(
      candidateReportedLocalKey,
      hostReportedRemoteKey,
      'candidate localKey matches host userData (both devices UI will show the same code)'
    )

    const syncedDevices = await host.getAllSyncedDeviceKeys()
    t.ok(syncedDevices.length > 0, 'host has synced devices')

    let foundOtherDevice = false
    for (const key of syncedDevices) {
      const device = await host.getSyncedDevice(key)
      if (!device.isLocal) {
        t.is(device.platform, platform(), 'synced device platform matches candidate platform')
        t.is(
          device.title,
          CANDIDATE_DEVICE_NAME,
          'synced device is stored under the candidate device name, not a random hash'
        )
        t.is(
          device.localKey,
          b4a.toString(candidate.localKey, 'hex'),
          'synced device key matches candidate key'
        )
        foundOtherDevice = true
      }
    }
    t.ok(foundOtherDevice, 'found other device in host synced devices')

    await host.destroy()
    await candidate.destroy()
  } finally {
    try {
      if (fs.existsSync(hostStorage)) fs.rmSync(hostStorage, { recursive: true, force: true })
    } catch {}
    try {
      if (fs.existsSync(candidateStorage))
        fs.rmSync(candidateStorage, { recursive: true, force: true })
    } catch {}
  }
})

test(
  'NoteBase - host rejecting candidate emits rejected and leaves both sides clean',
  { timeout: 60000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('reject-host')
    const candidateStorage = getStoragePath('reject-candidate')

    try {
      await cleanupStorage(hostStorage, candidateStorage)

      const host = new NoteBase({ storage: hostStorage, encryption })
      const candidate = new NoteBase({ storage: candidateStorage, encryption })

      await host.ready()
      await candidate.ready()

      await host.addNote({ key: 'secret-note', value: { content: 'must not leak' } })

      const invite = await host.createInvite()
      t.ok(invite.invite, 'invite created')

      let hostReachedConfirmation = false
      let candidateRejected = false
      let candidateDone = false

      host.subscribePairing((status) => {
        console.log('[reject host]', status.step)
        if (status.step === 'confirmation') {
          hostReachedConfirmation = true
          host.rejectPairing()
        }
      })

      const pairPromise = candidate.subscribePairUser((status) => {
        console.log('[reject candidate]', status.step)
        if (status.step === 'rejected') candidateRejected = true
        if (status.step === 'done') candidateDone = true
      }, invite.invite)

      await waitFor(() => candidateRejected || candidateDone, 55000, t, 'candidate rejected')
      await pairPromise.catch(() => {})

      t.ok(hostReachedConfirmation, 'host reached confirmation before rejecting')
      t.ok(candidateRejected, 'candidate received rejected status')
      t.absent(candidateDone, 'candidate never reached done')

      const remoteDevices = await countRemoteSyncedDevices(host)
      t.is(remoteDevices, 0, 'host did not add candidate as a synced device after reject')

      const inviteAfter = await host.getNote(INVITE_KEY)
      t.absent(inviteAfter, 'invite removed from host after reject')

      await host.destroy()
      await candidate.destroy()
    } finally {
      await cleanupStorage(hostStorage, candidateStorage)
    }
  }
)

test(
  'NoteBase - accepting on one linked device dismisses others and still pairs the new device',
  { timeout: 120000 },
  async (t) => {
    await withTestnet(t)
    const aStorage = getStoragePath('multi-accept-a')
    const bStorage = getStoragePath('multi-accept-b')
    const cStorage = getStoragePath('multi-accept-c')

    try {
      await cleanupStorage(aStorage, bStorage, cStorage)

      const a = new NoteBase({ storage: aStorage, encryption })
      const b = new NoteBase({ storage: bStorage, encryption })

      await a.ready()
      await b.ready()

      await a.addNote({ key: 'cluster-note', value: { content: 'shared cluster data' } })

      let cPhase = false
      let aReadyToConfirmC = false

      a.subscribePairing((status) => {
        console.log('[multi-accept A]', status.step)
        if (status.step === 'confirmation') {
          if (!cPhase) a.confirmPairing()
          else aReadyToConfirmC = true
        }
      })

      const invite1 = await a.createInvite()
      let bLinked = false
      const bPair = b.subscribePairUser((status) => {
        console.log('[multi-accept B pairing]', status.step)
        if (status.step === 'done') bLinked = true
      }, invite1.invite)

      await waitFor(() => bLinked, 55000, t, 'device B linked into cluster')
      await bPair
      t.ok(bLinked, 'device B linked into cluster')

      cPhase = true
      const bSteps = []
      let bAtConfirmationForC = false
      b.subscribePairing((status) => {
        console.log('[multi-accept B watch]', status.step)
        bSteps.push(status.step)
        if (status.step === 'confirmation') bAtConfirmationForC = true
      })

      const invite2 = await a.createInvite()
      t.ok(invite2.invite, 'second invite created for new device C')

      const c = new NoteBase({ storage: cStorage, encryption })
      await c.ready()
      let cDone = false
      const cPair = c.subscribePairUser((status) => {
        console.log('[multi-accept C pairing]', status.step)
        if (status.step === 'done') cDone = true
      }, invite2.invite)

      await waitFor(
        () => aReadyToConfirmC && bAtConfirmationForC,
        55000,
        t,
        'both A and B reached confirmation for C'
      )
      t.ok(bAtConfirmationForC, 'device B showed confirmation prompt for C')

      a.confirmPairing()

      await waitFor(() => cDone, 55000, t, 'device C paired successfully')
      await cPair
      t.ok(cDone, 'device C paired successfully even though B never confirmed')

      await waitFor(() => bSteps.includes('idle'), 15000, t, 'device B confirmation dismissed')
      t.ok(bSteps.includes('idle'), 'device B confirmation dismissed to idle after A accepted')
      t.not(bSteps[bSteps.length - 1], 'confirmation', 'device B is not stuck at confirmation')

      await a.destroy()
      await b.destroy()
      await c.destroy()
    } finally {
      await cleanupStorage(aStorage, bStorage, cStorage)
    }
  }
)

test(
  'NoteBase - rejecting on one linked device dismisses others and rejects the new device',
  { timeout: 120000 },
  async (t) => {
    await withTestnet(t)
    const aStorage = getStoragePath('multi-reject-a')
    const bStorage = getStoragePath('multi-reject-b')
    const cStorage = getStoragePath('multi-reject-c')

    try {
      await cleanupStorage(aStorage, bStorage, cStorage)

      const a = new NoteBase({ storage: aStorage, encryption })
      const b = new NoteBase({ storage: bStorage, encryption })

      await a.ready()
      await b.ready()

      await a.addNote({ key: 'cluster-note', value: { content: 'shared cluster data' } })

      let cPhase = false
      let aReadyToRejectC = false

      a.subscribePairing((status) => {
        console.log('[multi-reject A]', status.step)
        if (status.step === 'confirmation') {
          if (!cPhase) a.confirmPairing()
          else aReadyToRejectC = true
        }
      })

      const invite1 = await a.createInvite()
      let bLinked = false
      const bPair = b.subscribePairUser((status) => {
        console.log('[multi-reject B pairing]', status.step)
        if (status.step === 'done') bLinked = true
      }, invite1.invite)

      await waitFor(() => bLinked, 55000, t, 'device B linked into cluster')
      await bPair
      t.ok(bLinked, 'device B linked into cluster')

      cPhase = true
      const bSteps = []
      let bAtConfirmationForC = false
      b.subscribePairing((status) => {
        console.log('[multi-reject B watch]', status.step)
        bSteps.push(status.step)
        if (status.step === 'confirmation') bAtConfirmationForC = true
      })

      const invite2 = await a.createInvite()
      t.ok(invite2.invite, 'second invite created for new device C')

      const c = new NoteBase({ storage: cStorage, encryption })
      await c.ready()
      let cRejected = false
      let cDone = false
      const cPair = c.subscribePairUser((status) => {
        console.log('[multi-reject C pairing]', status.step)
        if (status.step === 'rejected') cRejected = true
        if (status.step === 'done') cDone = true
      }, invite2.invite)

      await waitFor(
        () => aReadyToRejectC && bAtConfirmationForC,
        55000,
        t,
        'both A and B reached confirmation for C'
      )
      t.ok(bAtConfirmationForC, 'device B showed confirmation prompt for C')

      a.rejectPairing()

      await waitFor(() => cRejected || cDone, 55000, t, 'device C received a terminal status')
      await cPair.catch(() => {})
      t.ok(cRejected, 'device C received rejected status')
      t.absent(cDone, 'device C never reached done')

      await waitFor(() => bSteps.includes('idle'), 15000, t, 'device B confirmation dismissed')
      t.ok(bSteps.includes('idle'), 'device B confirmation dismissed to idle after A rejected')
      t.not(bSteps[bSteps.length - 1], 'confirmation', 'device B is not stuck at confirmation')

      const remoteDevices = await countRemoteSyncedDevices(a)
      t.is(remoteDevices, 1, 'cluster only has the originally linked device B, not the rejected C')

      await a.destroy()
      await b.destroy()
      await c.destroy()
    } finally {
      await cleanupStorage(aStorage, bStorage, cStorage)
    }
  }
)

test(
  'NoteBase - a joiner with a keyring holds the merge while the vault lists an old device',
  { timeout: 90000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('held-host')
    const candidateStorage = getStoragePath('held-candidate')

    try {
      await cleanupStorage(hostStorage, candidateStorage)
      const host = new NoteBase({ storage: hostStorage, encryption })
      const candidate = new NoteBase({ storage: candidateStorage, encryption })
      await host.ready()
      await candidate.ready()

      await host.addSyncedDevice({
        key: b4a.toString(b4a.alloc(32).fill('o'), 'hex'),
        value: { title: 'old phone', localKey: b4a.toString(b4a.alloc(32).fill('q'), 'hex') }
      })
      const { entry } = await createKeyring('held-pass-123', {
        params: { ops: 1, mem: 8 * 1024 * 1024 }
      })
      await candidate.setSyncedPref(keyringPrefId(entry.id), entry)
      await candidate.addNote({ key: 'cand-note', value: { title: 'Cand', note: 'kept' } })

      const invite = await host.createInvite()
      let hostDone = false
      let candidateDone = false
      const steps = []
      let heldStep = null
      host.subscribePairing((status) => {
        if (status.step === 'confirmation') host.confirmPairing()
        if (status.step === 'done') hostDone = true
      })
      const pairPromise = candidate.subscribePairUser((status) => {
        steps.push(status.step)
        if (status.step === 'merge_needs_confirm') heldStep = status
        if (status.step === 'done') candidateDone = true
      }, invite.invite)
      await waitFor(() => hostDone && candidateDone, 80000, t, 'pairing')
      await pairPromise

      t.ok(heldStep, 'the joiner was asked')
      t.alike(
        heldStep.blocking.map((d) => d.title),
        ['old phone'],
        'naming the old device'
      )
      t.absent(steps.includes('restoring_local_data'), 'nothing restored')
      t.absent(await candidate.hasLockKeyring(), 'no keyring in the joined vault')
      t.absent(await candidate.getNote('cand-note'), 'earlier notes not merged yet')
      t.is(readPointer(candidateStorage).merge, 'locked', 'merge pending')
      t.ok((await candidate.heldMerge()).held, 'held')

      t.ok(await candidate.combineHeldMerge(), 'combine anyway')
      t.ok(await candidate.getNote('cand-note'), 'earlier notes merged')
      t.ok(await candidate.hasLockKeyring(), 'keyring adopted')
      t.is(readPointer(candidateStorage).merge, null, 'merge finished')
      t.is(
        fs.readdirSync(path.join(candidateStorage, 'vaults')).length,
        1,
        'the earlier vault is retired'
      )

      await host.destroy()
      await candidate.destroy()
    } finally {
      await cleanupStorage(hostStorage, candidateStorage)
    }
  }
)

test(
  'NoteBase - pairing merges joining device existing notes into shared vault',
  { timeout: 90000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('merge-host')
    const candidateStorage = getStoragePath('merge-candidate')

    try {
      await cleanupStorage(hostStorage, candidateStorage)

      const host = new NoteBase({ storage: hostStorage, encryption })
      const candidate = new NoteBase({ storage: candidateStorage, encryption })

      await host.ready()
      await candidate.ready()

      await host.addNote({ key: 'host-note-1', value: { title: 'Host 1', note: 'host content' } })

      await candidate.addNote({
        key: 'cand-note-1',
        value: { title: 'Cand 1', note: 'candidate content 1' }
      })
      await candidate.addNote({
        key: 'cand-note-2',
        value: { title: 'Cand 2', note: 'candidate content 2' }
      })
      await candidate.addFolder({
        key: 'cand-folder',
        value: { title: 'Cand Folder', addedAt: 1, updatedAt: 1 }
      })

      const invite = await host.createInvite()
      t.ok(invite.invite, 'invite created')

      let hostDone = false
      let candidateDone = false

      host.subscribePairing((status) => {
        if (status.step === 'confirmation') host.confirmPairing()
        if (status.step === 'done') hostDone = true
      })

      const pairPromise = candidate.subscribePairUser((status) => {
        if (status.step === 'done') candidateDone = true
      }, invite.invite)

      const start = Date.now()
      while (!(hostDone && candidateDone)) {
        if (Date.now() - start > 80000) {
          t.fail('pairing timeout')
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      await pairPromise

      await candidate.autobase.update()
      const candKeys = (await candidate.getAllNotes()).map((n) => n.key)
      t.ok(candKeys.includes('cand-note-1'), 'candidate kept its own note 1 after pairing')
      t.ok(candKeys.includes('cand-note-2'), 'candidate kept its own note 2 after pairing')
      t.ok(candKeys.includes('host-note-1'), 'candidate received host note after pairing')

      const hostGotMerge = await pollAsync(async () => {
        await host.autobase.update()
        const keys = (await host.getAllNotes()).map((n) => n.key)
        return keys.includes('cand-note-1') && keys.includes('cand-note-2')
      }, 40000)
      t.ok(hostGotMerge, 'host received candidate merged notes')

      const hostFolders = await host.getAllFolders()
      t.ok(
        hostFolders.some((f) => f.key === 'cand-folder'),
        'host received candidate merged folder'
      )

      t.absent(
        fs.existsSync(path.join(candidateStorage, 'core-pairing-candidate')),
        'no leftover pairing candidate scratch dir after success'
      )
      t.absent(
        fs.existsSync(path.join(candidateStorage, 'core-pairing-old')),
        'no leftover swap-temp dir after success'
      )
      t.absent(
        fs.existsSync(path.join(candidateStorage, 'core-pairing-backup')),
        'legacy pre-clear backup dir is never created'
      )
      t.ok(
        fs.readdirSync(path.join(candidateStorage, 'vaults')).length === 1,
        'exactly one vault left after pairing'
      )

      await host.destroy()
      await candidate.destroy()
    } finally {
      await cleanupStorage(hostStorage, candidateStorage)
    }
  }
)

test(
  'NoteBase - rejected pairing keeps joining device own notes and removes scratch dirs',
  { timeout: 90000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('rejkeep-host')
    const candidateStorage = getStoragePath('rejkeep-candidate')

    try {
      await cleanupStorage(hostStorage, candidateStorage)

      const host = new NoteBase({ storage: hostStorage, encryption })
      const candidate = new NoteBase({ storage: candidateStorage, encryption })

      await host.ready()
      await candidate.ready()

      await host.addNote({ key: 'host-note', value: { title: 'H', note: 'host content' } })
      await candidate.addNote({ key: 'cand-keep-1', value: { title: 'K1', note: 'keep me 1' } })
      await candidate.addNote({ key: 'cand-keep-2', value: { title: 'K2', note: 'keep me 2' } })

      const invite = await host.createInvite()
      t.ok(invite.invite, 'invite created')

      let candidateRejected = false
      let candidateDone = false

      host.subscribePairing((status) => {
        if (status.step === 'confirmation') host.rejectPairing()
      })

      const pairPromise = candidate.subscribePairUser((status) => {
        if (status.step === 'rejected') candidateRejected = true
        if (status.step === 'done') candidateDone = true
      }, invite.invite)

      await waitFor(() => candidateRejected || candidateDone, 60000, t, 'candidate rejected')
      await pairPromise.catch(() => {})

      t.ok(candidateRejected, 'candidate received rejected status')
      t.absent(candidateDone, 'candidate never reached done')

      await candidate.autobase.update()
      const keys = (await candidate.getAllNotes()).map((n) => n.key)
      t.ok(
        keys.includes('cand-keep-1') && keys.includes('cand-keep-2'),
        'joining device kept its own notes after rejection (original storage never cleared)'
      )
      t.absent(
        keys.includes('host-note'),
        'joining device did not absorb host data on a rejected pair'
      )

      t.absent(
        fs.existsSync(path.join(candidateStorage, 'core-pairing-candidate')),
        'no leftover pairing candidate scratch dir after rejection'
      )
      t.absent(
        fs.existsSync(path.join(candidateStorage, 'core-pairing-old')),
        'no leftover swap-temp dir after rejection'
      )
      t.ok(
        fs.readdirSync(path.join(candidateStorage, 'vaults')).length === 1,
        'only the original vault is left after rejection'
      )

      await host.destroy()
      await candidate.destroy()
    } finally {
      await cleanupStorage(hostStorage, candidateStorage)
    }
  }
)

test(
  'NoteBase - pairing preserves joining device media (bytes + remapped url)',
  { timeout: 90000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('mergemedia-host')
    const candidateStorage = getStoragePath('mergemedia-candidate')
    const MEDIA_PATH = 'cand-note-media/0_pic.png'
    const MEDIA_BYTES = b4a.from('THIS-IS-THE-CANDIDATE-MEDIA-BYTES-payload-0123456789')

    try {
      await cleanupStorage(hostStorage, candidateStorage)

      const host = new NoteBase({ storage: hostStorage, encryption })
      const candidate = new NoteBase({ storage: candidateStorage, encryption })

      await host.ready()
      await candidate.ready()

      await host.addNote({ key: 'host-note-1', value: { title: 'Host 1', note: 'host content' } })

      const mediaUrl = await candidate.insertFile({ key: MEDIA_PATH, buffer: MEDIA_BYTES })
      await candidate.addNote({
        key: 'cand-note-media',
        value: { title: 'Cand Media', note: `<p>pic</p><img src="${mediaUrl}">` }
      })
      t.ok(mediaUrl.startsWith('http://hyperdrive/?'), 'candidate media url created')

      const invite = await host.createInvite()

      let hostDone = false
      let candidateDone = false
      host.subscribePairing((status) => {
        if (status.step === 'confirmation') host.confirmPairing()
        if (status.step === 'done') hostDone = true
      })
      const pairPromise = candidate.subscribePairUser((status) => {
        if (status.step === 'done') candidateDone = true
      }, invite.invite)

      const start = Date.now()
      while (!(hostDone && candidateDone)) {
        if (Date.now() - start > 80000) {
          t.fail('pairing timeout')
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      await pairPromise

      await candidate.autobase.update()

      const note = await candidate.getNote('cand-note-media')
      t.ok(note, 'candidate still has its media note after merge')

      const bytes = await candidate.hyperdrive.get(MEDIA_PATH)
      t.ok(
        bytes && b4a.equals(bytes, MEDIA_BYTES),
        'candidate media bytes preserved in the new drive'
      )

      t.absent(note.note.includes(mediaUrl), 'stale pre-merge media url was remapped')

      const newDriveKeyHex = b4a.toString(candidate.hyperdrive.blobs.core.key, 'hex')
      const HypercoreID = (await import('hypercore-id-encoding')).default
      const urlMatch = note.note.replace(/&amp;/g, '&').match(/http:\/\/hyperdrive\/\?[^"'\s<>]*/)
      const keyParam = urlMatch && (urlMatch[0].match(/[?&]key=([^&]+)/) || [])[1]
      const noteDriveKeyHex = keyParam && b4a.toString(HypercoreID.decode(keyParam), 'hex')
      t.is(noteDriveKeyHex, newDriveKeyHex, 'remapped url points at candidate new blob core')

      const hostGotNote = await pollAsync(async () => {
        await host.autobase.update()
        const keys = (await host.getAllNotes()).map((n) => n.key)
        return keys.includes('cand-note-media')
      }, 40000)
      t.ok(hostGotNote, 'host received the merged media note')

      await host.destroy()
      await candidate.destroy()
    } finally {
      await cleanupStorage(hostStorage, candidateStorage)
    }
  }
)

test(
  'NoteBase - pairing transfers encryption key from host to candidate',
  { timeout: 60000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('host2')
    const candidateStorage = getStoragePath('candidate2')

    try {
      if (fs.existsSync(hostStorage)) fs.rmSync(hostStorage, { recursive: true, force: true })
      if (fs.existsSync(candidateStorage))
        fs.rmSync(candidateStorage, { recursive: true, force: true })

      const hostEncryption = b4a.toString(b4a.alloc(32).fill('host-unique-key!!'), 'hex')
      const candidateEncryption = b4a.toString(b4a.alloc(32).fill('candidate-diff-k!'), 'hex')

      const host = new NoteBase({ storage: hostStorage, encryption: hostEncryption })
      const candidate = new NoteBase({ storage: candidateStorage, encryption: candidateEncryption })

      await host.ready()
      await candidate.ready()

      await host.addNote({
        key: 'host-note',
        value: { title: 'Host Note', content: 'secret content' }
      })
      await host.addFolder({
        key: 'host-folder',
        value: { title: 'Host Folder', addedAt: 1000, updatedAt: 1000 }
      })

      const invite = await host.createInvite()
      t.ok(invite.invite, 'invite created')

      let receivedEncryptionKey = null
      let hostDone = false
      let candidateDone = false

      host.subscribePairing((status) => {
        console.log('[host2 status]', status.step)
        if (status.step === 'confirmation') host.confirmPairing()
        if (status.step === 'done') hostDone = true
      })

      const pairPromise = candidate.subscribePairUser((status) => {
        console.log('[candidate2 status]', status.step, status.encryptionKey ? '(has key)' : '')
        if (status.encryptionKey) receivedEncryptionKey = status.encryptionKey
        if (status.step === 'done') candidateDone = true
      }, invite.invite)

      const start = Date.now()
      while (!(hostDone && candidateDone)) {
        if (Date.now() - start > 55000) {
          console.log('Timeout status:', { hostDone, candidateDone })
          t.fail('Pairing status timeout after 55s')
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }

      await pairPromise

      t.ok(receivedEncryptionKey, 'candidate received encryption key from host')
      t.is(
        receivedEncryptionKey,
        hostEncryption,
        'received encryption key matches host encryption key'
      )

      const notes = await candidate.getAllNotes()
      t.ok(notes.length > 0, 'candidate synced notes from host')
      t.ok(
        notes.some((n) => n.key === 'host-note'),
        'candidate has host note after pairing'
      )

      const folders = await candidate.getAllFolders()
      t.ok(
        folders.some((f) => f.key === 'host-folder'),
        'candidate has host folder after pairing'
      )

      t.is(
        candidate.encryption,
        hostEncryption,
        'candidate encryption property updated to host key'
      )

      await host.destroy()
      await candidate.destroy()
    } finally {
      try {
        if (fs.existsSync(hostStorage)) fs.rmSync(hostStorage, { recursive: true, force: true })
      } catch {}
      try {
        if (fs.existsSync(candidateStorage))
          fs.rmSync(candidateStorage, { recursive: true, force: true })
      } catch {}
    }
  }
)
