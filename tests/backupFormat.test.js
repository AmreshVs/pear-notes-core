import test from 'brittle'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import * as notesApi from '../backend/notesApi.js'
import { BACKUP_ERROR } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('format-test-key'), 'hex')
const PASSWORD = 'Str0ng!Passw0rd'
const NOTE_KEY = 'format-test-note'
const FILE_A = `${NOTE_KEY}/aaa_secret-contract.pdf`
const FILE_B = `${NOTE_KEY}/bbb_holiday.png`
const BYTES_A = b4a.alloc(3 * 1024 * 1024 + 17).fill('a')
const BYTES_B = b4a.from('second attachment')
const HEADER_LENGTH = 23

const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-backup-format-' + Math.random().toString(36).slice(2))

async function openBase(t, key = encryption) {
  const storage = storagePath()
  const base = new NoteBase({ storage, encryption: key })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  return base
}

async function seededBackup(t) {
  const base = await openBase(t)
  await base.insertFile({ key: FILE_A, buffer: BYTES_A, path: null })
  await base.insertFile({ key: FILE_B, buffer: BYTES_B, path: null })
  await base.addNote({
    key: NOTE_KEY,
    value: { title: 'Format note', note: '<p>body</p>', addedAt: 1, updatedAt: 1 }
  })
  return base.exportBackup(PASSWORD)
}

function splitFrames(buffer) {
  const frames = []
  let at = HEADER_LENGTH
  while (at < buffer.length) {
    const end = at + 4 + 12 + 16 + buffer.readUInt32BE(at)
    frames.push(buffer.subarray(at, end))
    at = end
  }
  return { header: buffer.subarray(0, HEADER_LENGTH), frames }
}

async function expectRejected(t, buffer, code, message) {
  const dest = await openBase(t, b4a.toString(crypto.randomBytes(32), 'hex'))
  try {
    await dest.importBackup({ buffer, password: PASSWORD })
    t.fail(message + ' was accepted')
  } catch (e) {
    t.is(e.message, code, message)
  }
}

test('backup v3 - no attachment path or name is stored in the clear', async (t) => {
  await withTestnet(t)
  const buffer = await seededBackup(t)
  t.absent(buffer.includes(b4a.from('secret-contract')), 'file name sealed')
  t.absent(buffer.includes(b4a.from(NOTE_KEY)), 'note key sealed')
})

test('backup v3 - truncation, dropped, reordered and spliced frames are refused', async (t) => {
  await withTestnet(t)
  const buffer = await seededBackup(t)
  const { header, frames } = splitFrames(buffer)
  t.ok(frames.length >= 9, 'meta, two files of several frames, end')

  const without = (index) => b4a.concat([header, ...frames.filter((_, i) => i !== index)])
  const swapped = (i, j) => {
    const copy = frames.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return b4a.concat([header, ...copy])
  }

  await expectRejected(t, without(frames.length - 1), BACKUP_ERROR.INVALID_FILE, 'missing end')
  await expectRejected(t, without(3), BACKUP_ERROR.INVALID_FILE, 'dropped data frame')
  await expectRejected(t, swapped(2, 3), BACKUP_ERROR.INVALID_FILE, 'reordered data frames')
  await expectRejected(
    t,
    b4a.concat([header, frames[0], frames[frames.length - 3], ...frames.slice(2)]),
    BACKUP_ERROR.INVALID_FILE,
    'frame spliced in from another file'
  )
  await expectRejected(
    t,
    buffer.subarray(0, buffer.length - 5),
    BACKUP_ERROR.INVALID_FILE,
    'cut mid-frame'
  )

  const editedHeader = b4a.from(buffer)
  editedHeader[HEADER_LENGTH - 1] ^= 1
  await expectRejected(t, editedHeader, BACKUP_ERROR.INCORRECT_PASSWORD, 'edited salt')
})

test('backup v3 - an untouched file restores every attachment byte for byte', async (t) => {
  await withTestnet(t)
  const buffer = await seededBackup(t)
  const dest = await openBase(t, b4a.toString(crypto.randomBytes(32), 'hex'))
  const summary = await dest.importBackup({ buffer, password: PASSWORD })
  t.is(summary.attachmentsRestored, 2)
  t.alike(await dest.hyperdrive.get(FILE_A), BYTES_A, 'multi-chunk file intact')
  t.alike(await dest.hyperdrive.get(FILE_B), BYTES_B, 'small file intact')
})

function gcm(key, plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = b4a.concat([cipher.update(plain), cipher.final()])
  return { iv, tag: cipher.getAuthTag(), encrypted }
}

function u16(n) {
  const b = b4a.alloc(2)
  b.writeUInt16BE(n, 0)
  return b
}

function u32(n) {
  const b = b4a.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function legacyBackup(version, key, salt) {
  const meta = gcm(
    key,
    b4a.from(
      JSON.stringify({
        version: 1,
        exportedAt: 1,
        notes: [{ key: NOTE_KEY, value: { title: 'Legacy', note: '<p>x</p>' } }],
        folders: [],
        settings: {},
        mediaMap: {}
      })
    )
  )
  const media = gcm(key, BYTES_B)
  const pathBuf = b4a.from(FILE_B)
  return b4a.concat([
    b4a.from('PNBK'),
    u16(version),
    ...(salt ? [salt] : []),
    meta.iv,
    meta.tag,
    u32(meta.encrypted.length),
    meta.encrypted,
    b4a.from([0x01]),
    u16(pathBuf.length),
    pathBuf,
    media.iv,
    media.tag,
    u32(media.encrypted.length),
    media.encrypted,
    b4a.from([0x00])
  ])
}

test('backup - v1 and v2 files written by earlier versions still restore', async (t) => {
  await withTestnet(t)
  const salt = crypto.randomBytes(16)
  const v2 = legacyBackup(2, crypto.pbkdf2Sync(PASSWORD, salt, 210000, 32, 'sha256'), salt)
  const v1 = legacyBackup(1, crypto.createHash('sha256').update(encryption).digest(), null)

  const fromV2 = await openBase(t, b4a.toString(crypto.randomBytes(32), 'hex'))
  await fromV2.importBackup({ buffer: v2, password: PASSWORD })
  t.is((await fromV2.getNote(NOTE_KEY))?.title, 'Legacy', 'v2 note restored')
  t.alike(await fromV2.hyperdrive.get(FILE_B), BYTES_B, 'v2 attachment restored')

  const fromV1 = await openBase(t)
  await fromV1.importBackup({ buffer: v1 })
  t.is((await fromV1.getNote(NOTE_KEY))?.title, 'Legacy', 'v1 note restored')
})

test('backup - the export API refuses to write a backup without a password', async (t) => {
  for (const password of [null, undefined, '']) {
    await t.exception(
      notesApi.exportBackup(password, null),
      new RegExp(BACKUP_ERROR.PASSWORD_REQUIRED),
      `password ${JSON.stringify(password)} refused`
    )
  }
})
