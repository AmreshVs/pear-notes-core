import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const hostEncryption = b4a.toString(b4a.alloc(32).fill('host-encryption-key'), 'hex')
const joinerEncryption = b4a.toString(b4a.alloc(32).fill('joiner-encryption'), 'hex')

const getStoragePath = (name) =>
  path.join(
    tmpdir(),
    'pear-notes-pair-encryption-' + name + '-' + Math.random().toString(36).substring(7)
  )

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
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      t.fail('timeout waiting for ' + label)
      return false
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return true
}

test(
  'NoteBase - joiner is handed the encryption key it needs to reopen after restart',
  { timeout: 120000 },
  async (t) => {
    await withTestnet(t)
    const hostStorage = getStoragePath('host')
    const joinerStorage = getStoragePath('joiner')

    try {
      await cleanupStorage(hostStorage, joinerStorage)

      const host = new NoteBase({ storage: hostStorage, encryption: hostEncryption })
      const joiner = new NoteBase({ storage: joinerStorage, encryption: joinerEncryption })

      await host.ready()
      await joiner.ready()

      t.not(hostEncryption, joinerEncryption, 'the two devices start with different db keys')

      await host.addNote({
        key: 'host-note',
        value: {
          title: 'from host',
          note: '<p>synced</p>',
          folderKey: 'host-folder',
          addedAt: Date.now(),
          updatedAt: Date.now(),
          locked: false,
          pinned: false
        }
      })

      const invite = await host.createInvite()
      t.ok(invite.invite, 'invite created')

      let hostDone = false
      let joinerDone = false
      let reportedEncryptionKey = null

      host.subscribePairing((status) => {
        if (status.step === 'confirmation') host.confirmPairing()
        if (status.step === 'done') hostDone = true
      })

      const pairPromise = joiner.subscribePairUser((status) => {
        if (status.encryptionKey) reportedEncryptionKey = status.encryptionKey
        if (status.step === 'done') joinerDone = true
      }, invite.invite)

      await waitFor(() => hostDone && joinerDone, 110000, t, 'pairing to finish')
      await pairPromise

      t.ok(joinerDone, 'joiner finished pairing')
      t.ok(
        reportedEncryptionKey,
        'the joiner was told the new encryption key - without it the app cannot reopen after restart'
      )
      t.is(reportedEncryptionKey, hostEncryption, 'the reported key is the vault key')
      t.is(joiner.encryption, hostEncryption, 'the joiner base adopted the vault key')

      await host.destroy()
      await joiner.destroy()

      const reopened = new NoteBase({ storage: joinerStorage, encryption: reportedEncryptionKey })
      await reopened.ready()
      const note = await reopened.getNote('host-note')
      t.ok(note, 'reopening with the reported key restores access to the synced notes')
      t.is(note.title, 'from host', 'the synced note survived the restart')
      await reopened.destroy()
    } finally {
      await cleanupStorage(hostStorage, joinerStorage)
    }
  }
)
