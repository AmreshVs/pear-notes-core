import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { ALL_NOTES_KEY, MAX_VAULTS, RECENTLY_DELETED_KEY, VAULT_ERROR } from '../constant.js'
import NoteBase from '../backend/NoteBase.js'
import { blobCoreKeyHexFromUrl } from '../backend/backupManager.js'
import { markRemoved, pointerPath, resolveVaultDir } from '../backend/vault/layout.js'
import { withTestnet } from './helpers/testnet.js'

const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')
const dir = (name) => path.join(tmpdir(), `pn-multi-${name}-${Math.random().toString(36).slice(2)}`)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const note = (title) => ({ title, note: `<p>${title}</p>`, updatedAt: Date.now() })
const readPointerFile = (storage) => JSON.parse(fs.readFileSync(pointerPath(storage), 'utf-8'))

async function until(check, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true
    await wait(200)
  }
  return false
}

async function rejectsWith(t, promise, code, message) {
  try {
    await promise
    t.fail(message)
  } catch (e) {
    t.is(e.code, code, message)
  }
}

test('multi vault - a single vault keeps the original pointer shape', async (t) => {
  await withTestnet(t)
  const storage = dir('shape')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  const base = new NoteBase({ storage, encryption: key('a') })
  await base.ready()
  await base.addNote({ key: 'n1', value: note('one') })
  t.absent('vaults' in readPointerFile(storage), 'no vault list is written for one vault')
  const vaults = base.listVaults()
  t.is(vaults.length, 1, 'the open vault is listed')
  t.ok(vaults[0].current, 'and it is current')
  t.absent('dir' in vaults[0], 'no storage paths leave the backend')
  await base.close()
})

test('multi vault - create, switch, isolate and survive a restart', async (t) => {
  await withTestnet(t)
  const storage = dir('switch')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  let base = new NoteBase({ storage, encryption: key('b') })
  await base.ready()
  const firstId = base.listVaults()[0].id
  const firstKey = base.autobase.key
  await base.addNote({ key: 'personal', value: note('personal') })

  const reopened = []
  base.on('base-reopened', (generation) => reopened.push(generation))

  const sharedId = await base.createVault({ name: '  Shared   notes ' })
  t.is(base.listVaults().length, 2, 'two vaults')
  t.is(base.listVaults().find((v) => v.current)?.id, sharedId, 'the new vault is current')
  t.is(base.listVaults().find((v) => v.id === sharedId)?.name, 'Shared notes', 'name is cleaned')
  t.not(b4a.toString(base.autobase.key, 'hex'), b4a.toString(firstKey, 'hex'), 'a new autobase')
  t.ok(base.writable, 'the new vault is writable')
  t.absent(await base.getNote('personal'), 'the new vault cannot see the first vault')
  await base.addNote({ key: 'shared', value: note('shared') })

  await base.switchVault(firstId)
  t.ok(await base.getNote('personal'), 'switching back shows the first vault')
  t.absent(await base.getNote('shared'), 'and hides the second')
  t.ok(reopened.length >= 2, 'every switch tells the frontend to resubscribe')

  await base.switchVault(firstId)
  t.is(
    base.listVaults().find((v) => v.current)?.id,
    firstId,
    'switching to the open vault is a no-op'
  )
  await base.close()

  base = new NoteBase({ storage, encryption: key('b') })
  await base.ready()
  t.ok(await base.getNote('personal'), 'a restart opens the last vault')
  await base.switchVault(sharedId)
  t.is((await base.getNote('shared'))?.title, 'shared', 'the second vault survives a restart')

  await base.renameVault(sharedId, 'Family')
  t.is(base.listVaults().find((v) => v.id === sharedId)?.name, 'Family', 'renamed')
  await rejectsWith(t, base.renameVault(sharedId, '   '), VAULT_ERROR.EMPTY_NAME, 'empty name')
  await rejectsWith(t, base.switchVault('nope'), VAULT_ERROR.UNKNOWN_VAULT, 'unknown vault')
  await rejectsWith(t, base.createVault({ name: '' }), VAULT_ERROR.EMPTY_NAME, 'unnamed vault')
  await base.close()
})

test('multi vault - a removal is remembered per vault across switches', async (t) => {
  await withTestnet(t)
  const storage = dir('removed')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  const base = new NoteBase({ storage, encryption: key('r') })
  t.teardown(() => base.close())
  await base.ready()
  const firstId = base.listVaults()[0].id
  const firstDir = readPointerFile(storage).current
  const secondId = await base.createVault({ name: 'Second' })
  markRemoved(resolveVaultDir(storage, firstDir))

  const status = []
  base.on('device-removed', () => status.push('removed'))
  base.on('vault-member', () => status.push('member'))

  await base.switchVault(firstId)
  t.ok(base.isRemovedFromVault(), 'the marked vault reads as removed')
  t.is(status.at(-1), 'removed', 'and the frontend is told')
  await base.switchVault(secondId)
  t.absent(base.isRemovedFromVault(), 'the other vault is unaffected')
  t.is(status.at(-1), 'member', 'and the prompt is withdrawn')
})

test('multi vault - remove deletes from this device and keeps the rest', async (t) => {
  await withTestnet(t)
  const storage = dir('remove')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  const base = new NoteBase({ storage, encryption: key('c') })
  await base.ready()
  const firstId = base.listVaults()[0].id
  await base.addNote({ key: 'keep', value: note('keep') })
  const otherId = await base.createVault({ name: 'Other' })
  await base.addNote({ key: 'gone', value: note('gone') })
  const otherDir = readPointerFile(storage).vaults.find((v) => v.dir.endsWith(otherId)).dir

  await base.removeVault(otherId)
  t.is(base.listVaults().length, 1, 'one vault left')
  t.is(base.listVaults()[0].id, firstId, 'the remaining vault is open')
  t.ok(await base.getNote('keep'), 'its notes are intact')
  t.absent(fs.existsSync(path.join(storage, otherDir)), 'the removed vault is gone from disk')
  await rejectsWith(t, base.removeVault(firstId), VAULT_ERROR.LAST_VAULT, 'last vault stays')

  for (let i = 1; i < MAX_VAULTS; i++) await base.createVault({ name: `Vault ${i}` })
  t.is(base.listVaults().length, MAX_VAULTS, 'up to the limit')
  await rejectsWith(t, base.createVault({ name: 'One more' }), VAULT_ERROR.MAX_VAULTS, 'limit')

  // A vault that is not open is opened, left and removed, then the fallback opens.
  const notOpen = base.listVaults().find((v) => !v.current && v.id !== firstId).id
  await base.removeVault(notOpen)
  t.is(base.listVaults().length, MAX_VAULTS - 1, 'removed a vault that was not open')
  await base.close()
})

test('multi vault - a vault this device was removed from goes alone', async (t) => {
  await withTestnet(t)
  const storage = dir('removed-only')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  const base = new NoteBase({ storage, encryption: key('d') })
  t.teardown(() => base.close())
  await base.ready()
  const firstId = base.listVaults()[0].id
  await base.addNote({ key: 'first', value: note('first') })
  const secondId = await base.createVault({ name: 'Second' })
  await base.addNote({ key: 'second', value: note('second') })
  const removedId = await base.createVault({ name: 'Removed' })
  const dirOf = (id) => readPointerFile(storage).vaults.find((v) => v.dir.endsWith(id)).dir
  const removedDir = dirOf(removedId)
  markRemoved(resolveVaultDir(storage, removedDir))

  await base.removeVault(removedId)
  t.alike(base.listVaults().map((v) => v.id).sort(), [firstId, secondId].sort(), 'only it is gone')
  t.absent(fs.existsSync(path.join(storage, removedDir)), 'its files are deleted')
  t.absent(base.isRemovedFromVault(), 'the vault opened instead is a member')

  await base.switchVault(firstId)
  t.ok(await base.getNote('first'), 'the first vault keeps its notes')
  const secondDir = dirOf(secondId)
  markRemoved(resolveVaultDir(storage, secondDir))
  const opened = base.autobase
  await base.removeVault(secondId)
  t.is(base.autobase, opened, 'a removed vault that is not open is deleted without reopening')
  t.absent(fs.existsSync(path.join(storage, secondDir)), 'and its files are deleted')
  t.is(base.listVaults().length, 1, 'one vault left')
  t.ok(await base.getNote('first'), 'with its notes intact')
})

test('multi vault - joining as an added vault keeps both apart', { timeout: 180000 }, async (t) => {
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
  await host.addSyncedDevice({
    key: 'host-device',
    value: {
      title: 'Host',
      deviceType: 'desktop',
      platform: 'darwin',
      localKey: b4a.toString(host.localKey, 'hex'),
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  await host.addNote({ key: 'common', value: note('common') })
  await joiner.addNote({ key: 'private', value: note('private') })
  const personalId = joiner.listVaults()[0].id

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
    'Joiner',
    { mode: 'add', name: 'Shared' }
  )
  await until(() => hostDone)
  t.is(result, 'done', 'joined')

  const vaults = joiner.listVaults()
  t.is(vaults.length, 2, 'the joined vault was added, not swapped in')
  t.is(vaults.find((v) => v.current)?.name, 'Shared', 'the joined vault is open and named')
  t.ok(await until(async () => !!(await joiner.getNote('common'))), 'shared notes arrive')
  t.absent(await joiner.getNote('private'), 'no merge into the joined vault')

  await wait(1000)
  t.absent(await host.getNote('private'), 'the host never receives the personal note')

  await joiner.switchVault(personalId)
  t.ok(await joiner.getNote('private'), 'the personal vault is intact')
  t.absent(await joiner.getNote('common'), 'and holds nothing from the shared vault')

  // The host is the shared vault's only leader, and the joiner still uses it.
  const hostSharedId = host.listVaults()[0].id
  const hostOtherId = await host.createVault({ name: 'Other' })
  await rejectsWith(
    t,
    host.removeVault(hostSharedId),
    VAULT_ERROR.SYNC_LEADER,
    'the only leader cannot remove a vault other devices use'
  )
  t.is(host.listVaults().find((v) => v.current)?.id, hostOtherId, 'the host is back where it was')
  t.is(host.listVaults().length, 2, 'nothing was removed')

  // Only the open vault syncs, so the leader must have the shared vault open
  // for the departure to be confirmed before the joiner deletes its copy.
  await host.switchVault(hostSharedId)
  const sharedId = joiner.listVaults().find((v) => v.name === 'Shared').id
  await joiner.switchVault(sharedId)
  await until(() => host.swarm?.connections.size > 0)
  const removed = await joiner.removeVault(sharedId)
  t.ok(removed.left, 'a follower leaves the shared vault before removing it')
  t.ok(removed.replicated, 'and the leader confirmed it')
  t.is(joiner.listVaults().length, 1, 'only the personal vault is left')
  t.ok(
    await until(async () => (await host.getAllSyncedDeviceKeys()).length === 1),
    'the host sees the joiner leave'
  )
})

test('multi vault - sealed vault keys open after a switch and a restart', async (t) => {
  await withTestnet(t)
  const storage = dir('sealed')
  const entropy = key('e')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  let base = new NoteBase({ storage, encryption: key('s'), entropy })
  await base.ready()
  const firstId = base.listVaults()[0].id
  await base.addNote({ key: 'first', value: note('first') })
  const secondId = await base.createVault({ name: 'Second' })
  await base.addNote({ key: 'second', value: note('second') })
  const secondKey = base.encryption
  await base.switchVault(firstId)
  t.is(base.encryption, key('s'), 'the first vault key is adopted again')
  await base.close()

  // The frontend only keeps the key it was last given; the sealed key on disk decides.
  base = new NoteBase({ storage, encryption: secondKey, entropy })
  await base.ready()
  t.ok(await base.getNote('first'), 'the first vault opens with another vault key in hand')
  await base.switchVault(secondId)
  t.ok(await base.getNote('second'), 'the second vault opens from its sealed key')
  t.is(base.encryption, secondKey, 'and its own key is adopted')
  await base.close()
})

test('multi vault - move notes and a folder with media to another vault', async (t) => {
  await withTestnet(t)
  const storage = dir('move')
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))

  const base = new NoteBase({ storage, encryption: key('m') })
  await base.ready()
  const sourceId = base.listVaults()[0].id
  const targetId = await base.createVault({ name: 'Shared' })
  await base.switchVault(sourceId)

  const bytes = b4a.from('shopping-list-attachment-bytes')
  await base.addFolder({ key: 'recipes', value: { title: 'Recipes', addedAt: 1, updatedAt: 1 } })
  const link = await base.insertFile({ key: 'soup/photo.png', buffer: bytes, path: null })
  await base.addNote({
    key: 'soup',
    value: { title: 'Soup', note: `<img src="${link}">`, folderKey: 'recipes', updatedAt: 1 }
  })
  await base.addNote({ key: 'cake', value: { ...note('cake'), folderKey: 'recipes' } })
  await base.addFolder({ key: 'diary', value: { title: 'Diary', addedAt: 1, updatedAt: 1 } })
  await base.addNote({ key: 'groceries', value: { ...note('groceries'), folderKey: 'diary' } })
  await base.addNote({ key: 'secret', value: { ...note('secret'), folderKey: 'diary' } })

  await rejectsWith(
    t,
    base.moveToVault({ targetId: sourceId, noteKeys: ['groceries'] }),
    VAULT_ERROR.SAME_VAULT,
    'cannot move into the open vault'
  )
  await rejectsWith(
    t,
    base.moveToVault({ targetId, noteKeys: ['nope'] }),
    VAULT_ERROR.NOTHING_TO_MOVE,
    'nothing to move'
  )

  const result = await base.moveToVault({
    targetId,
    noteKeys: ['groceries'],
    folderKeys: ['recipes']
  })
  t.is(result.moved, 3, 'the folder notes and the single note moved')
  t.is(base.listVaults().find((v) => v.current)?.id, sourceId, 'the source vault is open again')
  t.is((await base.getNote('soup'))?.folderKey, RECENTLY_DELETED_KEY, 'originals go to Trash')
  t.is((await base.getNote('groceries'))?.folderKey, RECENTLY_DELETED_KEY, 'single note trashed')
  t.absent(await base.getFolder('recipes'), 'the moved folder left the source')
  t.is((await base.getNote('secret'))?.folderKey, 'diary', 'notes not asked for stay put')

  await base.switchVault(targetId)
  t.is((await base.getFolder('recipes'))?.title, 'Recipes', 'the folder arrived')
  t.is((await base.getNote('cake'))?.folderKey, 'recipes', 'folder notes keep their folder')
  t.is(
    (await base.getNote('groceries'))?.folderKey,
    ALL_NOTES_KEY,
    'a note whose folder stayed behind lands in All notes'
  )
  t.absent(await base.getNote('secret'), 'nothing else was copied')
  const soup = await base.getNote('soup')
  t.ok(soup?.note.includes('http://hyperdrive/'), 'the attachment link was kept')
  const sourceBlobKey = blobCoreKeyHexFromUrl(link)
  t.ok(sourceBlobKey, 'the source link names a blob core')
  t.absent(soup.note.includes(sourceBlobKey), 'and points into this vault drive, not the source')
  const entries = []
  for await (const entry of base.hyperdrive.list('/')) entries.push(entry)
  t.alike(await base.hyperdrive.get(entries[0].key), bytes, 'attachment bytes were copied')
  t.absent(fs.existsSync(path.join(storage, 'vault-move.pnbk')), 'no temporary file is left')
  await base.close()
})
