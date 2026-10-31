// Phase 0 of the HyperDB view migration: a backup that silently drops
// attachments is fine for a routine backup and fatal for a migration, where the
// backup is the only copy that survives the fresh vault.
// See docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md phase 0 and section 2.1.
import test from 'brittle'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Hyperblobs from 'hyperblobs'
import NoteBase from '../backend/NoteBase.js'
import { BACKUP_ERROR } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-strict-export-test-' + Math.random().toString(36).substring(7))

const encryption = b4a.toString(b4a.alloc(32).fill('test-encryption-key'), 'hex')
const MEDIA_BYTES = b4a.from('strict-export-media-bytes')

async function makeBase(t) {
  const storage = getStoragePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  })
  return base
}

// A link to a blob core that does not exist locally and has no peers. The
// export cannot fetch it and cannot wait for it, which is the cheap,
// deterministic version of "the device holding this attachment is gone".
async function unreachableMediaLink(base) {
  const realCore = base.corestore.get({ name: 'ref-shape-only' })
  await realCore.ready()
  const blobRef = await new Hyperblobs(realCore).put(MEDIA_BYTES)
  const strangerKey = crypto.randomBytes(32)
  const link = base.blobServer
    .getLink(strangerKey, { blob: blobRef })
    .replace(base.getHyperdriveAddress(), 'http://hyperdrive/')
  await realCore.close()
  return link
}

test('strict export - succeeds and counts attachments when everything is present', async (t) => {
  await withTestnet(t)
  const base = await makeBase(t)

  const link = await base.insertFile({
    key: `${'local-note'}/image.png`,
    buffer: MEDIA_BYTES
  })
  await base.addNote({
    key: 'local-note',
    value: {
      title: 'Has a local attachment',
      note: `<p>hi</p><img src="${link}">`,
      addedAt: 1000,
      updatedAt: 1000
    }
  })

  const buffer = await base.exportBackup(null, null, (s) => s, null, { strict: true })
  t.ok(b4a.isBuffer(buffer), 'strict export produced a backup')

  const dest = await makeBase(t)
  const summary = await dest.importBackup({ buffer })
  t.is(summary.strictExport, true, 'payload records that this was a strict export')
  t.is(summary.attachmentsExpected, 1, 'payload records the attachment count')
  t.is(
    summary.attachmentsRestored,
    summary.attachmentsExpected,
    'and the file really contains that many'
  )
})

test('strict export - fails, and lists what is missing, when an attachment is unreachable', async (t) => {
  await withTestnet(t)
  const base = await makeBase(t)

  const link = await unreachableMediaLink(base)
  await base.addNote({
    key: 'stranded-note',
    value: {
      title: 'References a blob nobody has',
      note: `<p>hi</p><img src="${link}">`,
      addedAt: 1000,
      updatedAt: 1000
    }
  })

  let error = null
  try {
    await base.exportBackup(null, null, (s) => s, null, { strict: true })
  } catch (e) {
    error = e
  }

  t.ok(error, 'strict export refused to write a backup')
  t.is(error?.message, BACKUP_ERROR.INCOMPLETE, 'and said why')
  t.is(error?.missing?.length, 1, 'one attachment was reported missing')
  t.ok(
    /not replicated/.test(error?.missing?.[0]?.reason || ''),
    'with the reason it could not be fetched'
  )
})

// The control. Without this the test above proves nothing: it could be failing
// because the export is broken rather than because strict mode caught the loss.
test('strict export - control: the same vault exports fine without strict', async (t) => {
  await withTestnet(t)
  const base = await makeBase(t)

  const link = await unreachableMediaLink(base)
  await base.addNote({
    key: 'stranded-note',
    value: {
      title: 'References a blob nobody has',
      note: `<p>hi</p><img src="${link}">`,
      addedAt: 1000,
      updatedAt: 1000
    }
  })

  const buffer = await base.exportBackup()
  t.ok(b4a.isBuffer(buffer), 'a non-strict export still writes a backup')

  const dest = await makeBase(t)
  const summary = await dest.importBackup({ buffer })
  t.is(summary.strictExport, false, 'and it is marked as not strict')
  t.is(summary.attachmentsExpected, 1, 'the payload still says one attachment was referenced')
  t.is(summary.attachmentsRestored, 0, 'but the file contains none - this is the silent loss')
})

test('strict export - a refused export leaves no partial file behind', async (t) => {
  await withTestnet(t)
  const base = await makeBase(t)

  const link = await unreachableMediaLink(base)
  await base.addNote({
    key: 'stranded-note',
    value: {
      title: 'References a blob nobody has',
      note: `<p>hi</p><img src="${link}">`,
      addedAt: 1000,
      updatedAt: 1000
    }
  })

  const filePath = path.join(tmpdir(), 'strict-export-partial-' + Date.now() + '.pnbk')
  try {
    await base.exportBackup(null, filePath, (s) => s, null, { strict: true })
    t.fail('should have refused')
  } catch (e) {
    t.is(e.message, BACKUP_ERROR.INCOMPLETE, 'refused')
  }
  t.absent(fs.existsSync(filePath), 'no half-written backup was left on disk')
})
