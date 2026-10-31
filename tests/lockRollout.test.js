import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import HyperDB from 'hyperdb'
import { PAIRING_OUTDATED } from '../constant.js'
import { SEALED_NOTES_CAP, hasCap, hasSealedNotesCap, withCap } from '../backend/deviceCaps.js'
import { MIN_COMPAT_PREF } from '../backend/featureGates.js'
import { createKeyring, parseEnvelope } from '../backend/lockCrypto.js'
import { runSealingPass, sealEnvelope } from '../backend/lockRollout.js'
import { closeLockSession, openNoteBody, openWithPassword } from '../backend/lockSession.js'
import { createApply } from '../backend/vault/apply.js'
import { OP, isValidOp, noteStamp } from '../backend/vault/ops.js'
import { HostPairing, joinerTooOld } from '../backend/vault/pairing.js'
import { INVITE_KEY } from '../backend/viewKeys.js'
import * as viewStore from '../backend/viewStore.js'
import { decode, encode } from '../spec/hyperschema/index.js'
import viewDefinition from '../spec/db/index.js'

const FAST = { params: { ops: 1, mem: 8 * 1024 * 1024 } }
const PASSWORD = 'rollout-pass-123'
const HOUR = 60 * 60 * 1000

test('device caps - parse, add and keep other caps', (t) => {
  t.ok(hasSealedNotesCap(SEALED_NOTES_CAP), 'the cap alone')
  t.ok(hasSealedNotesCap('other1,' + SEALED_NOTES_CAP), 'among others')
  t.absent(hasSealedNotesCap(''), 'empty')
  t.absent(hasSealedNotesCap(undefined), 'missing (an old core)')
  t.absent(hasSealedNotesCap('sealedNotes10'), 'no prefix match')
  t.is(withCap('', SEALED_NOTES_CAP), SEALED_NOTES_CAP, 'added to nothing')
  t.is(withCap('other1', SEALED_NOTES_CAP), 'other1,' + SEALED_NOTES_CAP, 'appended')
  t.is(withCap(SEALED_NOTES_CAP, SEALED_NOTES_CAP), SEALED_NOTES_CAP, 'not doubled')
  t.ok(hasCap('a,b', 'b'), 'generic lookup')
})

test('device caps - the wire device carries sealedNotes', (t) => {
  const device = { title: 'Phone', localKey: 'a'.repeat(64), sealedNotes: true }
  const round = decode('@notes/synced-device-schema', encode('@notes/synced-device-schema', device))
  t.is(round.sealedNotes, true, 'the flag survives the wire')
})

test('note stamp - stable over known fields, changes with content', (t) => {
  const row = { title: 'T', note: '<p>a</p>', updatedAt: 5, locked: true, folderKey: 'f' }
  t.is(noteStamp(row), noteStamp({ ...row }), 'same row, same stamp')
  t.is(noteStamp(row), noteStamp({ ...row, futureField: 'x' }), 'unknown fields are not stamped')
  t.is(noteStamp(row), noteStamp({ ...row, deletedAt: undefined }), 'missing equals undefined')
  t.not(noteStamp(row), noteStamp({ ...row, note: '<p>b</p>' }), 'body changes it')
  t.not(noteStamp(row), noteStamp({ ...row, pinned: true }), 'pin changes it')
  t.is(noteStamp(null), '', 'no row')
  t.absent(isValidOp({ type: OP.ADD_NOTE, at: 1, key: 'k', value: {}, basis: 3 }), 'bad basis')
  t.ok(isValidOp({ type: OP.ADD_NOTE, at: 1, key: 'k', value: {}, basis: 'ab' }), 'string basis')
})

const host = { async addWriter() {}, async removeWriter() {}, removeable: () => true }
const node = (op, writer = 'w') => ({
  value: { at: 1, ...op },
  from: { key: b4a.alloc(32).fill(writer) },
  length: 1
})
const writerHex = (writer) => b4a.toString(b4a.alloc(32).fill(writer), 'hex')

async function viewDb(t) {
  const dir = path.join(tmpdir(), 'pear-notes-rollout-' + Math.random().toString(36).slice(7))
  const store = new Corestore(dir)
  const core = store.get({ name: 'view' })
  await core.ready()
  const db = HyperDB.bee(core, viewDefinition, { extension: false, autoUpdate: true })
  await db.ready()
  t.teardown(async () => {
    await db.close().catch(() => {})
    await store.close().catch(() => {})
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  })
  return db
}

test('apply - a sealing write lands only over the row it was built from', async (t) => {
  const db = await viewDb(t)
  const apply = createApply()
  const plain = { title: 'L', note: '<p>x</p>', locked: true, updatedAt: 1 }
  await apply([node({ type: OP.ADD_NOTE, key: 'n', value: plain })], db, host)
  const basis = noteStamp(await viewStore.getNote(db, 'n'))

  const edited = { ...plain, note: '<p>newer</p>', updatedAt: 2 }
  await apply([node({ type: OP.ADD_NOTE, key: 'n', value: edited })], db, host)
  const sealed = { ...plain, note: '', sealed: '{"v":1}' }
  await apply([node({ type: OP.ADD_NOTE, key: 'n', value: sealed, basis })], db, host)
  t.is((await viewStore.getNote(db, 'n')).note, '<p>newer</p>', 'a stale seal is dropped')

  const fresh = noteStamp(await viewStore.getNote(db, 'n'))
  await apply([node({ type: OP.ADD_NOTE, key: 'n', value: sealed, basis: fresh })], db, host)
  t.is((await viewStore.getNote(db, 'n')).sealed, '{"v":1}', 'a current seal applies')
})

test('apply - a plain save over a sealed note is reported to the writer', async (t) => {
  const db = await viewDb(t)
  const rejected = []
  const apply = createApply({ onSealedSaveRejected: (op, writer) => rejected.push({ op, writer }) })
  const sealed = { title: 'L', note: '', locked: true, sealed: '{"v":1}', updatedAt: 1 }
  await apply([node({ type: OP.ADD_NOTE, key: 'n', value: sealed })], db, host)
  const plain = { title: 'L', note: '<p>typed</p>', locked: true, updatedAt: 2 }
  await apply([node({ type: OP.ADD_NOTE, key: 'n', value: plain }, 'b')], db, host)

  t.is((await viewStore.getNote(db, 'n')).sealed, '{"v":1}', 'the envelope is kept')
  t.is(rejected.length, 1, 'one rejected save')
  t.is(rejected[0].writer, writerHex('b'), 'with its writer')
  t.is(rejected[0].op.value.note, '<p>typed</p>', 'and its content, for that writer only')
})

class FakeBase {
  constructor(keyrings) {
    this.keyrings = keyrings
    this.rows = new Map()
    this.ops = []
    this.rejected = new Map()
  }

  async getLockKeyrings() {
    return this.keyrings
  }

  async getNote(key) {
    return this.rows.get(key) || null
  }

  async getAllNotesStrict() {
    return [...this.rows].map(([key, value]) => ({ key, value }))
  }

  async addNote(op) {
    this.ops.push(op)
    if (op.basis && op.basis !== noteStamp(this.rows.get(op.key))) return
    this.rows.set(op.key, op.value)
  }

  rejectedSealedSaves() {
    return [...this.rejected]
  }

  dropRejectedSealedSave(key, value) {
    if (this.rejected.get(key) === value) this.rejected.delete(key)
  }
}

async function twoKeyrings(t) {
  closeLockSession()
  t.teardown(() => closeLockSession())
  const a = await createKeyring(PASSWORD, FAST)
  const b = await createKeyring(PASSWORD, FAST)
  const [low, high] = a.entry.id < b.entry.id ? [a.entry, b.entry] : [b.entry, a.entry]
  t.ok(await openWithPassword([low, high], PASSWORD), 'session open')
  return { low, high }
}

test('sealing pass - seals, re-wraps, defers recent edits and skips the rest', async (t) => {
  const { low, high } = await twoKeyrings(t)
  const now = Date.now()
  const base = new FakeBase([low, high])
  base.rows.set('old', { title: 'Old', note: '<p>old</p>', locked: true, updatedAt: now - HOUR })
  base.rows.set('recent', { title: 'R', note: '<p>r</p>', locked: true, updatedAt: now - 1000 })
  base.rows.set('plain', { title: 'P', note: '<p>p</p>', locked: false, updatedAt: 1 })
  base.rows.set('other', {
    title: 'Other',
    note: '',
    locked: true,
    updatedAt: now - HOUR,
    sealed: sealEnvelope(high.id, 'other', '<p>other</p>', '')
  })
  base.rows.set('current', {
    title: 'C',
    note: '',
    locked: true,
    updatedAt: now - HOUR,
    sealed: sealEnvelope(low.id, 'current', '<p>c</p>', '')
  })

  const result = await runSealingPass(base, { now: () => now, quietMs: 60000 })
  t.is(result.sealed, 1, 'one note sealed')
  t.is(result.rewrapped, 1, 'one note re-wrapped')
  t.is(result.retryAt, now - 1000 + 60000, 'the recent edit is retried once it is quiet')
  t.is(base.ops.length, 2, 'one op per note')
  t.ok(
    base.ops.every((op) => op.noActivity === true && typeof op.basis === 'string'),
    'no activity, conditional on the row read'
  )

  const old = base.rows.get('old')
  t.is(old.note, '', 'sealed body leaves no plaintext')
  t.is(parseEnvelope(old.sealed).r, low.id, 'sealed under the current keyring')
  t.is(old.updatedAt, now - HOUR, 'sealing is not an edit')
  t.is(openNoteBody('old', old.sealed), '<p>old</p>', 'and opens')
  const other = base.rows.get('other')
  t.is(parseEnvelope(other.sealed).r, low.id, 're-wrapped under the current keyring')
  t.is(openNoteBody('other', other.sealed), '<p>other</p>', 'body intact')
  t.is(base.rows.get('recent').sealed, undefined, 'recent edit left alone for now')
  t.is(base.rows.get('plain').sealed, undefined, 'unlocked notes are never sealed')

  const later = await runSealingPass(base, { now: () => now + 61000, quietMs: 60000 })
  t.is(later.sealed, 1, 'the deferred note is sealed on the retry')
  t.is(later.retryAt, 0, 'nothing left')
  t.is((await runSealingPass(base, { now: () => now + 62000 })).sealed, 0, 'resumable: no repeats')
})

test('sealing pass - stops when asked, and needs the current root', async (t) => {
  const { low, high } = await twoKeyrings(t)
  const base = new FakeBase([low, high])
  for (const key of ['a', 'b', 'c']) {
    base.rows.set(key, { title: key, note: '<p>x</p>', locked: true, updatedAt: 1 })
  }
  let left = 1
  const result = await runSealingPass(base, { stopped: () => left-- <= 0 })
  t.is(result.sealed, 1, 'stopped after one note')

  closeLockSession()
  t.ok(await openWithPassword([high], PASSWORD), 'only the non-current entry is open')
  const none = await runSealingPass(new FakeBase([low, high]), {})
  t.alike(
    none,
    { sealed: 0, rewrapped: 0, resealed: 0, encrypted: 0, waiting: 0, retryAt: 0 },
    'nothing without R'
  )
})

test('sealing pass - a save that raced the seal is re-sealed, never dropped', async (t) => {
  const { low, high } = await twoKeyrings(t)
  const base = new FakeBase([low, high])
  const sealedRow = {
    title: 'L',
    note: '',
    locked: true,
    updatedAt: 10,
    sealed: sealEnvelope(low.id, 'n', '<p>before</p>', '')
  }
  base.rows.set('n', sealedRow)
  base.rows.set('stale', { ...sealedRow, updatedAt: 50 })
  const typed = { title: 'L2', note: '<p>typed offline</p>', locked: true, updatedAt: 20 }
  base.rejected.set('n', typed)
  base.rejected.set('stale', { ...typed, updatedAt: 20 })

  const result = await runSealingPass(base, { now: () => 30 })
  t.is(result.resealed, 1, 'one save re-sealed')
  const row = base.rows.get('n')
  t.is(row.note, '', 'no plaintext stored')
  t.is(row.title, 'L2', 'the rest of the save kept')
  t.is(row.updatedAt, 30, 'written as a new edit')
  t.is(openNoteBody('n', row.sealed), '<p>typed offline</p>', 'the typed content survives')
  t.is(base.rows.get('stale').updatedAt, 50, 'a save older than the stored row is not replayed')
  t.is(base.rejected.size, 0, 'nothing held any more')
})

test('pairing - once a keyring exists, a joiner without the cap is refused', async (t) => {
  const statuses = []
  const invite = { id: 'aa'.repeat(16), publicKey: 'bb'.repeat(32), expires: Date.now() + HOUR }
  const vault = {
    keyring: true,
    minLevel: null,
    async getNote(key) {
      return key === INVITE_KEY ? invite : null
    },
    async hasLockKeyring() {
      return this.keyring
    },
    async getSyncedPref(id) {
      return id === MIN_COMPAT_PREF && this.minLevel ? { level: this.minLevel } : null
    }
  }
  const pairing = new HostPairing(vault)
  pairing.cb = (status) => statuses.push(status)
  const candidate = (caps) => {
    const out = { denied: false }
    out.inviteId = b4a.from(invite.id, 'hex')
    out.userData = b4a.from(
      JSON.stringify({ key: 'c'.repeat(64), platform: 'ios', box: 'd'.repeat(64), caps })
    )
    out.open = async () => {}
    out.deny = () => {
      out.denied = true
    }
    return out
  }

  const old = candidate(undefined)
  await pairing._handle(old)
  t.ok(old.denied, 'an old joiner is denied')
  t.is(statuses.at(-1).reason, PAIRING_OUTDATED.JOINER, 'and told to update')

  t.absent(await joinerTooOld(vault, { caps: SEALED_NOTES_CAP }), 'a joiner with the cap may join')
  vault.keyring = false
  t.absent(await joinerTooOld(vault, { caps: '' }), 'without a keyring old joiners still pair')
  vault.minLevel = 2
  t.ok(await joinerTooOld(vault, { caps: SEALED_NOTES_CAP }), 'a level-1 joiner is refused at 2')
  t.absent(
    await joinerTooOld(vault, { caps: SEALED_NOTES_CAP, compatLevel: 2 }),
    'a level-2 joiner may join'
  )
})
