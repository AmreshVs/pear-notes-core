import test from 'brittle'
import b4a from 'b4a'
import { BACKUP_ERROR } from '../constant.js'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import {
  backupVersionFor,
  checkBackupRestore,
  importBackup,
  readBackupVersion
} from '../backend/backupManager.js'
import { createKeyring, parseEnvelope } from '../backend/lockCrypto.js'
import { runSealingPass, sealEnvelope } from '../backend/lockRollout.js'
import {
  closeLockSession,
  openNoteBody,
  openWithPassword,
  sealingKeyringId
} from '../backend/lockSession.js'
import {
  envelopeLinks,
  envelopeRelink,
  relinkEnvelope,
  relinkHtml
} from '../backend/sealedEnvelope.js'
import { noteStamp } from '../backend/vault/ops.js'
import { decode, encode } from '../spec/hyperschema/index.js'

const FAST = { params: { ops: 1, mem: 8 * 1024 * 1024 } }
const OLD = 'http://hyperdrive/?key=old&blob=1-2-3-4'
const NEW = 'http://hyperdrive/?key=new&blob=5-6-7-8'
const LATER = 'http://hyperdrive/?key=later&blob=9-9-9-9'
const BODY = `<p>plan</p><img src="${OLD.replace('&', '&amp;')}">`

test('backup format - v4 only when the backup holds a sealed note', (t) => {
  t.is(backupVersionFor([]), 3, 'empty')
  t.is(backupVersionFor([{ key: 'a', value: { note: '<p>a</p>', locked: true } }]), 3, 'plain lock')
  t.is(
    backupVersionFor([{ key: 'a', value: { note: '', sealed: '{}' } }, { key: 'b' }]),
    4,
    'sealed'
  )
})

test('backup format - a version this app does not know is refused', async (t) => {
  const header = b4a.alloc(6)
  header.write('PNBK', 0)
  header.writeUInt16BE(5, 4)
  await t.exception(
    () => importBackup({}, { buffer: header, password: 'x' }),
    new RegExp(BACKUP_ERROR.UNSUPPORTED_VERSION)
  )
})

function backupHead(version) {
  const head = b4a.alloc(23)
  head.write('PNBK', 0)
  head.writeUInt16BE(version, 4)
  return head
}

function gateBase({ keyring = false, devices = [] } = {}) {
  return {
    hasLockKeyring: async () => keyring,
    getSyncedPref: async () => null,
    listSyncedDevicesStrict: async () =>
      devices.map((value, i) => ({ key: 'k' + i, value: { localKey: 'l' + i, ...value } }))
  }
}

test('restore check - the header version is read without the password', async (t) => {
  t.is(await readBackupVersion({ buffer: backupHead(4) }), 4, 'v4 buffer')
  t.is(await readBackupVersion({ buffer: backupHead(3) }), 3, 'v3 buffer')
  t.is(await readBackupVersion({ buffer: b4a.from('NOPE00') }), 0, 'not a backup')
  t.is(await readBackupVersion({ buffer: b4a.from('PNB') }), 0, 'too short')
  t.is(await readBackupVersion({}), 0, 'nothing given')

  const filePath = path.join(tmpdir(), 'pn-restore-check-' + Math.random().toString(36).slice(2))
  fs.writeFileSync(filePath, backupHead(4))
  t.teardown(() => fs.rmSync(filePath, { force: true }))
  t.is(await readBackupVersion({ filePath }), 4, 'from a file')
})

test('restore check - only a sealed backup into a vault with no keyring names old devices', async (t) => {
  const old = { title: 'old phone', appVersion: '1.0.0', lastSeenAt: 5 }
  const current = { title: 'mac', compatLevel: 2 }
  const devices = [old, current]

  const blocked = await checkBackupRestore(gateBase({ devices }), { buffer: backupHead(4) })
  t.is(blocked.sealed, true)
  t.alike(
    blocked.blocking.map((d) => [d.title, d.compatLevel, d.appVersion, d.lastSeenAt]),
    [['old phone', 0, '1.0.0', 5]],
    'the old device is named'
  )
  const keyed = gateBase({ keyring: true, devices })
  t.alike(
    await checkBackupRestore(keyed, { buffer: backupHead(4) }),
    { sealed: true, blocking: [] },
    'a vault with a keyring already gates its own devices'
  )
  t.alike(
    await checkBackupRestore(gateBase({ devices: [current] }), { buffer: backupHead(4) }),
    { sealed: true, blocking: [] },
    'every device updated'
  )
  t.alike(
    await checkBackupRestore(gateBase({ devices }), { buffer: backupHead(3) }),
    { sealed: false, blocking: [] },
    'a v3 backup holds no sealed notes'
  )
})

test('restore check - the response survives the wire', (t) => {
  const name = '@notes/command-check-backup-restore-response'
  const value = {
    sealed: true,
    blocking: [{ key: 'k', title: 'old phone', compatLevel: 0, appVersion: '1.0.0', lastSeenAt: 5 }]
  }
  const round = decode(name, encode(name, value))
  t.is(round.sealed, true)
  t.is(round.blocking.length, 1)
  t.is(round.blocking[0].title, 'old phone')
  t.is(round.blocking[0].appVersion, '1.0.0')
  t.is(round.blocking[0].lastSeenAt, 5)
  t.is(round.blocking[0].key, 'k')
  const request = '@notes/command-check-backup-restore-request'
  const asked = decode(
    request,
    encode(request, { buffer: backupHead(4), filePath: '/x', password: 'pw' })
  )
  t.is(asked.filePath, '/x')
  t.is(asked.password, 'pw')
  t.is(asked.buffer.length, 23)
})

test('held merge - the pairing step and the held-merge response carry blocking devices', (t) => {
  const device = {
    key: 'k',
    title: 'old phone',
    compatLevel: 0,
    appVersion: '1.0.0',
    lastSeenAt: 5
  }
  const pairing = '@notes/pairing-schema'
  const step = decode(pairing, encode(pairing, { step: 'merge_needs_confirm', blocking: [device] }))
  t.is(step.step, 'merge_needs_confirm')
  t.is(step.blocking[0].title, 'old phone')
  const held = '@notes/command-get-held-merge-response'
  const round = decode(held, encode(held, { held: true, blocking: [device] }))
  t.is(round.held, true)
  t.is(round.blocking[0].appVersion, '1.0.0')
  const combined = '@notes/command-combine-held-merge-response'
  t.is(decode(combined, encode(combined, { done: true })).done, true)
})

test('relink - only media URLs, applied to both encodings', (t) => {
  const sealed = JSON.stringify({
    v: 1,
    r: 'r',
    k: 'k',
    b: 'b',
    relink: { [OLD]: NEW, 'javascript:x': NEW, [NEW]: NEW, bad: 1 }
  })
  t.alike(envelopeRelink(sealed), { [OLD]: NEW }, 'junk entries dropped')
  t.alike(envelopeRelink('{"v":1,"r":"r","k":"k","b":"b"}'), {}, 'none')
  const out = relinkHtml(`${BODY}<a href="${OLD}">x</a>`, { [OLD]: NEW })
  t.absent(out.includes('key=old'), 'old links gone')
  t.ok(out.includes(NEW.replace('&', '&amp;')) && out.includes(`href="${NEW}"`), 'both forms')
  t.is(relinkHtml(BODY, {}), BODY, 'no map leaves the body alone')
})

test('relink - restore rewrites links and composes with an earlier map', (t) => {
  const first = relinkEnvelope(JSON.stringify({ v: 1, r: 'r', k: 'k', b: 'b', links: [OLD] }), {
    [OLD]: NEW
  })
  t.alike(envelopeLinks(first), [NEW], 'links rewritten')
  t.alike(envelopeRelink(first), { [OLD]: NEW }, 'map stored')
  const second = relinkEnvelope(first, { [NEW]: LATER })
  t.alike(envelopeLinks(second), [LATER], 'second restore')
  t.alike(envelopeRelink(second), { [OLD]: LATER, [NEW]: LATER }, 'both old forms reach the latest')
  t.is(relinkEnvelope(first, { [LATER]: OLD }), null, 'untouched envelope is not rewritten')
})

async function keyrings(t) {
  closeLockSession()
  t.teardown(() => closeLockSession())
  const a = await createKeyring('vault-pass', FAST)
  const b = await createKeyring('old-pass', FAST)
  return { vault: a.entry, restored: { ...b.entry, pending: true } }
}

test('relink - opening and the sealing pass apply it, so no seal drops it', async (t) => {
  const { vault, restored } = await keyrings(t)
  t.ok(await openWithPassword([vault, restored], 'old-pass'), 'old password')
  const sealed = relinkEnvelope(sealEnvelope(restored.id, 'n', BODY, ''), { [OLD]: NEW })
  t.ok(openNoteBody('n', sealed).includes(NEW.replace('&', '&amp;')), 'open serves new links')

  t.ok(await openWithPassword([vault, restored], 'vault-pass'), 'vault password too')
  const rows = new Map([['n', { title: 'N', note: '', locked: true, updatedAt: 1, sealed }]])
  const base = {
    getLockKeyrings: async () => [vault, restored],
    getAllNotesStrict: async () => [...rows].map(([key, value]) => ({ key, value })),
    getNote: async (key) => rows.get(key) || null,
    rejectedSealedSaves: () => [],
    addNote: async (op) => {
      if (op.basis === noteStamp(rows.get(op.key))) rows.set(op.key, op.value)
    }
  }
  t.is((await runSealingPass(base, { quietMs: 0 })).rewrapped, 1, 're-wrapped')
  const envelope = parseEnvelope(rows.get('n').sealed)
  t.is(envelope.r, vault.id, 'now under the vault keyring')
  t.alike(envelope.links, [NEW], 'links kept')
  t.alike(envelope.relink, { [OLD]: NEW }, 'map kept for editors still on the old link')
  t.ok(openNoteBody('n', rows.get('n').sealed).includes('key=new'), 'body carries the new link')
})

test('sealing keyring - a restored note opened by its old password saves under it', async (t) => {
  const { vault, restored } = await keyrings(t)
  t.ok(await openWithPassword([vault, restored], 'old-pass'), 'only the old entry is open')
  const sealed = sealEnvelope(restored.id, 'n', '<p>x</p>', '')
  t.is(sealingKeyringId([vault, restored]), '', 'nothing new is locked under it')
  t.is(sealingKeyringId([vault, restored], sealed), restored.id, 'its own notes still save')
  t.ok(await openWithPassword([vault, restored], 'vault-pass'), 'vault password')
  t.is(sealingKeyringId([vault, restored], sealed), vault.id, 'the vault keyring wins')
})
