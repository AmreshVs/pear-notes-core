import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Hyperblobs from 'hyperblobs'
import NoteBase from '../backend/NoteBase.js'
import { BACKUP_ERROR } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-backup-test-' + Math.random().toString(36).substring(7))

const encryption = b4a.toString(b4a.alloc(32).fill('test-encryption-key'), 'hex')
const wrongEncryption = b4a.toString(b4a.alloc(32).fill('wrong-encryption-key'), 'hex')

let source = null
let sourceStorage = null
let backupBuffer = null

const NOTE_KEY = 'backup-test-note-key'
const FOLDER_KEY = 'backup-test-folder-key'
const MEDIA_BYTES = b4a.from('fake-image-data-for-testing')

let noteContentWithMedia = null

test('backup - setup source instance', async (t) => {
  await withTestnet(t)
  sourceStorage = getStoragePath()
  if (fs.existsSync(sourceStorage)) fs.rmSync(sourceStorage, { recursive: true, force: true })

  source = new NoteBase({ storage: sourceStorage, encryption })
  await source.ready()
  t.ok(source, 'source NoteBase initialized')

  await source.addFolder({
    key: FOLDER_KEY,
    value: { title: 'Backup Folder', addedAt: 1000, updatedAt: 1000 }
  })

  const mediaLink = await source.insertFile({
    key: `${NOTE_KEY}/abc123_media.png`,
    buffer: MEDIA_BYTES,
    path: null
  })
  noteContentWithMedia = `<img src="${mediaLink}">`

  await source.addNote({
    key: NOTE_KEY,
    value: {
      title: 'Backup Note',
      note: noteContentWithMedia,
      folderKey: FOLDER_KEY,
      addedAt: 1000,
      updatedAt: 1000
    }
  })
  await source.updateSettings({
    settings: {
      theme: 'dark',
      fontFamily: 'mono',
      editorFontSize: 14,
      sortBy: 'date',
      colorTheme: 'green'
    }
  })
  t.pass('source data seeded with note and media')
})

test('backup - export produces valid .pnbk buffer with progress', async (t) => {
  await withTestnet(t)
  const steps = []
  const cb = (data) => steps.push(data)

  backupBuffer = await source.exportBackup(null, cb)

  t.ok(b4a.isBuffer(backupBuffer), 'returns a buffer')
  t.ok(backupBuffer.length > 34, 'buffer has meaningful size')
  t.is(b4a.toString(backupBuffer.slice(0, 4)), 'PNBK', 'magic header is PNBK')
  t.is(backupBuffer.readUInt16BE(4), 3, 'version is 3')
  t.is(backupBuffer[6], 2, 'keyed to the vault key')
  t.absent(b4a.toString(backupBuffer).startsWith('{'), 'buffer is not plain JSON')

  t.ok(steps.length > 0, 'progress callback was called')
  t.ok(
    steps.some((s) => s.step === 'reading_data'),
    'reading_data step emitted'
  )
  t.ok(
    steps.some((s) => s.step === 'encrypting_metadata'),
    'encrypting_metadata step emitted'
  )
  t.ok(
    steps.some((s) => s.step === 'processing_media'),
    'processing_media step emitted'
  )
  t.ok(
    steps.some((s) => s.step === 'building_archive'),
    'building_archive step emitted'
  )

  const progresses = steps.map((s) => s.progress)
  t.ok(progresses[0] < progresses[progresses.length - 1], 'progress increases over time')
})

test('backup - import on fresh instance restores notes with progress', async (t) => {
  await withTestnet(t)
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  const steps = []
  await dest.importBackup({ buffer: backupBuffer, cb: (data) => steps.push(data) })
  await dest.autobase.update()

  const note = await dest.getNote(NOTE_KEY)
  t.ok(note, 'note exists after import')
  t.is(note.title, 'Backup Note', 'note title matches')
  t.ok(note.note.includes('http://hyperdrive/'), 'note content contains hyperdrive media URL')
  t.is(note.folderKey, FOLDER_KEY, 'note folderKey matches')

  t.ok(
    steps.some((s) => s.step === 'validating'),
    'validating step emitted'
  )
  t.ok(
    steps.some((s) => s.step === 'decrypting'),
    'decrypting step emitted'
  )
  t.ok(
    steps.some((s) => s.step === 'restoring_notes'),
    'restoring_notes step emitted'
  )

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - import restores folders', async (t) => {
  await withTestnet(t)
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  await dest.importBackup({ buffer: backupBuffer })
  await dest.autobase.update()

  const folder = await dest.getFolder(FOLDER_KEY)
  t.ok(folder, 'folder exists after import')
  t.is(folder.title, 'Backup Folder', 'folder title matches')

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - import restores settings', async (t) => {
  await withTestnet(t)
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  await dest.importBackup({ buffer: backupBuffer })
  await dest.autobase.update()

  const settings = await dest.getSettings()
  t.ok(settings, 'settings exist after import')
  t.is(settings.theme, 'dark', 'settings theme matches')

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - import restores media and note link is intact', async (t) => {
  await withTestnet(t)
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  const steps = []
  await dest.importBackup({ buffer: backupBuffer, cb: (data) => steps.push(data) })
  await dest.autobase.update()

  const entries = []
  for await (const entry of dest.hyperdrive.list('/', { recursive: true })) {
    entries.push(entry)
  }
  t.ok(entries.length > 0, 'hyperdrive has at least one entry after import')
  const restored = await dest.hyperdrive.get(entries[0].key)
  t.alike(restored, MEDIA_BYTES, 'media bytes match original')

  const note = await dest.getNote(NOTE_KEY)
  t.ok(note.note.includes('http://hyperdrive/'), 'note content still contains hyperdrive URL')

  t.unlike(note.note, noteContentWithMedia, 'media URL was remapped to new instance blob key')

  const newLink = await dest.getFile({ key: entries[0].key })
  const newNormalizedUrl = newLink.replace(dest.getHyperdriveAddress(), 'http://hyperdrive/')
  t.ok(note.note.includes(newNormalizedUrl), 'note content URL matches new instance blob URL')

  t.ok(
    steps.some((s) => s.step === 'restoring_media'),
    'restoring_media step emitted'
  )
  t.ok(
    steps.some((s) => s.step === 'remapping_media'),
    'remapping_media step emitted'
  )

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - import remaps &amp;-encoded media URLs in note content', async (t) => {
  await withTestnet(t)
  const ampStorage = getStoragePath()
  const ampSource = new NoteBase({ storage: ampStorage, encryption })
  await ampSource.ready()

  const ampNoteKey = 'amp-note'
  const ampMediaData = b4a.from('amp-test-image-data')
  const rawLink = await ampSource.insertFile({
    key: `${ampNoteKey}/file_img.png`,
    buffer: ampMediaData
  })
  const ampEncodedLink = rawLink.replaceAll('&', '&amp;')

  await ampSource.addNote({
    key: ampNoteKey,
    value: {
      title: 'Amp Note',
      note: `<img src="${ampEncodedLink}">`,
      folderKey: '',
      addedAt: 1000,
      updatedAt: 1000
    }
  })

  const ampBackup = await ampSource.exportBackup()

  const ampDestStorage = getStoragePath()
  const ampDest = new NoteBase({ storage: ampDestStorage, encryption })
  await ampDest.ready()
  await ampDest.importBackup({ buffer: ampBackup })
  await ampDest.autobase.update()

  const note = await ampDest.getNote(ampNoteKey)
  t.ok(note, 'note exists after import')
  t.ok(note.note.includes('&amp;'), 'note content still uses &amp; encoding')

  const oldBlobKey = rawLink.match(/key=([^&]+)/)?.[1]
  t.ok(oldBlobKey, 'parsed old blob key from original link')
  t.absent(note.note.includes(oldBlobKey), 'old blob key is NOT in restored note content')

  const entries = []
  for await (const entry of ampDest.hyperdrive.list('/', { recursive: true })) entries.push(entry)
  t.ok(entries.length > 0, 'media was restored to hyperdrive')

  const newLink = await ampDest.getFile({ key: entries[0].key })
  const newNormalized = newLink.replace(ampDest.getHyperdriveAddress(), 'http://hyperdrive/')
  const newAmpEncoded = newNormalized.replaceAll('&', '&amp;')
  t.ok(
    note.note.includes(newAmpEncoded),
    'note content URL remapped to new instance blob key (amp-encoded)'
  )

  await ampDest.destroy()
  if (fs.existsSync(ampDestStorage)) fs.rmSync(ampDestStorage, { recursive: true, force: true })
  await ampSource.destroy()
  if (fs.existsSync(ampStorage)) fs.rmSync(ampStorage, { recursive: true, force: true })
})

test('backup - export to filePath and import from filePath round-trips', async (t) => {
  await withTestnet(t)
  const backupPath = path.join(
    tmpdir(),
    'pear-notes-backup-' + Math.random().toString(36).slice(7) + '.pnbk'
  )
  const password = 'Str0ng!Passw0rd'

  const returned = await source.exportBackup(password, backupPath)
  t.is(returned, null, 'file export returns null instead of a buffer')
  t.ok(fs.existsSync(backupPath), 'backup file was written to disk')

  const written = fs.readFileSync(backupPath)
  t.is(b4a.toString(written.slice(0, 4)), 'PNBK', 'file starts with PNBK magic')
  t.is(written.readUInt16BE(4), 3, 'version is 3 for password backup')
  t.is(written[6], 1, 'keyed to the password')

  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption: wrongEncryption })
  await dest.ready()

  await dest.importBackup({ filePath: backupPath, password })
  await dest.autobase.update()

  const note = await dest.getNote(NOTE_KEY)
  t.ok(note, 'note restored from file backup')
  t.is(note.title, 'Backup Note', 'note title matches')

  const entries = []
  for await (const entry of dest.hyperdrive.list('/', { recursive: true })) {
    entries.push(entry)
  }
  const restored = await dest.hyperdrive.get(entries[0].key)
  t.alike(restored, MEDIA_BYTES, 'media bytes restored from file backup')

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
  fs.unlinkSync(backupPath)
})

test('backup - wrong encryption key throws on import', async (t) => {
  await withTestnet(t)
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption: wrongEncryption })
  await dest.ready()

  try {
    await dest.importBackup({ buffer: backupBuffer })
    t.fail('should have thrown')
  } catch (e) {
    t.is(e.message, BACKUP_ERROR.INCORRECT_RECOVERY_KEY, 'error code indicates wrong recovery key')
  }

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - password export produces v3 buffer restorable on a different key', async (t) => {
  await withTestnet(t)
  const password = 'Str0ng!Passw0rd'
  const pwBackup = await source.exportBackup(password)
  t.is(pwBackup.readUInt16BE(4), 3, 'version is 3 for password backup')

  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption: wrongEncryption })
  await dest.ready()

  await dest.importBackup({ buffer: pwBackup, password })
  await dest.autobase.update()

  const note = await dest.getNote(NOTE_KEY)
  t.ok(note, 'note restored using password on a different-key device')
  t.is(note.title, 'Backup Note', 'note title matches')

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - wrong password throws INCORRECT_PASSWORD', async (t) => {
  await withTestnet(t)
  const pwBackup = await source.exportBackup('Str0ng!Passw0rd')
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  try {
    await dest.importBackup({ buffer: pwBackup, password: 'WrongPassw0rd!' })
    t.fail('should have thrown')
  } catch (e) {
    t.is(e.message, BACKUP_ERROR.INCORRECT_PASSWORD, 'error code indicates wrong password')
  }

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - password backup without a password throws PASSWORD_REQUIRED', async (t) => {
  await withTestnet(t)
  const pwBackup = await source.exportBackup('Str0ng!Passw0rd')
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  try {
    await dest.importBackup({ buffer: pwBackup })
    t.fail('should have thrown')
  } catch (e) {
    t.is(e.message, BACKUP_ERROR.PASSWORD_REQUIRED, 'error code indicates password required')
  }

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - invalid magic header throws fast', async (t) => {
  await withTestnet(t)
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()

  try {
    await dest.importBackup({ buffer: b4a.from('this is not a pnbk file at all') })
    t.fail('should have thrown')
  } catch (e) {
    t.is(e.message, BACKUP_ERROR.INVALID_FILE, 'error code indicates invalid file')
  }

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - cross-device blobs (note references blob from another drive) are backed up', async (t) => {
  await withTestnet(t)
  const desktopBlobCore = source.corestore.get({
    name: 'desktop-test-blobs',
    encryptionKey: source.media.key
  })
  await desktopBlobCore.ready()
  const desktopBlobs = new Hyperblobs(desktopBlobCore)

  const desktopBytes = b4a.from('desktop-only-file-bytes')
  const blobRef = await desktopBlobs.put(desktopBytes)

  const desktopLink = source.blobServer
    .getLink(desktopBlobCore.key, { blob: blobRef })
    .replace(source.getHyperdriveAddress(), 'http://hyperdrive/')
  const combinedNote = noteContentWithMedia + `<img src="${desktopLink}">`
  await source.addNote({
    key: NOTE_KEY,
    value: {
      title: 'Backup Note',
      note: combinedNote,
      folderKey: FOLDER_KEY,
      addedAt: 1000,
      updatedAt: 1000
    }
  })

  const crossDeviceBackup = await source.exportBackup()
  t.ok(
    crossDeviceBackup.length > backupBuffer.length,
    'cross-device backup is larger (includes desktop blob)'
  )

  await desktopBlobCore.close()
  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()
  await dest.importBackup({ buffer: crossDeviceBackup })
  await dest.autobase.update()

  const entries = []
  for await (const entry of dest.hyperdrive.list('/', { recursive: true })) {
    entries.push(entry)
  }
  t.ok(entries.length >= 2, 'both blobs restored (original + desktop)')

  const bufs = await Promise.all(entries.map((e) => dest.hyperdrive.get(e.key)))
  const allBytes = bufs.map((b) => b4a.toString(b))
  t.ok(allBytes.includes(b4a.toString(MEDIA_BYTES)), 'original media bytes present')
  t.ok(allBytes.includes(b4a.toString(desktopBytes)), 'desktop media bytes present')

  const note = await dest.getNote(NOTE_KEY)
  t.ok(note.note.includes('http://hyperdrive/'), 'note still references hyperdrive URLs')
  t.unlike(note.note, combinedNote, 'URLs were remapped on import')

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

// `append` now rejects a failed write instead of reporting it saved, and the
// restore loop had no per-note handling - so one failure stopped the restore
// partway and nothing after it was written. The pairing merge restores through
// the same loop and deletes its captured copy straight after.
test('backup - one note that fails to save does not stop the rest of the restore', async (t) => {
  await withTestnet(t)
  const partialStorage = getStoragePath()
  const partialSource = new NoteBase({ storage: partialStorage, encryption })
  await partialSource.ready()
  for (const key of ['partial-a', 'partial-b', 'partial-c']) {
    await partialSource.addNote({
      key,
      value: { title: key, note: `<p>${key}</p>`, addedAt: 1000, updatedAt: 1000 }
    })
  }
  const partialBackup = await partialSource.exportBackup()
  await partialSource.destroy()
  if (fs.existsSync(partialStorage)) fs.rmSync(partialStorage, { recursive: true, force: true })

  const destStorage = getStoragePath()
  const dest = new NoteBase({ storage: destStorage, encryption })
  await dest.ready()
  const realAddNote = dest.addNote.bind(dest)
  dest.addNote = async (entry) => {
    if (entry.key === 'partial-b') throw new Error('simulated write failure')
    return realAddNote(entry)
  }

  let error = null
  try {
    await dest.importBackup({ buffer: partialBackup })
  } catch (e) {
    error = e
  }
  await dest.autobase.update()

  t.ok(error, 'the restore still reports that it was incomplete')
  t.is(error?.message, 'Restore incomplete: 1 note could not be saved', 'and says what was lost')
  t.ok(await dest.getNote('partial-a'), 'the note before the failure was restored')
  t.ok(await dest.getNote('partial-c'), 'and so was the note after it')
  t.absent(await dest.getNote('partial-b'), 'only the failing note is missing')

  await dest.destroy()
  if (fs.existsSync(destStorage)) fs.rmSync(destStorage, { recursive: true, force: true })
})

test('backup - teardown source', async (t) => {
  await withTestnet(t)
  await source.destroy()
  if (fs.existsSync(sourceStorage)) fs.rmSync(sourceStorage, { recursive: true, force: true })
  t.pass('source destroyed and cleaned up')
})
