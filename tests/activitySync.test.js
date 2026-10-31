import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { ACTIVITY_EVENT, ACTIVITY_LOG_ENABLED_KEY } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const hostEncryption = b4a.toString(b4a.alloc(32).fill('activity-sync-host'), 'hex')
const joinerEncryption = b4a.toString(b4a.alloc(32).fill('activity-sync-join'), 'hex')

const getStoragePath = (name) =>
  path.join(tmpdir(), 'pn-activity-sync-' + name + '-' + Math.random().toString(36).substring(7))

async function cleanupStorage(...paths) {
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

test('activity recorded on one device is derived on the other', { timeout: 180000 }, async (t) => {
  await withTestnet(t)
  const hostStorage = getStoragePath('host')
  const joinerStorage = getStoragePath('joiner')

  try {
    await cleanupStorage(hostStorage, joinerStorage)

    const host = new NoteBase({ storage: hostStorage, encryption: hostEncryption })
    const joiner = new NoteBase({ storage: joinerStorage, encryption: joinerEncryption })
    await host.ready()
    await joiner.ready()

    await host.updateSettings({ settings: { [ACTIVITY_LOG_ENABLED_KEY]: true } })

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

    await waitFor(() => hostDone && joinerDone, 150000, t, 'pairing to finish')
    await pairPromise

    const at = Date.now()
    await joiner.append({
      type: 'add_note',
      key: 'joiner-note',
      at,
      value: {
        title: 'Written on the joiner',
        note: '<p>one</p>',
        folderKey: '',
        addedAt: at,
        updatedAt: at,
        locked: false,
        pinned: false
      }
    })

    const joinerEntries = await joiner.getActivity({ noteKey: 'joiner-note' })
    t.ok(
      joinerEntries.entries.some((entry) => entry.event === ACTIVITY_EVENT.NOTE_CREATED),
      'the writing device records the entry'
    )

    const sawOnHost = await waitFor(
      async () => {
        await host.autobase.update().catch(() => {})
        const result = await host.getActivity({ noteKey: 'joiner-note' })
        return result.entries.some((entry) => entry.event === ACTIVITY_EVENT.NOTE_CREATED)
      },
      60000,
      t,
      'the other device to derive the same entry'
    )

    t.ok(sawOnHost, 'activity written on one device shows up on the other')

    if (sawOnHost) {
      const hostEntries = await host.getActivity({ noteKey: 'joiner-note' })
      const created = hostEntries.entries.find(
        (entry) => entry.event === ACTIVITY_EVENT.NOTE_CREATED
      )
      const joinerLocalKey = b4a.toString(joiner.autobase.local.key, 'hex')
      t.is(
        created.device,
        joinerLocalKey,
        'and it is attributed to the device that actually wrote it, not the one reading'
      )
    }

    await host.destroy()
    await joiner.destroy()
  } finally {
    await cleanupStorage(hostStorage, joinerStorage)
  }
})
