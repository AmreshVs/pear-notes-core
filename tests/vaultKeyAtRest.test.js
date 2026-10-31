// The vault blocks were always encrypted - but without `blindEncryption`
// autobase writes the key that opens them into the same storage directory, in
// the clear, on BOTH the local and the bootstrap core (`lib/boot.js`). These
// tests pin the sealed behaviour, the migration off the plaintext copies, and
// the refusal to quietly start a fresh vault when the entropy is gone.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const VAULT_KEY = b4a.toString(b4a.alloc(32).fill('vault-at-rest'), 'hex')
const ENTROPY = b4a.toString(b4a.alloc(32).fill('device-entropy'), 'hex')

const storagePath = () => path.join(tmpdir(), 'vkar-' + Math.random().toString(36).slice(2, 9))
const rm = (p) => {
  try {
    fs.rmSync(p, { recursive: true, force: true })
  } catch {}
}

async function openBase(t, storage, entropy) {
  const base = new NoteBase({ storage, encryption: VAULT_KEY, entropy })
  await base.ready()
  t.teardown(async () => {
    await base._close().catch(() => {})
  })
  return base
}

async function keyMaterialOnDisk(base) {
  const local = base.autobase.local
  const bootstrap = base.autobase._primaryBootstrap
  const read = async (core, key) => {
    if (!core) return null
    try {
      return await core.getUserData(key)
    } catch {
      return null
    }
  }
  return {
    localPlain: await read(local, 'autobase/encryption'),
    localSealed: await read(local, 'autobase/blind-encryption'),
    bootstrapPlain: await read(bootstrap, 'autobase/encryption')
  }
}

test('with entropy, the vault key is never on disk in the clear', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  t.teardown(() => rm(storage))

  const base = await openBase(t, storage, ENTROPY)
  const at = Date.now()
  await base.addNote({
    key: 'n1',
    value: { title: 'A', note: '<p>secret</p>', addedAt: at, updatedAt: at }
  })

  const disk = await keyMaterialOnDisk(base)
  t.absent(disk.localPlain, 'no plaintext key on the local core')
  t.absent(disk.bootstrapPlain, 'no plaintext key on the bootstrap core either')
  t.ok(disk.localSealed, 'the key is stored sealed')
  t.unlike(
    b4a.toString(disk.localSealed, 'hex'),
    VAULT_KEY,
    'and the sealed blob is not just the key'
  )

  t.is((await base.getNote('n1'))?.note, '<p>secret</p>', 'the note still reads back')
})

test('an existing plaintext vault migrates when entropy arrives', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  t.teardown(() => rm(storage))

  // Open the way every shipped build has so far: no entropy.
  const legacy = await openBase(t, storage, null)
  const at = Date.now()
  await legacy.addNote({
    key: 'n1',
    value: { title: 'A', note: '<p>written before</p>', addedAt: at, updatedAt: at }
  })
  const before = await keyMaterialOnDisk(legacy)
  t.ok(before.localPlain, 'the old build did leave the key in the clear')
  t.absent(before.localSealed, 'and nothing sealed')
  await legacy._close()

  // Now the updated app opens the same directory, entropy in hand.
  const migrated = await openBase(t, storage, ENTROPY)
  const after = await keyMaterialOnDisk(migrated)
  t.absent(after.localPlain, 'the plaintext copy is gone')
  t.absent(after.bootstrapPlain, 'including the legacy bootstrap copy')
  t.ok(after.localSealed, 'replaced by a sealed one')
  t.is(
    (await migrated.getNote('n1'))?.note,
    '<p>written before</p>',
    'and the existing note is still readable'
  )
})

test('a sealed vault opened without its entropy fails loudly, it does not start fresh', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  t.teardown(() => rm(storage))

  const base = await openBase(t, storage, ENTROPY)
  const at = Date.now()
  await base.addNote({
    key: 'n1',
    value: { title: 'A', note: '<p>still here</p>', addedAt: at, updatedAt: at }
  })
  await base._close()

  // Keychain wiped: same storage, no entropy.
  const blind = new NoteBase({ storage, encryption: VAULT_KEY, entropy: null })
  const err = await t.exception(blind.ready(), 'opening refuses')
  await blind._close().catch(() => {})

  // The wrong entropy has to fail the same way.
  const wrong = new NoteBase({
    storage,
    encryption: VAULT_KEY,
    entropy: b4a.toString(b4a.alloc(32).fill('not-the-entropy'), 'hex')
  })
  await t.exception(wrong.ready(), 'and so does the wrong entropy')
  await wrong._close().catch(() => {})

  // The data was never at risk - the right entropy still opens it.
  const recovered = await openBase(t, storage, ENTROPY)
  t.is(
    (await recovered.getNote('n1'))?.note,
    '<p>still here</p>',
    'the note is intact once the entropy is back'
  )
})

test('no entropy keeps the old behaviour, so an un-updated app still opens', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  t.teardown(() => rm(storage))

  const base = await openBase(t, storage, null)
  const at = Date.now()
  await base.addNote({
    key: 'n1',
    value: { title: 'A', note: '<p>legacy</p>', addedAt: at, updatedAt: at }
  })
  const disk = await keyMaterialOnDisk(base)
  t.ok(disk.localPlain, 'the key is stored the old way')
  t.absent(disk.localSealed, 'and nothing is sealed')
  t.is((await base.getNote('n1'))?.note, '<p>legacy</p>', 'and the vault works')
})

test('a malformed entropy is treated as none, never as a weak key', async (t) => {
  for (const bad of ['', 'abc', 'z'.repeat(64), b4a.toString(b4a.alloc(16).fill('x'), 'hex')]) {
    // The constructor only parses - nothing is opened until ready().
    const base = new NoteBase({ storage: storagePath(), encryption: VAULT_KEY, entropy: bad })
    t.absent(base._blindEntropy, `rejected: ${JSON.stringify(bad.slice(0, 12))}`)
  }
})
