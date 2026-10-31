import test from 'brittle'
import b4a from 'b4a'
import http from 'bare-http1'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { createFirstKeyring, runSealingPass, sealEnvelope } from '../backend/lockRollout.js'
import { closeLockSession, openWithPassword } from '../backend/lockSession.js'
import { envelopeFiles } from '../backend/sealedEnvelope.js'
import { rangeOf } from '../backend/vault/media.js'
import { HYPERDRIVE_URL_PREFIX } from '../constant.js'
import { withTestnet } from './helpers/testnet.js'

const PASSWORD = 'Files-sync-123!'
const HOUR = 60 * 60 * 1000
const key = (fill) => b4a.toString(b4a.alloc(32).fill(fill), 'hex')
const dir = (name) =>
  path.join(tmpdir(), `pn-sealed-files-sync-${name}-${Math.random().toString(36).slice(2)}`)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check, timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true
    await wait(200)
  }
  return false
}

async function pair(host, joiner, name) {
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
    name
  )
  await until(() => hostDone)
  return result
}

async function pairedPair(t) {
  const devices = []
  for (const name of ['mac', 'phone']) {
    const storage = dir(name)
    const base = new NoteBase({ storage, encryption: key(name[0]) })
    await base.ready()
    devices.push({ storage, base })
  }
  t.teardown(async () => {
    closeLockSession()
    for (const d of devices) {
      await d.base.close().catch(() => {})
      fs.rmSync(d.storage, { recursive: true, force: true })
    }
  })
  const [a, b] = devices.map((d) => d.base)
  await a.addSyncedDevice({
    key: key('0'),
    value: { title: 'mac', localKey: a.localKeyHex, updatedAt: 1 }
  })
  t.is(await pair(a, b, 'phone'), 'done', 'phone paired')
  t.ok(
    await until(async () => (await b.getAllSyncedDeviceKeys()).length === 2),
    'both devices listed on the phone'
  )
  return [a, b]
}

function bytes(length, seed = 3) {
  const out = b4a.alloc(length)
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 0xff
  return out
}

const img = (link) => `<img src="${link.replace(/&/g, '&amp;')}">`

function get(base, link) {
  const url = new URL(link.replace(HYPERDRIVE_URL_PREFIX + '/', base.media.address()))
  return new Promise((resolve) => {
    const req = http.request(
      { host: url.hostname, port: Number(url.port), path: url.pathname + url.search },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: b4a.concat(chunks) }))
      }
    )
    req.on('error', (error) => resolve({ status: 0, error }))
    req.end()
  })
}

const present = async (base, link) => (await base.media.missingUrls([link])).size === 0

test(
  'sealed files - a file only on the other device waits, then is encrypted',
  { timeout: 240000 },
  async (t) => {
    await withTestnet(t)
    closeLockSession()
    const [mac, phone] = await pairedPair(t)
    mac.media.setHeld(true)

    const plain = bytes(100000)
    const link = await phone.insertFile({ key: 'n/abc_photo.png', buffer: plain })
    const row = {
      title: 'Trip',
      note: img(link),
      folderKey: '',
      addedAt: 1,
      updatedAt: Date.now() - HOUR,
      locked: true,
      pinned: false
    }
    await phone.addNote({ key: 'n', value: row })
    t.ok(await until(async () => !!(await mac.getNote('n'))), 'mac has the note')
    t.absent(await present(mac, link), 'but not the file')

    await mac.publishLocalSwarmKey()
    const entry = await createFirstKeyring(mac, PASSWORD)
    const sealed = sealEnvelope(entry.id, 'n', row.note, '')
    await mac.addNote({ key: 'n', value: { ...row, note: '', sealed } })

    const waiting = await runSealingPass(mac, { quietMs: 0 })
    t.is(waiting.encrypted, 0, 'nothing to encrypt yet')
    t.is(waiting.waiting, 1, 'one file waits')
    t.alike(
      mac.getFilesWaitingToSeal(),
      [{ noteKey: 'n', link, fileName: '', size: plain.byteLength }],
      'listed for the Storage screen'
    )
    t.alike(
      (await mac.getNotesStorageInfo()).sealWaiting,
      mac.getFilesWaitingToSeal(),
      'and pushed with the storage info'
    )
    t.alike(envelopeFiles((await mac.getNote('n')).sealed), {}, 'and stays plain')

    let downloaded = 0
    mac.on('media-downloaded', () => downloaded++)
    mac.media.setHeld(false)
    t.ok(await until(() => present(mac, link)), 'the download finishes')
    t.ok(await until(() => downloaded > 0), 'and is announced')
    const done = await runSealingPass(mac, { quietMs: 0 })
    t.is(done.encrypted, 1, 'then the file is encrypted')
    t.alike(mac.getFilesWaitingToSeal(), [], 'and leaves the waiting list')
    const [copy] = Object.keys(envelopeFiles((await mac.getNote('n')).sealed))
    t.is(rangeOf(copy).core, mac.media.ownCore, 'into the mac drive')

    t.ok(
      await until(async () => {
        const note = await phone.getNote('n')
        return !!note?.sealed && !!envelopeFiles(note.sealed)[copy]
      }),
      'the phone gets the keyed envelope'
    )
    t.ok(await until(() => present(phone, copy)), 'and downloads the encrypted copy')

    closeLockSession()
    t.is((await get(phone, copy)).status, 404, 'closed: the phone answers 404')
    t.ok(await openWithPassword(await phone.getLockKeyrings(), PASSWORD), 'phone session open')
    const served = await get(phone, copy)
    t.is(served.status, 200, 'the phone serves it from its own envelope')
    t.alike(served.body, plain, 'decrypted')
  }
)
